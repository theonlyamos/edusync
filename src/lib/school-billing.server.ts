import 'server-only';

import { createServerSupabase } from '@/lib/supabase.server';
import {
  isSchoolManagerRole,
  monthStartUtc,
  netUsageByKind,
  schoolBalance,
  summarizeAuthoringUsage,
  type AuthoringUsage,
  type SchoolBalance,
} from '@/lib/school-billing';

type Supabase = ReturnType<typeof createServerSupabase>;

export type SchoolMembership = {
  role: string;
  school: {
    id: string;
    name: string;
    credits: number | null;
    trial_credits: number | null;
    trial_expires_at: string | null;
    total_credits_purchased: number | null;
    total_credits_used: number | null;
  };
};

/** The caller's active school membership with the school's credit columns, or null. */
export async function getSchoolBillingMembership(supabase: Supabase, userId: string): Promise<SchoolMembership | null> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('role, organizations!inner(id, name, type, credits, trial_credits, trial_expires_at, total_credits_purchased, total_credits_used)')
    .eq('user_id', userId)
    .eq('is_active', true)
    .eq('organizations.type', 'school')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const school = (Array.isArray(data.organizations) ? data.organizations[0] : data.organizations) as SchoolMembership['school'] | undefined;
  return school ? { role: data.role as string, school } : null;
}

export async function getAuthoringUsage(supabase: Supabase, schoolId: string, now = new Date()): Promise<AuthoringUsage> {
  const period = monthStartUtc(now).toISOString().slice(0, 10);
  const [{ data: rows, error }, { data: quota, error: quotaError }] = await Promise.all([
    supabase
      .from('organization_ai_usage')
      .select('category, quantity, reference_id, credits_charged, refunded_at')
      .eq('organization_id', schoolId)
      .eq('period_start', period)
      .in('category', ['interactive_generation', 'image_generation']),
    supabase
      .from('organization_ai_quotas')
      .select('free_interactive_allowance, free_image_allowance')
      .eq('organization_id', schoolId)
      .maybeSingle(),
  ]);
  if (error) throw error;
  if (quotaError) throw quotaError;
  return summarizeAuthoringUsage(rows ?? [], quota);
}

async function schoolUsageThisMonth(supabase: Supabase, schoolId: string, userId: string | null, now: Date) {
  let query = supabase
    .from('organization_credit_transactions')
    .select('transaction_type, usage_kind, credits')
    .eq('organization_id', schoolId)
    .in('transaction_type', ['usage', 'refund'])
    .gte('created_at', monthStartUtc(now).toISOString())
    .limit(5000);
  if (userId) query = query.eq('user_id', userId);
  const { data, error } = await query;
  if (error) throw error;
  return netUsageByKind(data ?? []);
}

async function personalVoiceMinutesThisMonth(supabase: Supabase, userId: string, now: Date) {
  const { data, error } = await supabase
    .from('credit_transactions')
    .select('transaction_type, credits, description')
    .eq('user_id', userId)
    .in('transaction_type', ['usage', 'refund'])
    .gte('created_at', monthStartUtc(now).toISOString())
    .limit(5000);
  if (error) throw error;
  let minutes = 0;
  for (const row of data ?? []) {
    // Personal ledger rows have no kind column; voice rows say so in their description.
    if (String(row.description ?? '').includes('voice')) minutes -= row.credits;
  }
  return Math.max(0, minutes);
}

export type CreditSummary = {
  payer: 'school' | 'personal';
  role: string | null;
  school: null | {
    id: string;
    name: string;
    balance: SchoolBalance;
    canManage: boolean;
  };
  personalCredits: number;
  /** Minutes of live AI the caller used this calendar month (UTC). */
  myUsage: { voiceMinutes: number; liveClassMinutes: number };
  /** Lesson visual/image allowance; only for teachers and school admins. */
  authoring: AuthoringUsage | null;
};

/** What the dashboard credit widgets show for one person. */
export async function getCreditSummary(userId: string, now = new Date()): Promise<CreditSummary> {
  const supabase = createServerSupabase();
  const [membership, { data: user, error: userError }] = await Promise.all([
    getSchoolBillingMembership(supabase, userId),
    supabase.from('users').select('credits').eq('id', userId).maybeSingle(),
  ]);
  if (userError) throw userError;
  const personalCredits = Math.max(0, (user as { credits?: number | null } | null)?.credits ?? 0);

  if (!membership) {
    return {
      payer: 'personal',
      role: null,
      school: null,
      personalCredits,
      myUsage: { voiceMinutes: await personalVoiceMinutesThisMonth(supabase, userId, now), liveClassMinutes: 0 },
      authoring: null,
    };
  }

  const { role, school } = membership;
  const showsAuthoring = role === 'teacher' || isSchoolManagerRole(role);
  const [usage, authoring] = await Promise.all([
    schoolUsageThisMonth(supabase, school.id, userId, now),
    showsAuthoring ? getAuthoringUsage(supabase, school.id, now) : Promise.resolve(null),
  ]);

  return {
    payer: 'school',
    role,
    school: {
      id: school.id,
      name: school.name,
      balance: schoolBalance(school, now),
      canManage: isSchoolManagerRole(role),
    },
    personalCredits,
    myUsage: { voiceMinutes: usage.voice, liveClassMinutes: usage.live_class },
    authoring,
  };
}

