import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';

/** Page frame for the sign-in side pages (activation, password reset). */
export function JoinShell({ title, description, children }: { title: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="p-6">
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
