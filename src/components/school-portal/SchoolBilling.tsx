'use client';

import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { CheckCircle, Coins, Loader2, Mic, Presentation, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import type { SchoolBillingDetails } from '@/lib/school-billing.server';
import {
  CREDIT_PRICE_CENTS,
  MAX_SCHOOL_PURCHASE_CREDITS,
  MIN_SCHOOL_PURCHASE_CREDITS,
  trialDaysLeft,
} from '@/lib/school-billing';

type BillingResponse = SchoolBillingDetails & { school: { id: string; name: string } };

const PACKS = [500, 2000, 5000];

function plural(n: number, word: string) {
  return `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
}

function dollars(credits: number) {
  return `$${((credits * CREDIT_PRICE_CENTS) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const TYPE_LABEL: Record<string, string> = {
  trial: 'Trial',
  purchase: 'Purchase',
  usage: 'Used',
  refund: 'Refund',
  expiry: 'Expired',
  adjustment: 'Adjustment',
};

export default function SchoolBilling({ purchased, onChanged }: { purchased?: boolean; onChanged?: () => void }) {
  const [data, setData] = useState<BillingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [amount, setAmount] = useState('500');
  const [buying, setBuying] = useState(false);

  const load = useCallback(async (quiet = false): Promise<BillingResponse | null> => {
    if (!quiet) {
      setLoading(true);
      setError('');
    }
    try {
      const response = await axios.get<BillingResponse>('/api/schools/current/credits');
      setData(response.data);
      return response.data;
    } catch (e) {
      if (!quiet) setError((e as any)?.response?.data?.error ?? 'Could not load school credits');
      return null;
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  // Stripe often sends the buyer back before its webhook has added the credits.
  // After a purchase, check again every few seconds until the purchased balance
  // goes up (or we give up), then refresh the page header.
  const [purchaseState, setPurchaseState] = useState<'waiting' | 'added' | 'slow'>('waiting');
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      const first = await load();
      if (!purchased || cancelled) return;
      const startPaid = first?.balance.paid ?? 0;
      const startPurchases = first?.transactions.filter((t) => t.type === 'purchase').length ?? 0;
      let tries = 0;
      const check = async () => {
        if (cancelled) return;
        tries += 1;
        const next = await load(true);
        const arrived = next
          && (next.balance.paid > startPaid
            || next.transactions.filter((t) => t.type === 'purchase').length > startPurchases);
        if (arrived || tries >= 20) {
          setPurchaseState(arrived ? 'added' : 'slow');
          onChanged?.();
          return;
        }
        timer = setTimeout(() => void check(), 3000);
      };
      timer = setTimeout(() => void check(), 2000);
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // Runs once per mount: a purchase always comes back through a full page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buy = async () => {
    const credits = Number(amount);
    setBuying(true);
    setError('');
    try {
      const response = await axios.post<{ url: string }>('/api/schools/current/credits', { credits });
      window.location.assign(response.data.url);
    } catch (e) {
      setError((e as any)?.response?.data?.error ?? 'Could not start checkout');
      setBuying(false);
    }
  };

  if (loading && !data) {
    return (
      <div role="status" className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading school credits…
      </div>
    );
  }
  if (!data) {
    return (
      <Card>
        <CardContent className="p-6 text-sm">
          <p className="text-destructive">{error || 'Could not load school credits'}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => void load()}>Try again</Button>
        </CardContent>
      </Card>
    );
  }

  const { balance, authoring, usageThisMonth } = data;
  const days = trialDaysLeft(balance);
  const credits = Number(amount);
  const amountOk = Number.isInteger(credits) && credits >= MIN_SCHOOL_PURCHASE_CREDITS && credits <= MAX_SCHOOL_PURCHASE_CREDITS;

  return (
    <div className="space-y-4">
      {purchased && (
        <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
          <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {purchaseState === 'waiting'
            ? 'Thanks! Your payment went through. Waiting for Stripe to confirm it, which usually takes a few seconds…'
            : purchaseState === 'added'
              ? 'Thanks! Your credits have been added.'
              : 'Thanks! Your payment went through. Stripe is still confirming it; refresh this page in a few minutes to see the new credits.'}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardDescription>Credits available</CardDescription>
            <CardTitle className="flex items-center gap-2 text-4xl">
              <Coins className="h-7 w-7 text-yellow-500" />
              {balance.total.toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <p>1 credit = 1 minute of live AI (voice tutor or live class).</p>
            {balance.trialActive && (
              <div>
                <Badge variant="secondary" className="mr-1">Trial</Badge>
                {plural(balance.trial, 'credit')} {days === 0 ? 'end today' : `end in ${plural(days ?? 0, 'day')}`}.
              </div>
            )}
            <p>{plural(balance.paid, 'purchased credit')}, which don&apos;t expire.</p>
            {balance.total <= 0 && (
              <p className="pt-2 font-medium text-amber-700 dark:text-amber-300">
                Out of credits: voice tutoring, live classes and visuals past the free allowance are paused.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Buy credits</CardTitle>
            <CardDescription>
              {dollars(1)} per credit. Credits go to the whole school and are shared by its teachers and students.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {PACKS.map((pack) => (
                <Button
                  key={pack}
                  type="button"
                  size="sm"
                  variant={Number(amount) === pack ? 'default' : 'outline'}
                  onClick={() => setAmount(String(pack))}
                >
                  {pack.toLocaleString()} · {dollars(pack)}
                </Button>
              ))}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="space-y-1">
                <Label htmlFor="school-credit-amount">Credits</Label>
                <Input
                  id="school-credit-amount"
                  type="number"
                  inputMode="numeric"
                  min={MIN_SCHOOL_PURCHASE_CREDITS}
                  max={MAX_SCHOOL_PURCHASE_CREDITS}
                  step={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-40"
                />
              </div>
              <Button onClick={() => void buy()} disabled={!amountOk || buying}>
                {buying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {amountOk ? `Pay ${dollars(credits)}` : `Choose ${MIN_SCHOOL_PURCHASE_CREDITS}–${MAX_SCHOOL_PURCHASE_CREDITS.toLocaleString()}`}
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-primary" /> Lesson authoring this month
            </CardTitle>
            <CardDescription>
              Free each month: {plural(authoring.visuals.free, 'visual')} and {plural(authoring.images.free, 'image')}.
              After that, {plural(authoring.creditsPerVisual, 'credit')} per visual and {plural(authoring.creditsPerImage, 'credit')} per image.
              Regenerating counts; a generation that fails is given back.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Visuals: {authoring.visuals.used.toLocaleString()} made ({Math.max(0, authoring.visuals.free - authoring.visuals.used).toLocaleString()} free left)</p>
            <p>Images: {authoring.images.used.toLocaleString()} made ({Math.max(0, authoring.images.free - authoring.images.used).toLocaleString()} free left)</p>
            <p className="text-muted-foreground">Credits spent past the allowance: {authoring.creditsCharged.toLocaleString()}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Credits used this month</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="flex items-center gap-2"><Mic className="h-4 w-4 text-muted-foreground" /> Voice tutor: {plural(usageThisMonth.voice, 'credit')}</p>
            <p className="flex items-center gap-2"><Presentation className="h-4 w-4 text-muted-foreground" /> Live classes: {plural(usageThisMonth.live_class, 'credit')}</p>
            <p className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-muted-foreground" /> Visuals and images: {plural(usageThisMonth.visual + usageThisMonth.image, 'credit')}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          {data.transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No credit activity yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {data.transactions.map((t) => (
                <li key={t.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="break-words">
                      <Badge variant="outline" className="mr-2">{TYPE_LABEL[t.type] ?? t.type}</Badge>
                      {t.description}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(t.createdAt).toLocaleString()}
                      {t.userName ? ` · ${t.userName}` : ''}
                    </p>
                  </div>
                  <span className={`shrink-0 font-medium ${t.credits < 0 ? 'text-muted-foreground' : 'text-green-700 dark:text-green-400'}`}>
                    {t.credits > 0 ? '+' : ''}{t.credits.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
