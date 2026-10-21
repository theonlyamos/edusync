'use client';

import { LessonIntroduction } from '@/components/lessons/LessonIntroduction';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ContentGenerationForm } from '@/components/content/ContentGenerationForm';
import { QuizContent, WorksheetContent, ExplanationContent, SummaryContent } from '@/components/content/types';
import type {
    QuizContentType,
    WorksheetContentType,
    ExplanationContentType,
    SummaryContentType
} from '@/components/content/types';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import Link from 'next/link';
import { FileText, Link as LinkIcon, ExternalLink, Plus, Brain, BookOpen, FileQuestion, FileText as FileTextIcon, ArrowLeft, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { ObjectiveAuthoringWorkspace } from '@/components/lessons/ObjectiveAuthoringWorkspace';
import { formatGradeLevel, formatLessonDate, lessonStatus } from '@/lib/lesson-record';
import { LessonStatusBadge } from '@/components/lessons/LessonStatusBadge';
import { DeleteConfirmationDialog } from '@/components/ui/delete-confirmation-dialog';

interface Resource {
    _id: string;
    title: string;
    description: string;
    type: 'file' | 'url';
    fileUrl?: string;
    filename?: string;
    url?: string;
    originalUrl?: string;
    lessonId: string;
    lessonTitle?: string;
    createdAt: string;
}

interface Lesson {
    _id: string;
    title: string;
    subject: string;
    gradeLevel: string;
    objectives: string | string[];
    content: string;
    teacherId: string;
    createdAt: string | null;
    updatedAt: string | null;
    current_publication_id?: string | null;
    archived_at?: string | null;
}

interface Content {
    _id: string;
    type: 'quiz' | 'worksheet' | 'explanation' | 'summary';
    content: QuizContentType | WorksheetContentType | ExplanationContentType | SummaryContentType;
    lessonId: string;
    createdAt: string;
}

interface ContentGenerationFormProps {
    lessonId: string;
    lessonTitle: string;
    subject: string;
    gradeLevel: string;
    onContentGenerated: (content: any) => void;
}

export default function LessonPage() {
    const params = useParams<{ lessonId: string }>();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const [lesson, setLesson] = useState<Lesson | null>(null);
    const [contents, setContents] = useState<Content[]>([]);
    const [resources, setResources] = useState<Resource[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [activeTab, setActiveTab] = useState('overview');
    const [lessonLoadError, setLessonLoadError] = useState('');
    const [pendingDelete, setPendingDelete] = useState<{ kind: 'lesson' } | { kind: 'content' | 'resource'; id: string } | null>(null);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        if (searchParams.get('tab') === 'studio') setActiveTab('studio');
    }, [searchParams]);

    useEffect(() => {
        if (params.lessonId) {
            fetchLesson();
            fetchContents();
            fetchResources();
        }
    }, [params.lessonId]);

    const fetchLesson = async () => {
        try {
            setLessonLoadError('');
            const response = await fetch(`/api/lessons/${params.lessonId}`);
            if (!response.ok) throw new Error(response.status === 404 ? 'This lesson no longer exists.' : 'The lesson could not be loaded.');
            const data = await response.json();
            setLesson(data);
        } catch (error) {
            console.error('Error:', error);
            setLessonLoadError(error instanceof Error ? error.message : 'The lesson could not be loaded.');
            toast({
                title: 'Error',
                description: 'Failed to fetch lesson',
                variant: 'destructive',
            });
        }
    };

    const fetchContents = async () => {
        try {
            const response = await fetch(`/api/content?lessonId=${params.lessonId}`);
            if (!response.ok) throw new Error('Failed to fetch contents');
            const data = await response.json();
            setContents(data);
        } catch (error) {
            console.error('Error:', error);
            toast({
                title: 'Error',
                description: 'Failed to fetch contents',
                variant: 'destructive',
            });
        }
    };

    const fetchResources = async () => {
        try {
            const response = await fetch(`/api/resources?lessonId=${params.lessonId}`);
            if (!response.ok) throw new Error('Failed to fetch resources');
            const data = await response.json();
            setResources(data);
        } catch (error) {
            console.error('Error:', error);
            toast({
                title: 'Error',
                description: 'Failed to fetch resources',
                variant: 'destructive',
            });
        }
    };

    const handleContentDelete = async (contentId: string) => {
        try {
            const response = await fetch(`/api/content/${contentId}`, {
                method: 'DELETE',
            });

            if (!response.ok) throw new Error('Failed to delete content');

            toast({
                title: 'Success',
                description: 'Content deleted successfully',
            });

            fetchContents();
        } catch (error) {
            console.error('Error:', error);
            toast({
                title: 'Error',
                description: 'Failed to delete content',
                variant: 'destructive',
            });
        }
    };

    const handleResourceDelete = async (resourceId: string) => {
        try {
            const response = await fetch(`/api/resources/${resourceId}`, {
                method: 'DELETE',
            });

            if (!response.ok) throw new Error('Failed to delete resource');

            toast({
                title: 'Success',
                description: 'Resource deleted successfully',
            });

            fetchResources();
        } catch (error) {
            console.error('Error:', error);
            toast({
                title: 'Error',
                description: 'Failed to delete resource',
                variant: 'destructive',
            });
        }
    };

    const handleLessonDelete = async () => {
        try {
            const response = await fetch(`/api/lessons/${params.lessonId}`, { method: 'DELETE' });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.error || 'The lesson could not be deleted.');
            toast(result.result === 'archived'
                ? { title: 'Lesson archived', description: 'Students can no longer open it. Their results and homework are kept. You can restore it from Archived.' }
                : { title: 'Lesson deleted', description: 'The draft and its generated materials were removed.' });
            router.push('/teachers/lessons');
        } catch (error) {
            toast({ title: 'Could not delete lesson', description: (error as Error).message, variant: 'destructive' });
        }
    };

    const confirmPendingDelete = async () => {
        if (!pendingDelete) return;
        setDeleting(true);
        try {
            if (pendingDelete.kind === 'lesson') await handleLessonDelete();
            else if (pendingDelete.kind === 'content') await handleContentDelete(pendingDelete.id);
            else await handleResourceDelete(pendingDelete.id);
        } finally {
            setDeleting(false);
            setPendingDelete(null);
        }
    };

    const getContentIcon = (type: Content['type']) => {
        switch (type) {
            case 'quiz':
                return <FileQuestion className="h-5 w-5" />;
            case 'worksheet':
                return <FileTextIcon className="h-5 w-5" />;
            case 'explanation':
                return <Brain className="h-5 w-5" />;
            case 'summary':
                return <BookOpen className="h-5 w-5" />;
        }
    };

    const getContentSummary = (content: Content) => {
        switch (content.type) {
            case 'quiz':
                const quiz = content.content as QuizContentType;
                return `${quiz.questions.length} Questions`;
            case 'worksheet':
                const worksheet = content.content as WorksheetContentType;
                return `${worksheet.problems.length} Problems`;
            case 'explanation':
                const explanation = content.content as ExplanationContentType;
                return `${explanation.sections.length} Sections`;
            case 'summary':
                const summary = content.content as SummaryContentType;
                return `${summary.mainPoints.length} Main Points`;
        }
    };

    if (!lesson) {
        return (
            <DashboardLayout>
                <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
                    {lessonLoadError ? (
                        <>
                            <p role="alert" className="text-destructive">{lessonLoadError}</p>
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={() => void fetchLesson()}>Try again</Button>
                                <Button asChild><Link href="/teachers/lessons">Back to lessons</Link></Button>
                            </div>
                        </>
                    ) : <p role="status" className="text-muted-foreground">Loading lesson…</p>}
                </div>
            </DashboardLayout>
        );
    }

    const status = lessonStatus(lesson);
    const deleteCopy = pendingDelete?.kind === 'lesson'
        ? status === 'draft'
            ? { title: 'Delete this draft?', description: 'This permanently removes the lesson, its objectives and every generated material. If you already set homework on it, it will be archived instead.' }
            : { title: 'Archive this lesson?', description: 'Students will no longer see it or be able to start it. Their results and any homework stay. You can restore it later from Archived.' }
        : pendingDelete?.kind === 'content'
            ? { title: 'Delete this content?', description: 'Students will no longer see it. This cannot be undone.' }
            : { title: 'Remove this resource?', description: 'Students will no longer see it. This cannot be undone.' };

    return (
        <DashboardLayout>
            <div className="p-3 sm:p-6">
                <Link href="/teachers/lessons" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="h-4 w-4" />Lessons
                </Link>
                <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-3">
                            <h1 className="text-3xl font-bold break-words">{lesson.title}</h1>
                            <LessonStatusBadge status={status} />
                        </div>
                        <p className="text-muted-foreground">
                            {lesson.subject} • {formatGradeLevel(lesson.gradeLevel)}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {status === 'live' && <Button variant="outline" asChild><Link href={`/teachers/homework/new?lessonId=${params.lessonId}`}>Create homework</Link></Button>}
                        <Button variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setPendingDelete({ kind: 'lesson' })}>
                            <Trash2 className="mr-2 h-4 w-4" />{status === 'draft' ? 'Delete lesson' : 'Archive lesson'}
                        </Button>
                    </div>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="grid h-auto grid-cols-2 sm:inline-flex">
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="studio">Objective Studio</TabsTrigger>
                        <TabsTrigger value="content">Content</TabsTrigger>
                        <TabsTrigger value="resources">Resources</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="mt-6">
                        <LessonIntroduction lessonId={params.lessonId} />
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Lesson Details Card */}
                            <Card className="lg:col-span-2">
                                <CardHeader>
                                    <CardTitle>Lesson Details</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-2 gap-4 mb-6">
                                        <div>
                                            <p className="text-sm text-muted-foreground">Subject</p>
                                            <p className="font-medium">{lesson.subject}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-muted-foreground">Grade Level</p>
                                            <p className="font-medium">{formatGradeLevel(lesson.gradeLevel)}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-muted-foreground">Created</p>
                                            <p className="font-medium">
                                                {formatLessonDate(lesson.createdAt)}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-muted-foreground">Last Updated</p>
                                            <p className="font-medium">
                                                {formatLessonDate(lesson.updatedAt)}
                                            </p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Quick Stats Card */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Quick Stats</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground">Generated Content</span>
                                            <span className="font-medium">{contents.length}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground">Resources</span>
                                            <span className="font-medium">{resources.length}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground">Objectives</span>
                                            <span className="font-medium">
                                                {Array.isArray(lesson.objectives) ? lesson.objectives.length : 1}
                                            </span>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Objectives Card */}
                            <Card className="lg:col-span-3">
                                <CardHeader>
                                    <CardTitle>Learning Objectives</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {Array.isArray(lesson.objectives) ? (
                                        <ul className="list-disc list-inside space-y-2">
                                            {lesson.objectives.map((objective, index) => (
                                                <li key={index} className="text-muted-foreground">
                                                    {objective}
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="text-muted-foreground">{lesson.objectives || 'No objectives defined'}</p>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    <TabsContent value="studio" className="mt-6">
                        <ObjectiveAuthoringWorkspace lessonId={params.lessonId as string} />
                    </TabsContent>

                    <TabsContent value="content" className="mt-6">
                        {/* Lesson Content Section */}
                        {lesson.content && (
                            <Card className="mb-6">
                                <CardHeader>
                                    <CardTitle>Lesson Content</CardTitle>
                                    <CardDescription>The main lesson material for students</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="prose prose-sm dark:prose-invert max-w-none">
                                        <ReactMarkdown>
                                            {lesson.content}
                                        </ReactMarkdown>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* Generated Content Section */}
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-2xl font-bold">Generated Content</h2>
                            <Button onClick={() => setIsGenerating(true)}>
                                Generate Content
                            </Button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {contents.map((content) => (
                                <Card key={content._id}>
                                    <CardHeader>
                                        <div className="flex items-center gap-2">
                                            {getContentIcon(content.type)}
                                            <div>
                                                <CardTitle className="capitalize">
                                                    {content.type}
                                                </CardTitle>
                                                <CardDescription>
                                                    {getContentSummary(content)}
                                                </CardDescription>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-sm text-muted-foreground mb-4">
                                            {(content.content as any).description}
                                        </p>
                                        <div className="flex justify-between items-center">
                                            <Link
                                                href={`/teachers/lessons/${params.lessonId}/content/${content._id}`}
                                                className="text-primary hover:underline text-sm"
                                            >
                                                View Details
                                            </Link>
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                onClick={() => setPendingDelete({ kind: 'content', id: content._id })}
                                            >
                                                Delete
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>

                        {isGenerating && (
                            <ContentGenerationForm
                                lessonId={params.lessonId as string}
                                lessonTitle={lesson.title}
                                subject={lesson.subject}
                                gradeLevel={lesson.gradeLevel}
                                onContentGenerated={(content) => {
                                    setIsGenerating(false);
                                    fetchContents();
                                }}
                                onClose={() => setIsGenerating(false)}
                                open={isGenerating}
                            />
                        )}
                    </TabsContent>

                    <TabsContent value="resources" className="mt-6">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-2xl font-bold">Lesson Resources</h2>
                            <Button onClick={() => router.push(`/teachers/resources?lessonId=${params.lessonId}`)}>
                                <Plus className="h-4 w-4 mr-2" />
                                Add Resource
                            </Button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {resources.map((resource) => (
                                <Card key={resource._id}>
                                    <CardContent className="p-6">
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1">
                                                <h2 className="text-xl font-semibold mb-2">{resource.title}</h2>
                                                <p className="text-muted-foreground mb-4">{resource.description}</p>
                                                {resource.type === 'file' && resource.fileUrl && (
                                                    <a
                                                        href={resource.fileUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-primary hover:underline inline-flex items-center gap-2"
                                                    >
                                                        <FileText className="h-4 w-4" />
                                                        {resource.filename || 'Download File'}
                                                    </a>
                                                )}
                                                {resource.type === 'url' && (
                                                    <div className="space-y-2">
                                                        {resource.fileUrl && (
                                                            <a
                                                                href={resource.fileUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-primary hover:underline inline-flex items-center gap-2"
                                                            >
                                                                <FileText className="h-4 w-4" />
                                                                View Saved Content
                                                            </a>
                                                        )}
                                                        {resource.originalUrl && (
                                                            <a
                                                                href={resource.originalUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-primary hover:underline inline-flex items-center gap-2 block"
                                                            >
                                                                <ExternalLink className="h-4 w-4" />
                                                                Visit Original URL
                                                            </a>
                                                        )}
                                                    </div>
                                                )}
                                                <p className="text-sm text-muted-foreground mt-4">
                                                    Added {new Date(resource.createdAt).toLocaleDateString()}
                                                </p>
                                            </div>
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                onClick={() => setPendingDelete({ kind: 'resource', id: resource._id })}
                                            >
                                                Delete
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
            <DeleteConfirmationDialog
                open={!!pendingDelete}
                onOpenChange={(open) => { if (!open && !deleting) setPendingDelete(null); }}
                onConfirm={confirmPendingDelete}
                title={deleteCopy.title}
                description={deleteCopy.description}
                isDeleting={deleting}
                confirmLabel={pendingDelete?.kind === 'lesson' && status !== 'draft' ? 'Archive' : 'Delete'}
            />
        </DashboardLayout>
    );
}
