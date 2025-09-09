'use client';

import { useState, useEffect, useContext } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { SupabaseBrowserClientContext, SupabaseSessionContext } from '@/components/providers/SupabaseAuthProvider';

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
            role: 'student' // Default role
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
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-700 relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-blue-400/20 to-indigo-600/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-tr from-purple-400/20 to-pink-600/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-r from-cyan-400/10 to-blue-600/10 rounded-full blur-3xl"></div>
      </div>
      
      <div className="w-full max-w-md space-y-8 px-4 relative z-10">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
          <p className="text-sm text-muted-foreground">
            Get started with your learning journey
          </p>
        </div>

        <div className="backdrop-blur-sm bg-white/70 dark:bg-slate-800/70 p-8 rounded-2xl shadow-xl border border-white/20 dark:border-slate-700/50">
          <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              name="name"
              type="text"
              placeholder="Enter your full name"
              required
              disabled={isLoading}
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
            />
          </div>

          <Button
            type="submit"
            className="w-full"
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

          <div className="text-center text-sm text-muted-foreground">or</div>
          <Button 
            type="button" 
            variant="outline" 
            className="w-full hover:bg-black hover:text-white hover:border-black transition-colors" 
            onClick={() => handleOAuth('google')} 
            disabled={isLoading}
          >
            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </Button>
          
          <div className="text-center text-sm">
            <span className="text-muted-foreground">Already have an account? </span>
            <Link href="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}
