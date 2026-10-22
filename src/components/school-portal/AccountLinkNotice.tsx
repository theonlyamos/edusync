'use client';

import { useState } from 'react';
import { Check, Copy, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type LinkResult = { emailed: boolean; url?: string; expiresAt: string; linkFailed?: boolean };

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * Says whether an activation or password link was emailed. When email isn't
 * set up (or the send failed) it shows the link so the admin can pass it on.
 */
export function AccountLinkNotice({ result, email, kind = 'activate' }: { result: LinkResult; email: string; kind?: 'activate' | 'reset' }) {
  const [copied, setCopied] = useState(false);
  const what = kind === 'activate' ? 'activation link' : 'password link';
  if (result.emailed) {
    return (
      <div className="flex items-start gap-3 rounded-md border p-3 text-sm">
        <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden />
        <p>We emailed an {what} to <strong className="break-all">{email}</strong>. It works until {formatDate(result.expiresAt)}.</p>
      </div>
    );
  }
  if (result.linkFailed) {
    return (
      <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-50">
        The account was created, but we couldn’t make an {what} for <strong className="break-all">{email}</strong>.
        Use “Resend activation email” on their row to send one.
      </p>
    );
  }
  if (!result.url) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.url!);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // The link stays selectable in the box.
    }
  };
  return (
    <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-50">
      <p>
        The email didn’t go out (school email isn’t set up yet). Send this {what} to <strong className="break-all">{email}</strong> yourself.
        Anyone with the link can set the password, so share it only with them. It works until {formatDate(result.expiresAt)}.
      </p>
      <div className="flex gap-2">
        <Input readOnly value={result.url} onFocus={(e) => e.currentTarget.select()} aria-label={`${what} for ${email}`} className="bg-background text-foreground" />
        <Button type="button" variant="outline" onClick={copy} className="shrink-0 bg-background text-foreground">
          {copied ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  );
}
