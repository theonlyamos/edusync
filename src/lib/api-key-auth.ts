import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export interface ApiKeyValidationResult {
  valid: boolean;
  error?: string;
  apiKeyId?: string;
  userId?: string;
  apiKeyData?: {
    id: string;
    user_id: string;
    name: string;
    rate_limit_per_hour: number;
    rate_limit_per_day: number;
    total_requests: number;
  };
}

export function generateApiKey(): string {
  const crypto = require('crypto');
  const prefix = 'isk'; // insyte-key
  const randomBytes = crypto.randomBytes(32).toString('hex');
  return `${prefix}_${randomBytes}`;
}

export async function validateApiKey(
  request: NextRequest
): Promise<ApiKeyValidationResult> {
  const apiKey = extractApiKey(request);

  if (!apiKey) {
    return {
      valid: false,
      error: 'Missing API key. Include it in the Authorization header as "Bearer YOUR_API_KEY" or as ?apiKey=YOUR_API_KEY',
    };
  }

  if (!apiKey.startsWith('isk_')) {
    return {
      valid: false,
      error: 'Invalid API key format',
    };
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: apiKeyData, error } = await supabase
    .from('embed_api_keys')
    .select('id, user_id, name, allowed_domains, is_active, expires_at, rate_limit_per_hour, rate_limit_per_day, total_requests, last_used_at')
    .eq('api_key', apiKey)
    .maybeSingle();

  if (error || !apiKeyData) {
    return {
      valid: false,
      error: 'Invalid API key',
    };
  }

  if (!apiKeyData.is_active) {
    return {
      valid: false,
      error: 'API key is disabled',
    };
  }

  if (apiKeyData.expires_at && new Date(apiKeyData.expires_at) < new Date()) {
    return {
      valid: false,
      error: 'API key has expired',
    };
  }

  const origin = request.headers.get('origin') || request.headers.get('referer') || '';
  const domain = extractDomain(origin);

  if (!isDomainAllowed(domain, apiKeyData.allowed_domains)) {
    return {
      valid: false,
      error: `Domain ${domain} is not whitelisted for this API key`,
    };
  }

  const rateLimit = await enforceApiKeyRateLimit(
    supabase,
    apiKeyData.id,
    apiKeyData.rate_limit_per_hour,
    apiKeyData.rate_limit_per_day
  );
  if (!rateLimit.allowed) {
    return {
      valid: false,
      error: rateLimit.error || 'Rate limit exceeded for this API key',
    };
  }

  await updateApiKeyUsage(supabase, apiKeyData.id);

  return {
    valid: true,
    apiKeyId: apiKeyData.id,
    userId: apiKeyData.user_id,
    apiKeyData: {
      id: apiKeyData.id,
      user_id: apiKeyData.user_id,
      name: apiKeyData.name,
      rate_limit_per_hour: apiKeyData.rate_limit_per_hour,
      rate_limit_per_day: apiKeyData.rate_limit_per_day,
      total_requests: apiKeyData.total_requests,
    },
  };
}

function extractApiKey(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  const url = new URL(request.url);
  return url.searchParams.get('apiKey');
}

function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return '';
  }
}

// Pure helper, exported for tests. NULL/empty whitelist = all domains allowed.
export function isDomainAllowed(domain: string, allowedDomains: string[] | null | undefined): boolean {
  if (!allowedDomains || allowedDomains.length === 0) {
    return true;
  }
  return allowedDomains.some((allowedDomain: string) => {
    if (allowedDomain.startsWith('*.')) {
      const baseDomain = allowedDomain.slice(2);
      return domain === baseDomain || domain.endsWith('.' + baseDomain);
    }
    return domain === allowedDomain;
  });
}

async function updateApiKeyUsage(supabase: any, apiKeyId: string) {
  const { error } = await supabase.rpc('record_api_key_usage', {
    p_api_key_id: apiKeyId,
  });
  if (error) {
    console.error('Failed to record API key usage:', error);
  }
}

async function countUsageSince(
  supabase: any,
  apiKeyId: string,
  since: Date
): Promise<number | null> {
  const { count, error } = await supabase
    .from('embed_api_key_usage')
    .select('*', { count: 'exact', head: true })
    .eq('api_key_id', apiKeyId)
    .gte('created_at', since.toISOString());

  if (error) {
    console.error('Failed to count API key usage:', error);
    return null;
  }
  return count ?? 0;
}

// Exported for tests.
export async function enforceApiKeyRateLimit(
  supabase: any,
  apiKeyId: string,
  perHour: number | null,
  perDay: number | null
): Promise<{ allowed: boolean; error?: string }> {
  const now = Date.now();

  if (perHour && perHour > 0) {
    const hourCount = await countUsageSince(supabase, apiKeyId, new Date(now - 60 * 60 * 1000));
    if (hourCount !== null && hourCount >= perHour) {
      return {
        allowed: false,
        error: `Hourly rate limit of ${perHour} requests exceeded for this API key`,
      };
    }
  }

  if (perDay && perDay > 0) {
    const dayCount = await countUsageSince(supabase, apiKeyId, new Date(now - 24 * 60 * 60 * 1000));
    if (dayCount !== null && dayCount >= perDay) {
      return {
        allowed: false,
        error: `Daily rate limit of ${perDay} requests exceeded for this API key`,
      };
    }
  }

  return { allowed: true };
}

export async function checkApiKeyRateLimit(
  apiKeyId: string
): Promise<{ allowed: boolean; error?: string }> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data } = await supabase
    .from('embed_api_keys')
    .select('rate_limit_per_hour, rate_limit_per_day')
    .eq('id', apiKeyId)
    .single();

  if (!data) {
    return { allowed: false, error: 'API key not found' };
  }

  return enforceApiKeyRateLimit(supabase, apiKeyId, data.rate_limit_per_hour, data.rate_limit_per_day);
}

export async function deductCreditsFromApiKey(
  apiKeyId: string,
  userId: string,
  creditsToDeduct: number = 1
): Promise<{ success: boolean; remainingCredits?: number; error?: string }> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Canonical balance is users.credits (the previously-referenced `user_credits`
  // table never existed). Atomic deduction via migration 0032; NULL = insufficient.
  const { data: newAmount, error: deductError } = await supabase.rpc('deduct_user_credits', {
    p_user_id: userId,
    p_amount: creditsToDeduct,
    p_description: `Used ${creditsToDeduct} credit(s) via embed API key`,
    p_session_id: null,
  });

  if (deductError) {
    console.error('deduct_user_credits failed for API key flow:', deductError);
    return { success: false, error: 'Failed to deduct credits' };
  }

  if (newAmount === null || newAmount === undefined) {
    const { data: userData } = await supabase
      .from('users')
      .select('credits')
      .eq('id', userId)
      .maybeSingle();
    return {
      success: false,
      remainingCredits: userData?.credits ?? 0,
      error: 'Insufficient credits',
    };
  }

  const { error: minutesError } = await supabase.rpc('increment_api_key_minutes', {
    p_api_key_id: apiKeyId,
    p_minutes: creditsToDeduct,
  });
  if (minutesError) {
    console.error('Failed to increment API key minutes used:', minutesError);
  }

  return {
    success: true,
    remainingCredits: newAmount,
  };
}

