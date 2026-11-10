import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { brandingStylesheet, type SchoolBranding } from '@/lib/school-branding';

export type JoinShellSchool = {
  name: string;
  logoUrl?: string | null;
  colors?: Pick<SchoolBranding, 'preset' | 'primary' | 'secondary'> | null;
};

/** Page frame for the sign-in side pages (activation, password reset). Shows the school's logo and colours when given. */
export function JoinShell({ title, description, children, school }: { title: string; description?: React.ReactNode; children: React.ReactNode; school?: JoinShellSchool | null }) {
  const css = school?.colors ? brandingStylesheet(school.colors) : '';
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {css && <style>{css}</style>}
      <header className="flex flex-wrap items-center gap-4 p-6">
        {school?.logoUrl && (
          <span className="inline-flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- school logos live in Supabase storage */}
            <img src={school.logoUrl} alt="" className="h-10 w-10 object-contain" />
            <span className="font-semibold">{school.name}</span>
            <span className="h-6 border-l" aria-hidden />
          </span>
        )}
        <Link href="/" className="inline-flex items-center gap-3"><Logo markClassName="h-8 w-8" /></Link>
      </header>
      <main className="flex-1 flex justify-center px-4 pb-16">
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight font-display">{title}</h1>
            {description && <p className="text-muted-foreground">{description}</p>}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
