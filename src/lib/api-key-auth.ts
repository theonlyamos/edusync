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

  if (apiKeyData.allowed_domains && apiKeyData.allowed_domains.length > 0) {
    const domainAllowed = apiKeyData.allowed_domains.some((allowedDomain: string) => {
      if (allowedDomain.startsWith('*.')) {
        const baseDomain = allowedDomain.slice(2);
        return domain.endsWith(baseDomain);
      }
      return domain === allowedDomain;
    });

    if (!domainAllowed) {
      return {
        valid: false,
        error: `Domain ${domain} is not whitelisted for this API key`,
      };
    }
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

async function updateApiKeyUsage(supabase: any, apiKeyId: string) {
  await supabase
    .from('embed_api_keys')
    .update({
      last_used_at: new Date().toISOString(),
      total_requests: supabase.rpc('increment', { row_id: apiKeyId }),
    })
    .eq('id', apiKeyId);
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
    .select('rate_limit_per_hour, rate_limit_per_day, last_used_at')
    .eq('id', apiKeyId)
    .single();

  if (!data) {
    return { allowed: false, error: 'API key not found' };
  }

  return { allowed: true };
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

  const { data: currentCredits, error: fetchError } = await supabase
    .from('user_credits')
    .select('credits')
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchError) {
    return { success: false, error: 'Failed to fetch credits' };
  }

  const currentAmount = currentCredits?.credits || 0;

  if (currentAmount < creditsToDeduct) {
    return {
      success: false,
      remainingCredits: currentAmount,
      error: 'Insufficient credits',
    };
  }

  const newAmount = currentAmount - creditsToDeduct;

  const { error: updateError } = await supabase
    .from('user_credits')
    .update({ credits: newAmount })
    .eq('user_id', userId);

  if (updateError) {
    return { success: false, error: 'Failed to deduct credits' };
  }

  await supabase
    .from('embed_api_keys')
    .update({
      total_minutes_used: supabase.rpc('increment', { row_id: apiKeyId }),
    })
    .eq('id', apiKeyId);

  return {
    success: true,
    remainingCredits: newAmount,
  };
}

