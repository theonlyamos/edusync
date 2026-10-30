import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { publicSupportEmail } from '@/lib/support';

export interface LegalSection {
  heading: string;
  body: React.ReactNode;
}

export function LegalPage({ title, updated, intro, sections }: {
  title: string;
  updated?: string;
  intro: React.ReactNode;
  sections: LegalSection[];
}) {
  const email = publicSupportEmail();
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto flex items-center justify-between px-4 py-5">
          <Link href="/" aria-label="InsyteAI home"><Logo markClassName="h-8 w-8" /></Link>
          <nav className="flex gap-5 text-sm text-muted-foreground">
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground">Terms</Link>
            <Link href="/support" className="hover:text-foreground">Support</Link>
            <Link href="/login" className="hover:text-foreground">Sign in</Link>
          </nav>
        </div>
      </header>
      <article className="container mx-auto max-w-2xl px-4 py-10 sm:py-14">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        {updated && <p className="mt-2 text-sm text-muted-foreground">Last updated {updated}</p>}
        <div className="mt-6 text-base leading-7 text-foreground/90">{intro}</div>
        <div className="mt-10 space-y-8">
          {sections.map((section) => (
            <section key={section.heading} className="space-y-3">
              <h2 className="text-xl font-semibold">{section.heading}</h2>
              <div className="space-y-3 leading-7 text-foreground/90 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6">{section.body}</div>
            </section>
          ))}
        </div>
      </article>
      <footer className="border-t">
        <div className="container mx-auto flex flex-wrap justify-between gap-2 px-4 py-6 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} InsyteAI</span>
          {email && <a href={`mailto:${email}`} className="hover:text-foreground">{email}</a>}
        </div>
      </footer>
    </main>
  );
}
