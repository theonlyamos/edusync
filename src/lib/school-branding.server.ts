import type { ServiceSupabase } from '@/lib/school-access.server';
import {
  LOGO_BUCKET,
  LOGO_MAX_BYTES,
  DEFAULT_BRANDING,
  DEFAULT_PRESET_ID,
  PRIMARY_MIN_CONTRAST,
  brandingColors,
  readStoredBranding,
  readableTokens,
  type SchoolBranding,
} from '@/lib/school-branding';

export type BrandingResponse = {
  school: { id: string; name: string };
  branding: Omit<SchoolBranding, 'logoPath'> & { logoUrl: string | null };
};

/** The school's stored branding, cleaned up, plus the public URL of its logo. */
export async function loadSchoolBranding(supabase: ServiceSupabase, school: { id: string; name: string }): Promise<BrandingResponse> {
  const branding = await readRawBranding(supabase, school.id);
  return { school: { id: school.id, name: school.name }, branding: publicBranding(supabase, branding) };
}

export async function readRawBranding(supabase: ServiceSupabase, schoolId: string): Promise<SchoolBranding> {
  const { data, error } = await supabase.from('organizations').select('branding').eq('id', schoolId).maybeSingle();
  if (error) throw error;
  return readStoredBranding(data?.branding, schoolId);
}

export function publicBranding(supabase: ServiceSupabase, branding: SchoolBranding): BrandingResponse['branding'] {
  const { logoPath, ...rest } = branding;
  return { ...rest, logoUrl: logoPath ? supabase.storage.from(LOGO_BUCKET).getPublicUrl(logoPath).data.publicUrl : null };
}

export async function saveBranding(supabase: ServiceSupabase, schoolId: string, branding: SchoolBranding) {
  const { error } = await supabase
    .from('organizations')
    .update({ branding, updated_at: new Date().toISOString() })
    .eq('id', schoolId)
    .eq('type', 'school');
  if (error) throw error;
}

/** Checks the file really is a PNG, JPEG or WebP by its first bytes, not its name. */
export function sniffLogoType(bytes: Uint8Array): { ext: 'png' | 'jpg' | 'webp'; mime: string } | null {
  const starts = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ext: 'png', mime: 'image/png' };
  if (starts([0xff, 0xd8, 0xff])) return { ext: 'jpg', mime: 'image/jpeg' };
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return { ext: 'webp', mime: 'image/webp' };
  return null;
}

/** Makes the logo bucket if the migration hasn't run yet (e.g. a fresh local stack). */
export async function ensureLogoBucket(supabase: ServiceSupabase) {
  const { data } = await supabase.storage.getBucket(LOGO_BUCKET);
  if (data) return;
  const { error } = await supabase.storage.createBucket(LOGO_BUCKET, {
    public: true,
    fileSizeLimit: LOGO_MAX_BYTES,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  });
  if (error && !/already exists/i.test(error.message)) throw error;
}

/** Just the school's logo URL (for report cards and emails), or null. Never fails the caller. */
export async function schoolLogoUrl(supabase: ServiceSupabase, schoolId: string): Promise<string | null> {
  try {
    return publicBranding(supabase, await readRawBranding(supabase, schoolId)).logoUrl;
  } catch (error) {
    console.error('Could not read school branding', error);
    return null;
  }
}

export type EmailBranding = { logoUrl: string | null; buttonColor: string | null; buttonTextColor: string | null };

const emailBrandingCache = new WeakMap<object, Map<string, Promise<EmailBranding>>>();

/**
 * The school's logo and button colour for emails. Remembered per request
 * client, so a CSV import of hundreds of people reads it once.
 */
export function emailBranding(supabase: ServiceSupabase, schoolId: string): Promise<EmailBranding> {
  let bySchool = emailBrandingCache.get(supabase);
  if (!bySchool) emailBrandingCache.set(supabase, (bySchool = new Map()));
  let pending = bySchool.get(schoolId);
  if (!pending) {
    pending = (async () => {
      try {
        const branding = await readRawBranding(supabase, schoolId);
        const colors = brandingColors(branding);
        const button = colors ? readableTokens(colors.primary, 'light', PRIMARY_MIN_CONTRAST) : null;
        return {
          logoUrl: publicBranding(supabase, branding).logoUrl,
          buttonColor: button?.hex ?? null,
          buttonTextColor: button ? (button.foreground === '0 0% 100%' ? '#ffffff' : '#171717') : null,
        };
      } catch (error) {
        console.error('Could not read school branding for an email', error);
        return { logoUrl: null, buttonColor: null, buttonTextColor: null };
      }
    })();
    bySchool.set(schoolId, pending);
  }
  return pending;
}

/** What the activation page needs to look like the school: its logo and colours. */
export async function activationBranding(supabase: ServiceSupabase, schoolId: string) {
  try {
    const branding = await readRawBranding(supabase, schoolId);
    const { logoUrl, preset, primary, secondary } = publicBranding(supabase, branding);
    return { logoUrl, colors: { preset, primary, secondary } };
  } catch (error) {
    console.error('Could not read school branding for activation', error);
    return { logoUrl: null, colors: null };
  }
}

/** For platform staff: has the school changed anything, and which logo does it use. */
export async function brandingSummary(supabase: ServiceSupabase, schoolId: string): Promise<{ customised: boolean; logoUrl: string | null }> {
  try {
    const branding = await readRawBranding(supabase, schoolId);
    return {
      customised: branding.preset !== DEFAULT_PRESET_ID || branding.mode !== null || branding.logoPath !== null,
      logoUrl: publicBranding(supabase, branding).logoUrl,
    };
  } catch {
    return { customised: false, logoUrl: null };
  }
}

/** Back to the InsyteAI colours, look and logo; the old logo file is deleted. */
export async function clearSchoolBranding(supabase: ServiceSupabase, schoolId: string) {
  const current = await readRawBranding(supabase, schoolId);
  await saveBranding(supabase, schoolId, { ...DEFAULT_BRANDING });
  if (current.logoPath) await supabase.storage.from(LOGO_BUCKET).remove([current.logoPath]);
}
