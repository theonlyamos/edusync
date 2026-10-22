'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { ExternalLink, FileText, Link as LinkIcon, Trash2 } from 'lucide-react';
import { formatBytes, type LessonResource } from '@/lib/lesson-resources';
import { formatDate } from '@/lib/format-date';

interface LessonResourceListProps {
    resources: LessonResource[];
    /** Teachers can delete; students only open. */
    canManage?: boolean;
    /** Show which lesson each resource belongs to (library view). */
    showLesson?: boolean;
    onDeleted?: (id: string) => void;
    emptyText?: string;
}

export function LessonResourceList({ resources, canManage, showLesson, onDeleted, emptyText }: LessonResourceListProps) {
    const { toast } = useToast();
    const [deleting, setDeleting] = useState<string | null>(null);

    const remove = async (resource: LessonResource) => {
        if (!window.confirm(`Delete "${resource.title}"? Students will no longer see it.`)) return;
        setDeleting(resource.id);
        try {
            const response = await fetch(`/api/resources/${resource.id}`, { method: 'DELETE' });
            if (!response.ok) {
                const body = await response.json().catch(() => null);
                throw new Error(body?.error ?? 'Failed to delete resource');
            }
            onDeleted?.(resource.id);
            toast({ title: 'Resource deleted' });
        } catch (error) {
            toast({ title: 'Could not delete', description: (error as Error).message, variant: 'destructive' });
        } finally {
            setDeleting(null);
        }
    };

    if (resources.length === 0) {
        return (
            <div className="rounded-lg border border-dashed py-12 text-center">
                <p className="text-muted-foreground">{emptyText ?? "This lesson doesn't have any resources yet."}</p>
            </div>
        );
    }

    return (
        <div className="grid gap-4 md:grid-cols-2">
            {resources.map((resource) => {
                const href = resource.type === 'file' ? resource.fileUrl : resource.url;
                return (
                    <Card key={resource.id} className="min-w-0">
                        <CardContent className="space-y-2 pt-6">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex min-w-0 items-start gap-2">
                                    {resource.type === 'file'
                                        ? <FileText className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                                        : <LinkIcon className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />}
                                    <h3 className="break-words font-semibold">{resource.title}</h3>
                                </div>
                                {canManage && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        aria-label={`Delete ${resource.title}`}
                                        disabled={deleting === resource.id}
                                        onClick={() => remove(resource)}
                                    >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                )}
                            </div>
                            {showLesson && resource.lessonTitle && (
                                <p className="text-xs text-muted-foreground">
                                    Lesson:{' '}
                                    <Link href={`/teachers/lessons/${resource.lessonId}`} className="hover:underline">
                                        {resource.lessonTitle}
                                    </Link>
                                </p>
                            )}
                            {resource.description && (
                                <p className="whitespace-pre-line break-words text-sm text-muted-foreground">{resource.description}</p>
                            )}
                            {href && (
                                <a
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex min-h-11 max-w-full items-center gap-1 break-all text-sm text-primary hover:underline"
                                >
                                    {resource.type === 'file'
                                        ? `${resource.filename ?? 'Open file'}${resource.size ? ` · ${formatBytes(resource.size)}` : ''}`
                                        : resource.url}
                                    <ExternalLink className="h-3 w-3 shrink-0" />
                                </a>
                            )}
                            <p className="text-xs text-muted-foreground">
                                Added {formatDate(resource.createdAt)}
                            </p>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}
