import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase.server';
import { getActiveSchoolMembership, isSchoolManager } from '@/lib/school-access.server';
import { LOGO_BUCKET, LOGO_MAX_BYTES } from '@/lib/school-branding';
import { ensureLogoBucket, publicBranding, readRawBranding, saveBranding, sniffLogoType } from '@/lib/school-branding.server';

async function requireManager() {
  const session = await getServerSession();
  if (!session?.user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const;
  const supabase = createServerSupabase();
  const membership = await getActiveSchoolMembership(supabase, session.user.id);
  if (!membership || !isSchoolManager(membership.role)) {
    return { error: NextResponse.json({ error: 'Only school owners and admins can change the logo' }, { status: 403 }) } as const;
  }
  return { supabase, school: membership.school } as const;
}

/** Uploads a new school logo (PNG, JPEG or WebP, up to 512 KB) and removes the old one. */
export async function POST(request: NextRequest) {
  try {
    const declared = Number(request.headers.get('content-length') ?? 0);
    if (declared > LOGO_MAX_BYTES + 64 * 1024) {
      return NextResponse.json({ error: 'The logo must be 512 KB or smaller.' }, { status: 413 });
    }
    const auth = await requireManager();
    if ('error' in auth) return auth.error;
    const { supabase, school } = auth;

    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose an image to upload.' }, { status: 400 });
    if (file.size > LOGO_MAX_BYTES) return NextResponse.json({ error: 'The logo must be 512 KB or smaller.' }, { status: 413 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniffLogoType(bytes);
    if (!type) return NextResponse.json({ error: 'Use a PNG, JPEG or WebP image.' }, { status: 400 });

    await ensureLogoBucket(supabase);
    const path = `${school.id}/logo-${crypto.randomUUID()}.${type.ext}`;
    const { error: uploadError } = await supabase.storage.from(LOGO_BUCKET).upload(path, bytes, {
      contentType: type.mime,
      cacheControl: '31536000',
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const current = await readRawBranding(supabase, school.id);
    const next = { ...current, logoPath: path };
    try {
      await saveBranding(supabase, school.id, next);
    } catch (error) {
      await supabase.storage.from(LOGO_BUCKET).remove([path]);
      throw error;
    }
    if (current.logoPath) await supabase.storage.from(LOGO_BUCKET).remove([current.logoPath]);
    return NextResponse.json({ school: { id: school.id, name: school.name }, branding: publicBranding(supabase, next) });
  } catch (error) {
    console.error('Error in POST /api/schools/branding/logo:', error);
    return NextResponse.json({ error: 'Failed to upload the logo' }, { status: 500 });
  }
}

/** Removes the school logo; the portals go back to the InsyteAI logo. */
export async function DELETE() {
  try {
    const auth = await requireManager();
    if ('error' in auth) return auth.error;
    const { supabase, school } = auth;
    const current = await readRawBranding(supabase, school.id);
    const next = { ...current, logoPath: null };
    await saveBranding(supabase, school.id, next);
    if (current.logoPath) await supabase.storage.from(LOGO_BUCKET).remove([current.logoPath]);
    return NextResponse.json({ school: { id: school.id, name: school.name }, branding: publicBranding(supabase, next) });
  } catch (error) {
    console.error('Error in DELETE /api/schools/branding/logo:', error);
    return NextResponse.json({ error: 'Failed to remove the logo' }, { status: 500 });
  }
}
