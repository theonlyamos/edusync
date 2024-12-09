'use client';

import { useState, useEffect } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BookOpen, Mail, Lock, UserCircle2 } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === 'authenticated') {
      if (session?.user?.role === 'teacher') {
        router.push('/teachers/dashboard');
      } else {
        router.push('/students/dashboard');
      }
    }
  }, [session, status, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const result = await signIn('credentials', {
        redirect: false,
        email,
        password,
        role
      });

      if (result?.error) {
        setError('Invalid credentials');
        return;
      }
    } catch (error) {
      setError('An error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  if (status === 'loading') {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold gradient-text mb-2">EduSync</h1>
          <p className="text-muted-foreground">Your AI-Powered Learning Platform</p>
        </div>

        <Card className="dashboard-card border-t-4 border-t-primary">
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle>Welcome back</CardTitle>
                <CardDescription>
                  Sign in to your account to continue
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="transition-colors"
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="transition-colors"
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role" className="flex items-center gap-2">
                  <UserCircle2 className="h-4 w-4" />
                  Role
                </Label>
                <select
                  id="role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  disabled={loading}
                >
                  <option value="student">Student</option>
                  <option value="teacher">Teacher</option>
                </select>
              </div>
              {error && (
                <div className="text-sm text-destructive text-center bg-destructive/10 py-2 rounded-md">
                  {error}
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign in'}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
} 