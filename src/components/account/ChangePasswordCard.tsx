'use client';

import { useContext, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { SupabaseBrowserClientContext } from '@/components/providers/SupabaseAuthProvider';
import { MIN_PASSWORD_LENGTH, validateNewPassword } from '@/lib/password-reset';

export function ChangePasswordCard() {
  const supabase = useContext(SupabaseBrowserClientContext);
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validateNewPassword(password, confirm);
    if (problem) {
      setPasswordError(problem);
      return;
    }
    setPasswordError('');
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSavingPassword(false);
    if (error) {
      setPasswordError(
        error.code === 'same_password'
          ? 'Pick a password you have not used here before.'
          : error.message || 'Your password could not be changed. Please try again.',
      );
      return;
    }
    setPassword('');
    setConfirm('');
    toast({ title: 'Password changed' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
        <CardDescription>Use at least {MIN_PASSWORD_LENGTH} characters.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={savePassword}>
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          {passwordError && <p role="alert" className="text-sm text-destructive">{passwordError}</p>}
          <Button type="submit" variant="outline" disabled={savingPassword || !password}>
            {savingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Change password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
