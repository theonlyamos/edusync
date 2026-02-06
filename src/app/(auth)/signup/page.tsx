'use client';

import { useState, useEffect, useContext } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { SupabaseBrowserClientContext, SupabaseSessionContext } from '@/components/providers/SupabaseAuthProvider';
import Image from 'next/image';
import { Loader2 } from 'lucide-react';

export default function SignupPage() {
  const router = useRouter();
  const supabase = useContext(SupabaseBrowserClientContext);
  const session = useContext(SupabaseSessionContext);
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<'authenticated' | 'unauthenticated' | 'loading'>(session ? 'authenticated' : 'unauthenticated');

  useEffect(() => {
    if (status === 'authenticated') {
      switch (session.user.role) {
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
          router.push('/');
      }
    }
  }, [session, status, router]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;
    const name = formData.get('name') as string;

    if (password !== confirmPassword) {
      toast({
        title: 'Error',
        description: 'Passwords do not match',
        variant: 'destructive',
      });
      setIsLoading(false);
      return;
    }

    if (password.length < 6) {
      toast({
        title: 'Error',
        description: 'Password must be at least 6 characters',
        variant: 'destructive',
      });
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name,
            role: 'learner' // Default role
          }
        }
      });

      if (error) throw error;

      if (data.user && !data.session) {
        toast({
          title: 'Check your email',
          description: 'We sent you a confirmation link to complete your registration.',
        });
      } else {
        toast({
          title: 'Account created',
          description: 'Welcome! Your account has been created successfully.',
        });
        setStatus('authenticated');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: (error as any)?.message ?? 'An error occurred during signup',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOAuth = async (provider: 'google') => {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: window.location.origin,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          }
        }
      });
      if (error) throw error;
    } catch (error) {
      toast({ title: 'Error', description: (error as any)?.message ?? 'OAuth failed', variant: 'destructive' });
    }
  };

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
              <h1 className="text-3xl font-bold tracking-tight text-foreground font-display">Create your account</h1>
              <p className="text-muted-foreground">
                Get started with your learning journey
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    placeholder="Enter your full name"
                    required
                    disabled={isLoading}
                    className="h-11 bg-transparent"
                  />
                </div>

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
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="Create a password"
                    required
                    disabled={isLoading}
                    minLength={6}
                    className="h-11 bg-transparent"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    placeholder="Confirm your password"
                    required
                    disabled={isLoading}
                    minLength={6}
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
                    <span className="mr-2">Creating account</span>
                    <div className="w-4 h-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                  </>
                ) : (
                  'Create account'
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
                <span className="text-muted-foreground">Already have an account? </span>
                <Link href="/login" className="font-medium text-foreground hover:underline underline-offset-4">
                  Sign in
                </Link>
              </div>
            </form>
          </div>
        </div>

        {/* Right side - Visual composition */}
        <div className="hidden md:flex flex-col bg-muted/30 relative overflow-hidden border-l">
          {/* Cross-hatch grid texture */}
          <div
            className="absolute inset-0 opacity-[0.25]"
            style={{
              backgroundImage: `linear-gradient(hsl(var(--foreground) / 0.06) 1px, transparent 1px),
                                linear-gradient(90deg, hsl(var(--foreground) / 0.06) 1px, transparent 1px)`,
              backgroundSize: '32px 32px',
            }}
          />
          {/* Accent radial wash */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_30%,hsl(var(--accent)/0.07),transparent_55%),radial-gradient(ellipse_at_20%_80%,hsl(var(--primary)/0.06),transparent_50%)]" />

          <div className="flex-1 flex items-center justify-center p-10 relative">
            <div className="relative w-full max-w-sm">
              {/* Feature tiles in a staggered grid */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Voice sessions', detail: '120+ hours guided', delay: '0.1s' },
                  { label: 'Subjects covered', detail: 'Math, Science, CS', delay: '0.2s' },
                  { label: 'Visualizations', detail: '20k+ generated', delay: '0.3s' },
                  { label: 'Learning modes', detail: 'Voice, chat, practice', delay: '0.4s' },
                ].map((tile) => (
                  <div
                    key={tile.label}
                    className="rounded-xl border bg-card p-4 shadow-sm opacity-0 animate-[fadeSlideUp_0.6s_ease-out_forwards]"
                    style={{ animationDelay: tile.delay }}
                  >
                    <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">{tile.label}</div>
                    <div className="text-sm font-medium text-foreground">{tile.detail}</div>
                  </div>
                ))}
              </div>

              {/* Central testimonial card overlapping the grid */}
              <div
                className="mt-4 rounded-xl border bg-card p-5 shadow-md opacity-0 animate-[fadeSlideUp_0.6s_0.55s_ease-out_forwards]"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-sm font-bold text-accent">S</span>
                  </div>
                  <div>
                    <p className="text-sm text-foreground leading-relaxed">
                      &ldquo;I understood wave mechanics in 10 minutes with the visual mode. This is how science should be taught.&rdquo;
                    </p>
                    <div className="mt-2 text-[10px] text-muted-foreground">Sarah K. &middot; Grade 11 student</div>
                  </div>
                </div>
              </div>

              {/* Bottom stat row */}
              <div
                className="mt-3 flex items-center justify-between rounded-xl border bg-card/60 backdrop-blur-sm px-4 py-3 opacity-0 animate-[fadeSlideUp_0.6s_0.7s_ease-out_forwards]"
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-[10px] text-muted-foreground">247 learners online now</span>
                </div>
                <div className="flex -space-x-1.5">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="w-5 h-5 rounded-full border-2 border-card bg-muted"
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Quote strip at bottom */}
          <div className="px-10 py-8 border-t bg-background/50 backdrop-blur-sm relative z-10">
            <p className="text-sm text-muted-foreground italic leading-relaxed">
              &ldquo;The best way to learn something is to see it come alive in front of you.&rdquo;
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
