'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { BookOpen, FileText, HelpCircle, ListChecks, Loader2, Trash2 } from 'lucide-react';

type ContentType = 'quiz' | 'worksheet' | 'explanation' | 'summary';

interface ContentItem {
  id: string;
  type: ContentType;
  lessonId: string;
  lessonTitle?: string;
  createdAt: string;
  content: { title?: string; description?: string; questions?: unknown[]; problems?: unknown[] } | null;
}

const TYPES: { value: ContentType; label: string; singular: string; icon: typeof ListChecks }[] = [
  { value: 'quiz', label: 'Quizzes', singular: 'Quiz', icon: ListChecks },
  { value: 'worksheet', label: 'Worksheets', singular: 'Worksheet', icon: FileText },
  { value: 'explanation', label: 'Explanations', singular: 'Explanation', icon: HelpCircle },
  { value: 'summary', label: 'Summaries', singular: 'Summary', icon: BookOpen },
];

function detail(item: ContentItem) {
  const questions = item.content?.questions?.length;
  const problems = item.content?.problems?.length;
  if (item.type === 'quiz' && questions) return `${questions} question${questions === 1 ? '' : 's'}`;
  if (item.type === 'worksheet' && problems) return `${problems} problem${problems === 1 ? '' : 's'}`;
  return item.content?.description ?? '';
}

function ContentLibrary() {
  const router = useRouter();
  const search = useSearchParams();
  const { toast } = useToast();
  const requested = search.get('type');
  const type = TYPES.some((t) => t.value === requested) ? (requested as ContentType) : 'all';
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const response = await fetch('/api/content');
      if (!response.ok) throw new Error('Could not load your content');
      setItems(await response.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const result: Record<string, number> = { all: items.length };
    for (const item of items) result[item.type] = (result[item.type] ?? 0) + 1;
    return result;
  }, [items]);
  const shown = type === 'all' ? items : items.filter((item) => item.type === type);

  const remove = async (item: ContentItem) => {
    if (!window.confirm(`Delete "${item.content?.title ?? 'this content'}"? Students will no longer see it.`)) return;
    setDeleting(item.id);
    try {
      const response = await fetch(`/api/content/${item.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete content');
      setItems((current) => current.filter((row) => row.id !== item.id));
      toast({ title: 'Content deleted' });
    } catch (e) {
      toast({ title: 'Could not delete', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Content</h1>
          <p className="text-muted-foreground">Quizzes, worksheets, explanations and summaries across all your lessons.</p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/teachers/lessons">Create from a lesson</Link>
        </Button>
      </div>

      <Tabs
        value={type}
        onValueChange={(value) => router.replace(value === 'all' ? '/teachers/content' : `/teachers/content?type=${value}`)}
      >
        <TabsList className="flex h-auto w-full flex-wrap justify-start sm:w-auto">
          <TabsTrigger value="all" className="min-h-11 xl:min-h-0">All ({counts.all ?? 0})</TabsTrigger>
          {TYPES.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="min-h-11 xl:min-h-0">
              {t.label} ({counts[t.value] ?? 0})
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading content…
        </div>
      ) : error ? (
        <div className="space-y-2">
          <p className="text-destructive">{error}</p>
          <Button variant="outline" onClick={() => { setLoading(true); void load(); }}>Try again</Button>
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <p className="text-muted-foreground">
            Nothing here yet. Open a lesson and use its Content tab to generate quizzes, worksheets, explanations or summaries.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {shown.map((item) => {
            const meta = TYPES.find((t) => t.value === item.type);
            const Icon = meta?.icon ?? FileText;
            return (
              <Card key={item.id} className="min-w-0">
                <CardContent className="space-y-2 pt-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      <Icon className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                      <Link
                        href={`/teachers/lessons/${item.lessonId}/content/${item.id}`}
                        className="break-words font-semibold hover:underline"
                      >
                        {item.content?.title || meta?.singular || 'Content'}
                      </Link>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete content"
                      disabled={deleting === item.id}
                      onClick={() => remove(item)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary">{meta?.singular ?? item.type}</Badge>
                    {item.lessonTitle && (
                      <Link href={`/teachers/lessons/${item.lessonId}?tab=content`} className="hover:underline">
                        {item.lessonTitle}
                      </Link>
                    )}
                    <span>· {new Date(item.createdAt).toLocaleDateString()}</span>
                  </div>
                  {detail(item) && <p className="line-clamp-2 text-sm text-muted-foreground">{detail(item)}</p>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ContentPage() {
  return (
    <DashboardLayout>
      <Suspense fallback={null}>
        <ContentLibrary />
      </Suspense>
    </DashboardLayout>
  );
}
