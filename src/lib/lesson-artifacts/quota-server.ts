import 'server-only';

import { createServerSupabase } from '@/lib/supabase.server';

import type { OrganizationAiUsageCategory } from './quota';
import { LessonArtifactHttpError } from './server';

export async function reserveOrganizationAiUsage(input: {
  userId: string;
  category: OrganizationAiUsageCategory;
  quantity: number;
  referenceId: string;
  organizationId?: string | null;
}) {
  if (!input.organizationId) return null;
  const supabase = createServerSupabase();
  const { data: membership, error: membershipError } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('organization_id', input.organizationId)
    .eq('user_id', input.userId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership) throw new LessonArtifactHttpError(403, 'You are not an active member of this lesson organization');

  if (input.category === 'student_fallback') {
    const { data: quota, error: quotaError } = await supabase
      .from('organization_ai_quotas')
      .select('allow_student_fallback')
      .eq('organization_id', membership.organization_id)
      .maybeSingle();
    if (quotaError) throw quotaError;
    if (quota?.allow_student_fallback === false) {
      throw new LessonArtifactHttpError(403, 'Your organization has disabled student-generated fallback content');
    }
  }

  const { data, error } = await supabase.rpc('reserve_organization_ai_usage', {
    p_organization_id: membership.organization_id,
    p_user_id: input.userId,
    p_category: input.category,
    p_quantity: input.quantity,
    p_reference_id: input.referenceId,
  });
  if (error) throw error;
  return { organizationId: membership.organization_id, reservation: data };
}

export async function reserveOrganizationAiUsageBatch(input: {
  userId: string;
  items: Array<{ category: OrganizationAiUsageCategory; quantity: number; referenceId: string }>;
  organizationId?: string | null;
}) {
  if (!input.items.length || !input.organizationId) return null;
  const supabase = createServerSupabase();
  const { data: membership, error: membershipError } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('organization_id', input.organizationId)
    .eq('user_id', input.userId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership) throw new LessonArtifactHttpError(403, 'You are not an active member of this lesson organization');
  const { error } = await supabase.rpc('reserve_organization_ai_usage_batch', {
    p_organization_id: membership.organization_id,
    p_user_id: input.userId,
    p_items: input.items,
  });
  if (error) throw error;
  return { organizationId: membership.organization_id };
}
