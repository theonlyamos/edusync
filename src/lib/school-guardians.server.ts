import 'server-only';
import type { SchoolRecord, ServiceSupabase } from '@/lib/school-access.server';
import { isValidEmail, normalizeEmail } from '@/lib/school-people';
import { PARENT_LINK_ROLE, PeopleError, isActivated, issueAccountLink, revokeAccountLinks, type LinkResult, type PeopleContext } from '@/lib/school-people.server';
import { emptyAttendance, shiftDay, subjectResults, type AttendanceTotals, type ReportCard, type SubjectResult } from '@/lib/school-records';
import { attendanceTotals, studentMarks, studentReportCards, todayAtSchool } from '@/lib/school-records.server';

/*
 * Parents and guardians. A school administrator adds a parent by email and
 * picks the student they follow. The parent gets a plain account (not a
 * school member) with an activation link, and a read-only portal showing
 * that student's attendance, marks and shared report cards.
 */

export type SchoolGuardian = {
  guardianId: string;
  name: string;
  email: string;
  activated: boolean;
  children: { linkId: string; studentId: string; name: string }[];
};

const MAX_GUARDIANS_PER_STUDENT = 4;
const MAX_CHILDREN_PER_GUARDIAN = 12;

async function userNames(supabase: ServiceSupabase, ids: string[]): Promise<Map<string, { name: string; email: string }>> {
  const out = new Map<string, { name: string; email: string }>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase.from('users').select('id, name, email').in('id', ids.slice(i, i + 100));
    if (error) throw error;
    for (const user of data ?? []) {
      const email = String(user.email ?? '');
      out.set(user.id as string, { name: (user.name as string | null)?.trim() || email || 'Unknown', email });
    }
  }
  return out;
}

