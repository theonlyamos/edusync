export type StudentProfile = {
  name: string | null;
  email: string | null;
  gradeLevel: string | null;
};

export const studentProfileQueryKey = (userId?: string | null) => (
  ['student-profile', userId ?? 'anonymous'] as const
);

const clean = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined;

export function resolveStudentDisplayName(input: {
  profileName?: unknown;
  metadataName?: unknown;
  email?: unknown;
}): string {
  const profileName = clean(input.profileName);
  if (profileName) return profileName;
  const metadataName = clean(input.metadataName);
  if (metadataName) return metadataName;
  const email = clean(input.email);
  if (email) return email.split('@')[0] || 'there';
  return 'there';
}
