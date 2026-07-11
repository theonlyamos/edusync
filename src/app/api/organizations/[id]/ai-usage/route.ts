import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getServerSession } from '@/lib/auth';
import { lessonArtifactErrorResponse, LessonArtifactHttpError } from '@/lib/lesson-artifacts/server';
import { createServerSupabase } from '@/lib/supabase.server';

const quotaSchema = z.object({
  monthlyInteractiveLimit: z.number().int().nonnegative().nullable(),
  monthlyImageLimit: z.number().int().nonnegative().nullable(),
  monthlyQuizLimit: z.number().int().nonnegative().nullable(),
  monthlyMediaBytesLimit: z.number().int().nonnegative().nullable(),
  monthlyStudentFallbackLimit: z.number().int().nonnegative().nullable(),
  allowStudentFallback: z.boolean(),
});

async function requireOrganizationAdmin(organizationId: string) {
  const session = await getServerSession();
  if (!session?.user?.id) throw new LessonArtifactHttpError(401, 'Sign in required');
  const supabase = createServerSupabase();
  const { data: membership, error } = await supabase.from('organization_members').select('role,is_active').eq('organization_id', organizationId).eq('user_id', session.user.id).maybeSingle();
  if (error) throw error;
  if (!membership?.is_active || !['owner', 'admin'].includes(membership.role)) {
    throw new LessonArtifactHttpError(403, 'Organization admin access required');
  }
  return { session, supabase };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: organizationId } = await params;
    const { supabase } = await requireOrganizationAdmin(organizationId);
    const periodStart = new Date();
    periodStart.setUTCDate(1); periodStart.setUTCHours(0, 0, 0, 0);
    const [{ data: quota, error: quotaError }, { data: usage, error: usageError }] = await Promise.all([
      supabase.from('organization_ai_quotas').select('*').eq('organization_id', organizationId).maybeSingle(),
      supabase.from('organization_ai_usage').select('category,quantity').eq('organization_id', organizationId).gte('created_at', periodStart.toISOString()),
    ]);
    if (quotaError) throw quotaError;
    if (usageError) throw usageError;
    const totals = (usage ?? []).reduce((result: Record<string, number>, row: any) => {
      result[row.category] = (result[row.category] ?? 0) + Number(row.quantity);
      return result;
    }, {});
    return NextResponse.json({ periodStart: periodStart.toISOString(), quota, usage: totals });
  } catch (error) {
    return lessonArtifactErrorResponse(error);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: organizationId } = await params;
    const { session, supabase } = await requireOrganizationAdmin(organizationId);
    const input = quotaSchema.parse(await request.json());
    const { data, error } = await supabase.from('organization_ai_quotas').upsert({
      organization_id: organizationId,
      monthly_interactive_limit: input.monthlyInteractiveLimit,
      monthly_image_limit: input.monthlyImageLimit,
      monthly_quiz_limit: input.monthlyQuizLimit,
      monthly_media_bytes_limit: input.monthlyMediaBytesLimit,
      monthly_student_fallback_limit: input.monthlyStudentFallbackLimit,
      allow_student_fallback: input.allowStudentFallback,
      updated_by: session.user.id,
      updated_at: new Date().toISOString(),
    }).select('*').single();
    if (error) throw error;
    return NextResponse.json({ quota: data });
  } catch (error) {
    return lessonArtifactErrorResponse(error);
  }
}
