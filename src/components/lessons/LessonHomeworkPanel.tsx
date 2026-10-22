'use client';

import Link from 'next/link';
import { NotebookPen, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Homework } from '@/lib/homework/domain';
import { DataState, formatHomeworkDate, homeworkDue, useHomeworkData } from '@/components/homework/shared';

type Item = { homework: Homework; assigned: number; submitted: number; marked?: number };

const statusLabel: Record<string, string> = { draft: 'Draft', published: 'Assigned', archived: 'Archived' };

/** Homework this teacher created from one lesson, with a way to add more. */
export function LessonHomeworkPanel({ lessonId, live }: { lessonId: string; live: boolean }) {
    const { data, error, loading, refresh } = useHomeworkData<{ items: Item[]; hasMore: boolean }>(
        `/api/homework?page=0&lessonId=${encodeURIComponent(lessonId)}`,
    );
    const items = data?.items ?? [];

    return (
        <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between space-y-0">
                <div>
                    <CardTitle>Homework</CardTitle>
                    <CardDescription>
                        {live ? 'Homework you have set from this lesson.' : 'Publish this lesson to set homework from it.'}
                    </CardDescription>
                </div>
                {live ? (
                    <Button asChild>
                        <Link href={`/teachers/homework/new?lessonId=${lessonId}`}><Plus className="mr-2 h-4 w-4" />Create homework</Link>
                    </Button>
                ) : (
                    <Button disabled title="Publish the lesson first"><Plus className="mr-2 h-4 w-4" />Create homework</Button>
                )}
            </CardHeader>
            <CardContent>
                <DataState loading={loading} error={error} retry={refresh} />
                {data && !error && (items.length === 0 ? (
                    <div className="grid justify-items-center gap-2 py-10 text-center text-muted-foreground">
                        <NotebookPen className="h-8 w-8" />
                        <p>No homework from this lesson yet.</p>
                    </div>
                ) : (
                    <div className="divide-y">
                        {items.map(({ homework, assigned, submitted, marked }) => {
                            const draft = homework.status === 'draft';
                            const toMark = Math.max(0, submitted - (marked ?? 0));
                            return (
                                <article key={homework.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="font-medium break-words">{homework.title}</h3>
                                            <Badge variant={draft ? 'outline' : 'secondary'}>{statusLabel[homework.status] ?? homework.status}</Badge>
                                        </div>
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            Due {formatHomeworkDate(homeworkDue(homework), homework.timezone)}
                                            {!draft && ` · ${submitted} / ${assigned} submitted`}
                                            {!draft && toMark > 0 && ` · ${toMark} to mark`}
                                        </p>
                                    </div>
                                    <Button variant="outline" size="sm" asChild>
                                        <Link href={`/teachers/homework/${homework.id}${draft ? '/edit' : ''}`}>{draft ? 'Edit draft' : 'Open'}</Link>
                                    </Button>
                                </article>
                            );
                        })}
                    </div>
                ))}
                {data?.hasMore && (
                    <Button variant="link" className="px-0" asChild><Link href="/teachers/homework">See all homework</Link></Button>
                )}
            </CardContent>
        </Card>
    );
}
