'use client';

import { useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';

/** Support action: email a person a link to set a new password. */
export function usePasswordResetEmail() {
  const { toast } = useToast();
  return useCallback(async (person: { id: string; email?: string | null }) => {
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(person.id)}/password-reset`, { method: 'POST' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not send the reset email.');
      toast({ title: 'Reset email sent', description: `${body.email ?? person.email ?? 'They'} can now set a new password.` });
    } catch (error) {
      toast({ title: 'Reset email not sent', description: (error as Error).message, variant: 'destructive' });
    }
  }, [toast]);
}
