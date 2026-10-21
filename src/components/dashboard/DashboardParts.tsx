"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function DashboardSection({
  title,
  icon,
  href,
  linkLabel = "See all",
  loading,
  error,
  retry,
  children,
}: {
  title: string;
  icon?: ReactNode;
  href?: string;
  linkLabel?: string;
  loading?: boolean;
  error?: string;
  retry?: () => void;
  children: ReactNode;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-3">
        <CardTitle className="flex min-w-0 items-center gap-2 text-lg">
          {icon}
          <span className="break-words">{title}</span>
        </CardTitle>
        {href && (
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11 shrink-0 xl:min-h-0"
            asChild
          >
            <Link href={href}>{linkLabel}</Link>
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="text-sm">
            <p className="text-destructive">{error}</p>
            {retry && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3 min-h-11 xl:min-h-0"
                onClick={retry}
              >
                Try again
              </Button>
            )}
          </div>
        ) : loading ? (
          <div
            role="status"
            className="flex items-center gap-2 py-4 text-sm text-muted-foreground"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

export function DashboardEmpty({ children }: { children: ReactNode }) {
  return <p className="py-2 text-sm text-muted-foreground">{children}</p>;
}

export function DashboardStats({
  items,
}: {
  items: {
    label: string;
    value: ReactNode;
    detail?: string;
    href?: string;
  }[];
}) {
  return (
    <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
      {items.map((i) => {
        const body = (
          <>
            <p className="text-xs text-muted-foreground">{i.label}</p>
            <p className="my-1 text-2xl font-medium sm:text-3xl">{i.value}</p>
            {i.detail && (
              <p className="text-xs text-muted-foreground">{i.detail}</p>
            )}
          </>
        );
        return i.href ? (
          <Link
            key={i.label}
            href={i.href}
            className="min-w-0 break-words rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {body}
          </Link>
        ) : (
          <div
            key={i.label}
            className="min-w-0 break-words rounded-lg border bg-card p-4"
          >
            {body}
          </div>
        );
      })}
    </div>
  );
}

export function QuickLinkCard({
  title,
  description,
  icon,
  href,
  action,
  accent,
}: {
  title: string;
  description: ReactNode;
  icon: ReactNode;
  href: string;
  action: string;
  accent: "primary" | "secondary" | "accent" | "muted";
}) {
  const border = {
    primary: "border-t-primary",
    secondary: "border-t-secondary",
    accent: "border-t-accent",
    muted: "border-t-muted-foreground",
  }[accent];
  return (
    <Card className={`dashboard-card flex flex-col border-t-4 ${border}`}>
      <CardHeader className="flex-1">
        <CardTitle className="flex items-center gap-2 break-words text-base">
          {icon}
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" className="min-h-11 w-full xl:min-h-0" asChild>
          <Link href={href}>{action}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
