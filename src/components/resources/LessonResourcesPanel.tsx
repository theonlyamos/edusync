'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Plus } from 'lucide-react';
import { ResourceModal } from './ResourceModal';
import { LessonResourceList } from './LessonResourceList';
import type { LessonResource } from '@/lib/lesson-resources';

/** A lesson's resources with add and delete, for the teacher and admin lesson pages. */
export function LessonResourcesPanel({ lessonId }: { lessonId: string }) {
    const [resources, setResources] = useState<LessonResource[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [open, setOpen] = useState(false);

    const load = useCallback(async () => {
        setError('');
        try {
            const response = await fetch(`/api/resources?lessonId=${encodeURIComponent(lessonId)}`);
            if (!response.ok) throw new Error('Could not load resources');
            setResources(await response.json());
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [lessonId]);

    useEffect(() => {
        void load();
    }, [load]);

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-xl font-bold">Lesson resources</h2>
                    <p className="text-sm text-muted-foreground">Files and links students see on this lesson&apos;s Resources tab.</p>
                </div>
                <Button onClick={() => setOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add resource
                </Button>
            </div>
            {loading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading resources…
                </div>
            ) : error ? (
                <div className="space-y-2">
                    <p className="text-destructive">{error}</p>
                    <Button variant="outline" onClick={() => { setLoading(true); void load(); }}>Try again</Button>
                </div>
            ) : (
                <LessonResourceList
                    resources={resources}
                    canManage
                    onDeleted={(id) => setResources((current) => current.filter((resource) => resource.id !== id))}
                    emptyText="No resources yet. Add a worksheet, slides or a video link for your students."
                />
            )}
            <ResourceModal
                open={open}
                onOpenChange={setOpen}
                lessonId={lessonId}
                onSuccess={(created) => setResources((current) => [created, ...current])}
            />
        </div>
    );
}
