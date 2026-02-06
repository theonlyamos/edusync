'use client';

import { useState, useEffect, useContext, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { SupabaseBrowserClientContext, SupabaseSessionContext } from '@/components/providers/SupabaseAuthProvider';
import { Loader2 } from 'lucide-react';
import Image from 'next/image';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useContext(SupabaseBrowserClientContext);
  const session = useContext(SupabaseSessionContext);
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<'authenticated' | 'unauthenticated' | 'loading'>(session ? 'authenticated' : 'unauthenticated');
  const redirectedFromRaw = searchParams.get('redirectedFrom');
  const redirectedFrom = redirectedFromRaw ? decodeURIComponent(redirectedFromRaw) : null;
  const code = searchParams.get('code');

  useEffect(() => {
    if (status === 'authenticated') {
      if (redirectedFrom) {
        router.replace(redirectedFrom);
        return;
      }

      switch (session.user.user_metadata.role) {
        case 'admin':
          router.push('/admin/dashboard');
          break;
        case 'teacher':
          router.push('/teachers/dashboard');
          break;
        case 'student':
          router.push('/students/dashboard');
          break;
        default:
          router.push('/learn');
      }
    }
  }, [session, status, router, redirectedFrom]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setStatus('authenticated');
      if (redirectedFrom) {
        router.replace(redirectedFrom);
        return;
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: (error as any)?.message ?? 'An error occurred during login',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOAuth = async (provider: 'google') => {
    try {
      const redirectTo = `${window.location.origin}/login?redirectedFrom=${encodeURIComponent(redirectedFrom || '/learn')}`;
      const { data, error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
      if (error) throw error;
    } catch (error) {
      toast({ title: 'Error', description: (error as any)?.message ?? 'OAuth failed', variant: 'destructive' });
    }
  };

  // Show loading interface if code parameter exists (OAuth callback)
  if (code) {
    return (
      <main className="min-h-screen overflow-x-hidden flex items-center justify-center bg-gradient-to-b from-background to-muted/20">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="text-sm text-muted-foreground">Signing you in...</div>
        </div>
      </main>
    )
  }

  if (status === 'loading' || status === 'authenticated') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-full max-w-md space-y-8 px-4">
          <div className="flex justify-center">
            <div className="w-8 h-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex flex-col">
      {/* Header with back to home link */}
      <header className="absolute top-0 left-0 right-0 z-20 p-6 flex justify-between items-center">
        <Link href="/" className="inline-flex items-center gap-3 group">
          <div className="w-8 h-8 rounded-lg border bg-card flex items-center justify-center">
            <Image src="/globe.svg" alt="InsyteAI logo" width={18} height={18} className="opacity-80" />
          </div>
          <span className="text-lg font-semibold tracking-tight text-foreground">InsyteAI</span>
        </Link>
      </header>

      <div className="flex-1 grid md:grid-cols-2">
        {/* Left side - Form */}
        <div className="flex items-center justify-center p-8 md:p-12 lg:p-16">
          <div className="w-full max-w-sm space-y-8">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight text-foreground font-display">Welcome back</h1>
              <p className="text-muted-foreground">
                Enter your details to access your learning space.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="Enter your email"
                    required
                    disabled={isLoading}
                    className="h-11 bg-transparent"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <Link
                      href="/forgot-password"
                      className="text-xs text-muted-foreground hover:text-primary transition-colors"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="Enter your password"
                    required
                    disabled={isLoading}
                    className="h-11 bg-transparent"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <span className="mr-2">Signing in</span>
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </>
                ) : (
                  'Sign in'
                )}
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    Or continue with
                  </span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full h-11 bg-transparent hover:bg-muted"
                onClick={() => handleOAuth('google')}
                disabled={isLoading}
              >
                <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Google
              </Button>

              <div className="text-center text-sm">
                <span className="text-muted-foreground">Don't have an account? </span>
                <Link href="/signup" className="font-medium text-foreground hover:underline underline-offset-4">
                  Sign up
                </Link>
              </div>
            </form>
          </div>
        </div>

        {/* Right side - Visual composition */}
        <div className="hidden md:flex flex-col bg-muted/30 relative overflow-hidden border-l">
          {/* Dot grid texture */}
          <div
            className="absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage: 'radial-gradient(circle, hsl(var(--foreground) / 0.15) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />
          {/* Warm radial wash */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,hsl(var(--primary)/0.08),transparent_60%),radial-gradient(ellipse_at_80%_80%,hsl(var(--accent)/0.06),transparent_50%)]" />

          <div className="flex-1 flex items-center justify-center p-10 relative">
            {/* Floating card stack */}
            <div className="relative w-full max-w-sm h-[420px]">
              {/* Card 1 - back */}
              <div
                className="absolute top-4 left-6 right-10 rounded-xl border bg-card/80 backdrop-blur-sm p-5 shadow-sm opacity-0 animate-[fadeSlideUp_0.6s_0.1s_ease-out_forwards]"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">AI</div>
                  <div>
                    <div className="text-xs font-medium text-foreground">Voice Session</div>
                    <div className="text-[10px] text-muted-foreground">Physics &middot; Wave mechanics</div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-2 w-3/4 rounded-full bg-muted" />
                  <div className="h-2 w-1/2 rounded-full bg-muted" />
                </div>
              </div>

              {/* Card 2 - middle, visualization preview */}
              <div
                className="absolute top-24 left-2 right-4 rounded-xl border bg-card shadow-md p-5 opacity-0 animate-[fadeSlideUp_0.6s_0.3s_ease-out_forwards]"
              >
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-3">Generated visualization</div>
                <div className="grid grid-cols-5 gap-1.5 mb-3">
                  {[0.3, 0.6, 0.9, 0.7, 0.4].map((h, i) => (
                    <div
                      key={i}
                      className="rounded bg-primary/20"
                      style={{
                        height: `${h * 48}px`,
                        animationDelay: `${0.5 + i * 0.08}s`,
                      }}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Wave amplitude over time</span>
                  <span className="text-primary font-medium">Live</span>
                </div>
              </div>

              {/* Card 3 - front, chat snippet */}
              <div
                className="absolute top-52 left-6 right-2 rounded-xl border bg-card shadow-lg p-5 opacity-0 animate-[fadeSlideUp_0.6s_0.5s_ease-out_forwards]"
              >
                <div className="space-y-3">
                  <div className="flex justify-end">
                    <div className="bg-primary/10 text-foreground text-xs px-3 py-2 rounded-lg rounded-br-sm max-w-[80%]">
                      How does light bend through a prism?
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <div className="bg-muted text-foreground text-xs px-3 py-2 rounded-lg rounded-bl-sm max-w-[80%]">
                      Great question. I'm generating a refraction diagram for you now...
                    </div>
                  </div>
                </div>
              </div>

              {/* Decorative floating badge */}
              <div
                className="absolute bottom-6 right-8 rounded-full border bg-card px-3 py-1.5 shadow-sm flex items-center gap-2 opacity-0 animate-[fadeSlideUp_0.6s_0.7s_ease-out_forwards]"
              >
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-[10px] text-muted-foreground font-medium">Session active</span>
              </div>
            </div>
          </div>

          {/* Quote strip at bottom */}
          <div className="px-10 py-8 border-t bg-background/50 backdrop-blur-sm relative z-10">
            <p className="text-sm text-muted-foreground italic leading-relaxed">
              &ldquo;Visual learning isn't just about seeing. It's about understanding.&rdquo;
            </p>
            <div className="flex justify-between items-center mt-3 text-xs text-muted-foreground">
              <span>© InsyteAI {new Date().getFullYear()}</span>
              <div className="space-x-4">
                <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
                <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen overflow-x-hidden flex items-center justify-center bg-gradient-to-b from-background to-muted/20">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="text-sm text-muted-foreground">Loading...</div>
        </div>
      </main>
    }>
      <LoginContent />
    </Suspense>
  )
} 