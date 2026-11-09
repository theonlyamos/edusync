import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 text-center bg-background text-foreground">
      <Logo markClassName="h-10 w-10" />
      <div className="space-y-2">
        <h1 className="text-3xl">We can&rsquo;t find that page</h1>
        <p className="text-muted-foreground max-w-md">
          The link may be old, or the page may have moved. Head back and try again.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button asChild>
          <Link href="/">Go to home</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/support">Get help</Link>
        </Button>
      </div>
    </main>
  );
}