/** Every parent the school has added, with the students they follow. */
export async function listSchoolGuardians(supabase: ServiceSupabase, schoolId: string): Promise<SchoolGuardian[]> {
  const { data: links, error } = await supabase
    .from('student_guardians')
    .select('id, student_id, guardian_id')
    .eq('organization_id', schoolId)
    .order('created_at')
    .limit(5000);
  if (error) throw error;
  if (!links?.length) return [];
  const people = await userNames(supabase, [...new Set(links.flatMap((link) => [link.student_id as string, link.guardian_id as string]))]);
  const guardians = new Map<string, SchoolGuardian>();
  for (const link of links) {
    const id = link.guardian_id as string;
    const person = people.get(id);
    const guardian = guardians.get(id) ?? { guardianId: id, name: person?.name ?? 'Unknown', email: person?.email ?? '', activated: false, children: [] };
    guardian.children.push({ linkId: link.id as string, studentId: link.student_id as string, name: people.get(link.student_id as string)?.name ?? 'Student' });
    guardians.set(id, guardian);
  }
  // Activated = one of their links was used.
  const emails = [...guardians.values()].map((g) => g.email.toLowerCase()).filter(Boolean);
  const used = new Set<string>();
  for (let i = 0; i < emails.length; i += 100) {
    const { data, error: linkError } = await supabase
      .from('organization_invitations')
      .select('email')
      .eq('organization_id', schoolId)
      .eq('role', PARENT_LINK_ROLE)
      .in('email', emails.slice(i, i + 100))
      .not('accepted_at', 'is', null);
    if (linkError) throw linkError;
    for (const row of data ?? []) used.add(row.email as string);
  }
  return [...guardians.values()]
    .map((guardian) => ({ ...guardian, activated: used.has(guardian.email.toLowerCase()) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type NewGuardian = { name: string; email: string; studentId: string };

export function parseNewGuardian(input: unknown): NewGuardian {
  const body = (input ?? {}) as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.replace(/\s+/g, ' ').trim() : '';
  const email = normalizeEmail(body.email);
  if (!name || name.length > 120) throw new PeopleError('Give the parent’s name', 400);
  if (!isValidEmail(email)) throw new PeopleError('Enter a valid email address', 400);
  if (typeof body.studentId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.studentId)) throw new PeopleError('Pick a student', 400);
  return { name, email, studentId: body.studentId };
}

/** Whether this school earlier gave this email a parent account that the parent then activated. */
async function wasParentHere(supabase: ServiceSupabase, schoolId: string, email: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('organization_invitations')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', schoolId)
    .eq('email', email.toLowerCase())
    .eq('role', PARENT_LINK_ROLE)
    .not('accepted_at', 'is', null);
  if (error) throw error;
  return Boolean(count);
}

/**
 * Links a parent to a student. A new email gets a new account and an
 * activation link. An email the school already added as a parent is linked to
 * the extra student. Any other existing account is refused, so a school can
 * never attach a student's records to somebody's account without their say.
 */
export async function addGuardian(context: PeopleContext, input: NewGuardian): Promise<{ guardianId: string; created: boolean; link?: LinkResult }> {
  const { supabase, school, actor } = context;

  const { data: student, error: studentError } = await supabase
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', school.id)
    .eq('user_id', input.studentId)
    .eq('role', 'student')
    .eq('is_active', true)
    .maybeSingle();
  if (studentError) throw studentError;
  if (!student) throw new PeopleError('Pick a student at your school', 400);

  const { count: already, error: countError } = await supabase.from('student_guardians').select('id', { count: 'exact', head: true }).eq('student_id', input.studentId);
  if (countError) throw countError;
  if ((already ?? 0) >= MAX_GUARDIANS_PER_STUDENT) throw new PeopleError(`A student can have up to ${MAX_GUARDIANS_PER_STUDENT} parents`, 409);

  const { data: existing, error: lookupError } = await supabase.from('users').select('id').eq('email', input.email).maybeSingle();
  if (lookupError) throw lookupError;

  let guardianId: string;
  let created = false;
  if (existing) {
    guardianId = existing.id as string;
    const { data: links, error } = await supabase.from('student_guardians').select('student_id').eq('organization_id', school.id).eq('guardian_id', guardianId).limit(MAX_CHILDREN_PER_GUARDIAN + 1);
    if (error) throw error;
    // An account with no students here is only ours to link if this school made it as a parent account.
    if (!links?.length && !(await wasParentHere(supabase, school.id, input.email))) {
      throw new PeopleError('An InsyteAI account already uses this email. Use a different email address for the parent.', 409);
    }
    if (links?.some((link) => link.student_id === input.studentId)) throw new PeopleError('This parent already follows that student', 409);
    if ((links?.length ?? 0) >= MAX_CHILDREN_PER_GUARDIAN) throw new PeopleError(`A parent can follow up to ${MAX_CHILDREN_PER_GUARDIAN} students`, 409);
  } else {
    const { data: made, error: createError } = await supabase.auth.admin.createUser({ email: input.email, email_confirm: true, user_metadata: { name: input.name } });
    if (createError || !made?.user) {
      if (createError && /already|exists|registered/i.test(createError.message)) throw new PeopleError('An InsyteAI account already uses this email. Use a different email address for the parent.', 409);
      throw createError ?? new Error('No user returned');
    }
    guardianId = made.user.id;
    created = true;
    const { error: profileError } = await supabase.from('users').upsert({ id: guardianId, email: input.email, name: input.name, role: 'learner', credits: 0 }, { onConflict: 'id' });
    if (profileError) {
      await supabase.auth.admin.deleteUser(guardianId);
      throw profileError;
    }
  }

  const { error: linkError } = await supabase.from('student_guardians').insert({ organization_id: school.id, student_id: input.studentId, guardian_id: guardianId, created_by: actor.id });
  if (linkError) {
    if (created) {
      await supabase.from('users').delete().eq('id', guardianId);
      await supabase.auth.admin.deleteUser(guardianId);
    }
    if (linkError.code === '23505') throw new PeopleError('This parent already follows that student', 409);
    throw linkError;
  }

  if (!created) return { guardianId, created };
  try {
    const link = await issueAccountLink(context, { email: input.email, name: input.name, role: PARENT_LINK_ROLE, gradeLevel: null }, 'activate');
    return { guardianId, created, link };
  } catch (error) {
    console.error('Could not issue an activation link for a new parent account:', error);
    return { guardianId, created, link: { emailed: false, expiresAt: '', linkFailed: true } as LinkResult };
  }
}

async function guardianOfSchool(supabase: ServiceSupabase, schoolId: string, guardianId: string): Promise<{ email: string; name: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(guardianId)) throw new PeopleError('Parent not found', 404);
  const { count, error } = await supabase.from('student_guardians').select('id', { count: 'exact', head: true }).eq('organization_id', schoolId).eq('guardian_id', guardianId);
  if (error) throw error;
  if (!count) throw new PeopleError('Parent not found', 404);
  const person = (await userNames(supabase, [guardianId])).get(guardianId);
  if (!person?.email) throw new PeopleError('Parent not found', 404);
  return person;
}

/** Sends the parent a fresh link: activation if they never signed in, otherwise a new password. */
export async function resendGuardianLink(context: PeopleContext, guardianId: string): Promise<LinkResult & { kind: 'activate' | 'reset' }> {
  const person = await guardianOfSchool(context.supabase, context.school.id, guardianId);
  const kind = (await isActivated(context.supabase, context.school.id, person.email.toLowerCase())) ? 'reset' : 'activate';
  const link = await issueAccountLink(context, { email: person.email, name: person.name, role: PARENT_LINK_ROLE, gradeLevel: null }, kind);
  return { ...link, kind };
}

/**
 * Stops a parent following one student (`linkId`). When that was their last
 * student here and they never activated the account, the unused account is
 * removed too, so the email can be used again.
 */
export async function removeGuardianLink(supabase: ServiceSupabase, school: Pick<SchoolRecord, 'id'>, linkId: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(linkId)) throw new PeopleError('Parent not found', 404);
  const { data: link, error } = await supabase.from('student_guardians').select('id, guardian_id').eq('id', linkId).eq('organization_id', school.id).maybeSingle();
  if (error) throw error;
  if (!link) throw new PeopleError('Parent not found', 404);
  const guardianId = link.guardian_id as string;
  const person = (await userNames(supabase, [guardianId])).get(guardianId);

  const { error: removeError } = await supabase.from('student_guardians').delete().eq('id', linkId).eq('organization_id', school.id);
  if (removeError) throw removeError;

  const { count: left, error: leftError } = await supabase.from('student_guardians').select('id', { count: 'exact', head: true }).eq('guardian_id', guardianId);
  if (leftError) throw leftError;
  if (left || !person?.email) return;
  const email = person.email.toLowerCase();
  const activated = await isActivated(supabase, school.id, email);
  await revokeAccountLinks(supabase, school.id, email);
  if (activated) return;
  // Never used: only remove it if it is still the bare account we created.
  const [{ count: memberships }, { data: user }] = await Promise.all([
    supabase.from('organization_members').select('id', { count: 'exact', head: true }).eq('user_id', guardianId),
    supabase.from('users').select('role').eq('id', guardianId).maybeSingle(),
  ]);
  if (memberships || user?.role !== 'learner') return;
  const { data: auth } = await supabase.auth.admin.getUserById(guardianId);
  if (auth?.user?.last_sign_in_at) return;
  await supabase.from('users').delete().eq('id', guardianId);
  const { error: deleteError } = await supabase.auth.admin.deleteUser(guardianId);
  if (deleteError) console.error('Could not remove an unused parent account:', deleteError);
}

// ---------------------------------------------------------------------------
// The parent's side
// ---------------------------------------------------------------------------

export type ParentChild = {
  studentId: string;
  name: string;
  schoolId: string;
  schoolName: string;
  className: string | null;
  grade: string | null;
  attendance: AttendanceTotals;
  subjects: SubjectResult[];
  overall: number | null;
  cards: ReportCard[];
};

type GuardianLink = { student_id: string; organization_id: string };

async function guardianLinks(supabase: ServiceSupabase, guardianId: string): Promise<GuardianLink[]> {
  const { data, error } = await supabase.from('student_guardians').select('student_id, organization_id').eq('guardian_id', guardianId).limit(MAX_CHILDREN_PER_GUARDIAN * 4);
  if (error) throw error;
  return (data ?? []) as GuardianLink[];
}

/** Whether this account follows any student (decides if the parent portal is their home). */
export async function isGuardian(supabase: ServiceSupabase, userId: string): Promise<boolean> {
  const { count, error } = await supabase.from('student_guardians').select('id', { count: 'exact', head: true }).eq('guardian_id', userId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/** The students a parent follows, each with the last 90 days of attendance and marks and their shared report cards. */
export async function parentChildren(supabase: ServiceSupabase, guardianId: string): Promise<ParentChild[]> {
  const links = await guardianLinks(supabase, guardianId);
  if (links.length === 0) return [];
  const schoolIds = [...new Set(links.map((link) => link.organization_id))];
  const { data: schools, error } = await supabase.from('organizations').select('id, name, timezone, is_active').in('id', schoolIds).eq('type', 'school');
  if (error) throw error;
  const schoolOf = new Map((schools ?? []).filter((s) => s.is_active).map((s) => [s.id as string, s as { id: string; name: string; timezone: string | null }]));
  const names = await userNames(supabase, links.map((link) => link.student_id));

  const children: ParentChild[] = [];
  for (const link of links) {
    const school = schoolOf.get(link.organization_id);
    if (!school) continue;
    const today = todayAtSchool(school);
    const from = shiftDay(today, -90);
    const [attendance, marks, cards, klass] = await Promise.all([
      attendanceTotals(supabase, school.id, [link.student_id], from, today),
      studentMarks(supabase, school, [link.student_id], from, today),
      studentReportCards(supabase, school.id, link.student_id),
      supabase.from('school_class_students').select('school_classes!inner(name, grade)').eq('student_id', link.student_id).eq('organization_id', school.id).limit(1).maybeSingle(),
    ]);
    if (klass.error) throw klass.error;
    const found = (Array.isArray(klass.data?.school_classes) ? klass.data?.school_classes[0] : klass.data?.school_classes) as { name: string; grade: string } | undefined;
    children.push({
      studentId: link.student_id,
      name: names.get(link.student_id)?.name ?? 'Student',
      schoolId: school.id,
      schoolName: school.name,
      className: found?.name ?? null,
      grade: found?.grade ?? null,
      attendance: attendance.get(link.student_id) ?? emptyAttendance(),
      ...subjectResults(marks),
      cards,
    });
  }
  return children.sort((a, b) => a.name.localeCompare(b.name));
}

/** A shared report card, for a parent who follows its student. */
export async function parentReportCard(supabase: ServiceSupabase, guardianId: string, cardId: string): Promise<{ card: ReportCard; schoolId: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(cardId)) return null;
  const links = await guardianLinks(supabase, guardianId);
  for (const link of links) {
    const cards = await studentReportCards(supabase, link.organization_id, link.student_id);
    const card = cards.find((c) => c.id === cardId);
    if (card) return { card, schoolId: link.organization_id };
  }
  return null;
}
