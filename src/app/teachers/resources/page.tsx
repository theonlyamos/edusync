'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus } from 'lucide-react';
import { ResourceModal } from '@/components/resources/ResourceModal';
import { LessonResourceList } from '@/components/resources/LessonResourceList';
import type { LessonResource } from '@/lib/lesson-resources';

interface LessonOption {
    id: string;
    title: string;
}

export default function ResourcesPage() {
    const [resources, setResources] = useState<LessonResource[]>([]);
    const [lessons, setLessons] = useState<LessonOption[]>([]);
    const [lessonFilter, setLessonFilter] = useState('all');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [open, setOpen] = useState(false);

    const load = useCallback(async () => {
        setError('');
        try {
            const [resourceResponse, lessonResponse] = await Promise.all([fetch('/api/resources'), fetch('/api/lessons')]);
            if (!resourceResponse.ok) throw new Error('Could not load resources');
            if (!lessonResponse.ok) throw new Error('Could not load your lessons');
            setResources(await resourceResponse.json());
            const lessonRows = await lessonResponse.json() as { _id?: string; id?: string; title: string }[];
            setLessons(lessonRows.map((lesson) => ({ id: String(lesson._id ?? lesson.id), title: lesson.title })));
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const shown = useMemo(
        () => (lessonFilter === 'all' ? resources : resources.filter((resource) => resource.lessonId === lessonFilter)),
        [resources, lessonFilter],
    );

    return (
        <DashboardLayout>
            <div className="space-y-6 p-4 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold">Resources</h1>
                        <p className="text-muted-foreground">Files and links you&apos;ve shared with students, across all your lessons.</p>
                    </div>
                    <Button onClick={() => setOpen(true)} disabled={lessons.length === 0 && !loading}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add resource
                    </Button>
                </div>

                {lessons.length > 1 && (
                    <Select value={lessonFilter} onValueChange={setLessonFilter}>
                        <SelectTrigger className="w-full sm:w-72" aria-label="Filter by lesson">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All lessons</SelectItem>
                            {lessons.map((lesson) => (
                                <SelectItem key={lesson.id} value={lesson.id}>{lesson.title}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}

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
                        resources={shown}
                        canManage
                        showLesson
                        onDeleted={(id) => setResources((current) => current.filter((resource) => resource.id !== id))}
                        emptyText={lessons.length === 0
                            ? 'Create a lesson first, then add files or links to it.'
                            : 'No resources yet. Add a worksheet, slides or a video link for your students.'}
                    />
                )}
            </div>
            <ResourceModal
                open={open}
                onOpenChange={setOpen}
                lessonId={lessonFilter !== 'all' ? lessonFilter : undefined}
                lessons={lessons}
                onSuccess={(created) => {
                    const lessonTitle = lessons.find((lesson) => lesson.id === created.lessonId)?.title;
                    setResources((current) => [{ ...created, lessonTitle }, ...current]);
                }}
            />
        </DashboardLayout>
    );
}
