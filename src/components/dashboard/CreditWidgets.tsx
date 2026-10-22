"use client";
import Link from "next/link";
import { Coins, Mic, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardSection } from "./DashboardParts";
import type { DashboardRequest } from "./StudentInsights";
import type { CreditSummary } from "@/lib/school-billing.server";
import { trialDaysLeft, type AllowanceUsage, type SchoolBalance } from "@/lib/school-billing";

function plural(n: number, word: string) {
  return `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
}

function UsageBar({ used, total, label }: { used: number; total: number; label: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 100;
  const over = used > total;
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={Math.min(used, total)}
    >
      <div
        className={`h-full rounded-full ${over || pct >= 90 ? "bg-amber-500" : "bg-primary"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function BalanceLine({ balance, now }: { balance: SchoolBalance; now: Date }) {
  const days = trialDaysLeft(balance, now);
  return (
    <p className="text-xs text-muted-foreground">
      {balance.trialActive
        ? `${plural(balance.trial, "trial credit")} ${days === 0 ? "end today" : `end in ${plural(days ?? 0, "day")}`}${
            balance.paid ? ` · ${plural(balance.paid, "purchased credit")}` : ""
          }`
        : balance.paid
          ? "Purchased credits don’t expire"
          : "No credits left"}
    </p>
  );
}

/** Students: how many tutor minutes are available to them and how many they used this month. */
export function TutorMinutesCard({ request }: { request: DashboardRequest<CreditSummary> }) {
  const data = request.data;
  const school = data?.school;
  const available = school ? school.balance.total : data?.personalCredits ?? 0;
  const empty = available <= 0;
  return (
    <DashboardSection
      title="AI tutor minutes"
      icon={<Mic className="h-5 w-5 text-primary" />}
      loading={request.loading}
      error={request.error}
      retry={request.refresh}
    >
      {data && (
        <div className="space-y-3">
          <div>
            <p className="text-3xl font-medium">{available.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">
              {school ? `minutes available from ${school.name}` : "minutes left on your account"}
            </p>
          </div>
          <p className="text-sm">
            You&apos;ve talked with the tutor for {plural(data.myUsage.voiceMinutes, "minute")} this month.
          </p>
          {empty ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
              {school
                ? "Your school is out of tutor minutes. Ask your teacher to let the school admin know."
                : "You’re out of minutes. Buy more to keep talking with the tutor."}
            </p>
          ) : school?.balance.low ? (
            <p className="text-xs text-muted-foreground">Your school is running low on minutes.</p>
          ) : null}
          {!school && (
            <Button size="sm" variant="outline" className="min-h-11 xl:min-h-0" asChild>
              <Link href="/learn/credits">Buy minutes</Link>
            </Button>
          )}
        </div>
      )}
    </DashboardSection>
  );
}

function AllowanceRow({ label, usage, cost }: { label: string; usage: AllowanceUsage; cost: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className="shrink-0 text-muted-foreground">
          {Math.min(usage.used, usage.free).toLocaleString()} of {usage.free.toLocaleString()} free
        </span>
      </div>
      <UsageBar used={usage.used} total={usage.free} label={`${label} used of the free allowance`} />
      {usage.overage > 0 && (
        <p className="text-xs text-muted-foreground">
          {plural(usage.overage, "extra")} at {plural(cost, "credit")} each
        </p>
      )}
    </div>
  );
}

/** Teachers and school admins: the school's credits and this month's authoring allowance. */
export function SchoolCreditsCard({ request, now }: { request: DashboardRequest<CreditSummary>; now: Date }) {
  const data = request.data;
  const school = data?.school;
  const authoring = data?.authoring;
  return (
    <DashboardSection
      title="School credits"
      icon={<Coins className="h-5 w-5 text-primary" />}
      href={school?.canManage ? "/school/billing" : undefined}
      linkLabel="Manage"
      loading={request.loading}
      error={request.error}
      retry={request.refresh}
    >
      {data && !school ? (
        <div className="space-y-2">
          <p className="text-3xl font-medium">{data.personalCredits.toLocaleString()}</p>
          <p className="text-sm text-muted-foreground">credits on your account (1 credit = 1 minute of live AI)</p>
        </div>
      ) : school ? (
        <div className="space-y-4">
          <div>
            <p className="text-3xl font-medium">{school.balance.total.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">credits left at {school.name} · 1 credit = 1 minute of live AI</p>
            <BalanceLine balance={school.balance} now={now} />
          </div>
          {school.balance.low && (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
              {school.balance.total <= 0
                ? "The school is out of credits. Voice tutoring, live classes and extra visuals are paused until more are added."
                : "The school is running low on credits."}{" "}
              {school.canManage ? "Buy more on the Billing page." : "Let your school admin know."}
            </p>
          )}
          {authoring && (
            <div className="space-y-3 border-t pt-3">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-primary" />
                Lesson authoring this month
              </p>
              <AllowanceRow label="Visuals" usage={authoring.visuals} cost={authoring.creditsPerVisual} />
              <AllowanceRow label="Images" usage={authoring.images} cost={authoring.creditsPerImage} />
              <p className="text-xs text-muted-foreground">
                The free allowance is shared by everyone at your school and resets on the 1st.
              </p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Your live AI use this month: {plural(data!.myUsage.voiceMinutes, "tutor minute")}
            {data!.myUsage.liveClassMinutes ? `, ${plural(data!.myUsage.liveClassMinutes, "live class minute")}` : ""}.
          </p>
        </div>
      ) : null}
    </DashboardSection>
  );
}