export type SchoolBillingDetails = {
  balance: SchoolBalance;
  totalPurchased: number;
  authoring: AuthoringUsage;
  usageThisMonth: ReturnType<typeof netUsageByKind>;
  transactions: Array<{
    id: string;
    type: string;
    usageKind: string | null;
    credits: number;
    balanceAfter: number;
    description: string;
    createdAt: string;
    userName: string | null;
  }>;
};

/** Everything the school billing tab shows. Callers must check the person manages this school. */
export async function getSchoolBillingDetails(schoolId: string, now = new Date()): Promise<SchoolBillingDetails | null> {
  const supabase = createServerSupabase();
  const { data: school, error } = await supabase
    .from('organizations')
    .select('id, credits, trial_credits, trial_expires_at, total_credits_purchased')
    .eq('id', schoolId)
    .eq('type', 'school')
    .maybeSingle();
  if (error) throw error;
  if (!school) return null;

  const [authoring, usageThisMonth, { data: rows, error: rowsError }] = await Promise.all([
    getAuthoringUsage(supabase, schoolId, now),
    schoolUsageThisMonth(supabase, schoolId, null, now),
    supabase
      .from('organization_credit_transactions')
      .select('id, transaction_type, usage_kind, credits, balance_after, description, created_at, user_id')
      .eq('organization_id', schoolId)
      .order('created_at', { ascending: false })
      .limit(30),
  ]);
  if (rowsError) throw rowsError;

  const userIds = [...new Set((rows ?? []).map((row) => row.user_id).filter((v): v is string => Boolean(v)))];
  const names = new Map<string, string>();
  if (userIds.length) {
    const { data: users, error: usersError } = await supabase.from('users').select('id, name, email').in('id', userIds);
    if (usersError) throw usersError;
    for (const u of users ?? []) names.set(u.id, (u.name as string | null) || (u.email as string | null) || 'Someone');
  }

  return {
    balance: schoolBalance(school, now),
    totalPurchased: school.total_credits_purchased ?? 0,
    authoring,
    usageThisMonth,
    transactions: (rows ?? []).map((row) => ({
      id: row.id,
      type: row.transaction_type,
      usageKind: row.usage_kind,
      credits: row.credits,
      balanceAfter: row.balance_after,
      description: row.description,
      createdAt: row.created_at,
      userName: row.user_id ? names.get(row.user_id) ?? null : null,
    })),
  };
}

export type LiveClassBillResult = {
  status: 'charged' | 'prepaid' | 'insufficient_credits' | 'not_found';
  remainingCredits: number;
  paidUntil: string | null;
  payer: 'school' | 'personal' | null;
};

/** Pays the next minute of a live class room session when its paid time is about to end. */
export async function billLiveClassMinute(sessionId: string): Promise<LiveClassBillResult> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc('bill_live_class_minute', { p_session_id: sessionId, p_lead_seconds: 30 });
  if (error) throw new Error(`bill_live_class_minute failed: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as {
    status: string;
    remaining_credits: number | null;
    paid_until: string | null;
    payer: string | null;
  } | null;
  if (!row) throw new Error('bill_live_class_minute returned no row');
  if (!['charged', 'prepaid', 'insufficient_credits', 'not_found'].includes(row.status)) {
    throw new Error(`bill_live_class_minute returned unknown status ${row.status}`);
  }
  return {
    status: row.status as LiveClassBillResult['status'],
    remainingCredits: row.remaining_credits ?? 0,
    paidUntil: row.paid_until,
    payer: row.payer === 'school' || row.payer === 'personal' ? row.payer : null,
  };
}

/** Credits a completed Stripe checkout to a school. Returns false if the school does not exist. */
export async function addSchoolPurchase(input: {
  schoolId: string;
  credits: number;
  userId: string | null;
  paymentIntentId: string | null;
}): Promise<boolean> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc('add_school_credits', {
    p_organization_id: input.schoolId,
    p_amount: input.credits,
    p_type: 'purchase',
    p_description: `Purchased ${input.credits} credits`,
    p_user_id: input.userId,
    p_payment_intent_id: input.paymentIntentId,
    p_usage_kind: null,
    p_reference_id: null,
  });
  if (error) {
    // 23505: this payment was already credited (Stripe retried the webhook).
    if (error.code === '23505') return true;
    throw new Error(`add_school_credits failed: ${error.message}`);
  }
  return data !== null && data !== undefined;
}
