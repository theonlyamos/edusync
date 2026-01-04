'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { use } from 'react';
import ReactMarkdown from 'react-markdown';
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { AdminLessonModal } from "@/components/lessons/AdminLessonModal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    ArrowLeft,
    User,
    Calendar,
    Pencil,
    Trash2,
    Target,
    FileText,
    BookOpen,
    FolderOpen,
    Brain,
    FileQuestion
} from "lucide-react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Lesson {
    id: string;
    title: string;
    subject: string;
    gradelevel: string;
    objectives?: string[];
    content?: string;
    teacher_id?: string;
    teacherName?: string;
    teacherEmail?: string;
    created_at: string;
    updated_at: string;
}

interface Content {
    id: string;
    type: string;
    content: any;
    lesson_id: string;
    created_at: string;
}

interface PageProps {
    params: Promise<{ id: string }>;
}

export default function AdminLessonDetailsPage({ params }: PageProps) {
    const resolvedParams = use(params);
    const router = useRouter();
    const { toast } = useToast();
    const [lesson, setLesson] = useState<Lesson | null>(null);
    const [contents, setContents] = useState<Content[]>([]);
    const [resources, setResources] = useState<Content[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [activeTab, setActiveTab] = useState('overview');

    useEffect(() => {
        fetchLesson();
        fetchContents();
        fetchResources();
    }, [resolvedParams.id]);

    const fetchLesson = async () => {
        try {
            const response = await fetch(`/api/admin/lessons/${resolvedParams.id}`);
            if (!response.ok) throw new Error('Failed to fetch lesson');
            const data = await response.json();
            setLesson(data);
        } catch (error) {
            console.error('Error:', error);
            toast({
                title: 'Error',
                description: 'Failed to fetch lesson details',
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    };

    const fetchContents = async () => {
        try {
            const response = await fetch(`/api/content?lessonId=${resolvedParams.id}`);
            if (!response.ok) throw new Error('Failed to fetch contents');
            const data = await response.json();
            setContents(data.filter((c: any) => c.type !== 'resource') || []);
        } catch (error) {
            console.error('Error fetching contents:', error);
        }
    };

    const fetchResources = async () => {
        try {
            const response = await fetch(`/api/resources?lessonId=${resolvedParams.id}`);
            if (!response.ok) throw new Error('Failed to fetch resources');
            const data = await response.json();
            setResources(data || []);
        } catch (error) {
            console.error('Error fetching resources:', error);
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        try {
            const response = await fetch(`/api/admin/lessons/${resolvedParams.id}`, {
                method: 'DELETE',
            });
            if (!response.ok) throw new Error('Failed to delete lesson');

            toast({
                title: 'Success',
                description: 'Lesson deleted successfully',
            });
            router.push('/admin/lessons');
        } catch (error) {
            console.error('Error:', error);
            toast({
                title: 'Error',
                description: 'Failed to delete lesson',
                variant: 'destructive',
            });
        } finally {
            setDeleting(false);
        }
    };

    const getContentIcon = (type: string) => {
        switch (type) {
            case 'quiz':
                return <FileQuestion className="h-5 w-5" />;
            case 'worksheet':
                return <FileText className="h-5 w-5" />;
            case 'explanation':
                return <Brain className="h-5 w-5" />;
            case 'summary':
                return <BookOpen className="h-5 w-5" />;
            default:
                return <FileText className="h-5 w-5" />;
        }
    };

    return (
        <DashboardLayout>
            <div className="container mx-auto py-6 max-w-5xl">
                {/* Header */}
                <div className="mb-6">
                    <Button
                        variant="ghost"
                        className="mb-4"
                        onClick={() => router.push('/admin/lessons')}
                    >
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Lessons
                    </Button>

                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            {loading ? (
                                <>
                                    <Skeleton className="h-8 w-96 mb-2" />
                                    <Skeleton className="h-5 w-48" />
                                </>
                            ) : (
                                <>
                                    <h1 className="text-3xl font-bold">{lesson?.title}</h1>
                                    <div className="flex items-center gap-2 mt-2">
                                        <Badge variant="secondary">{lesson?.subject}</Badge>
                                        <Badge variant="outline">{lesson?.gradelevel?.toUpperCase()}</Badge>
                                    </div>
                                </>
                            )}
                        </div>

                        {!loading && lesson && (
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => setIsEditModalOpen(true)}
                                >
                                    <Pencil className="h-4 w-4 mr-2" />
                                    Edit
                                </Button>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="destructive" disabled={deleting}>
                                            <Trash2 className="h-4 w-4 mr-2" />
                                            Delete
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Delete Lesson</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                Are you sure you want to delete "{lesson.title}"? This action cannot be undone.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleDelete}>
                                                Delete
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                        )}
                    </div>
                </div>

                {/* Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList>
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="content">Content</TabsTrigger>
                        <TabsTrigger value="resources">Resources</TabsTrigger>
                    </TabsList>

                    {/* Overview Tab */}
                    <TabsContent value="overview" className="mt-6">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Lesson Details Card */}
                            <Card className="lg:col-span-2">
                                <CardHeader>
                                    <CardTitle>Lesson Details</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-sm text-muted-foreground">Subject</p>
                                            <p className="font-medium">{lesson?.subject}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-muted-foreground">Grade Level</p>
                                            <p className="font-medium">{lesson?.gradelevel?.toUpperCase()}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-muted-foreground">Assigned Teacher</p>
                                            {lesson?.teacherName ? (
                                                <div>
                                                    <p className="font-medium">{lesson.teacherName}</p>
                                                    <p className="text-sm text-muted-foreground">{lesson.teacherEmail}</p>
                                                </div>
                                            ) : (
                                                <p className="text-muted-foreground">Not assigned</p>
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-sm text-muted-foreground">Created</p>
                                            <p className="font-medium">
                                                {new Date(lesson?.created_at || '').toLocaleDateString()}
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
                                                {lesson?.objectives?.length || 0}
                                            </span>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Objectives Card */}
                            <Card className="lg:col-span-3">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Target className="h-5 w-5 text-primary" />
                                        Learning Objectives
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {loading ? (
                                        <div className="space-y-2">
                                            <Skeleton className="h-4 w-full" />
                                            <Skeleton className="h-4 w-3/4" />
                                        </div>
                                    ) : lesson?.objectives?.length ? (
                                        <ul className="list-disc list-inside space-y-2">
                                            {lesson.objectives.map((objective, index) => (
                                                <li key={index} className="text-muted-foreground">
                                                    {objective}
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="text-muted-foreground">No objectives defined</p>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    {/* Content Tab */}
                    <TabsContent value="content" className="mt-6">
                        {/* Lesson Content */}
                        {lesson?.content && (
                            <Card className="mb-6">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <FileText className="h-5 w-5 text-primary" />
                                        Lesson Content
                                    </CardTitle>
                                    <CardDescription>The main lesson material</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="prose prose-sm dark:prose-invert max-w-none">
                                        <ReactMarkdown>{lesson.content}</ReactMarkdown>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* Generated Content */}
                        <h2 className="text-xl font-bold mb-4">Generated Content</h2>
                        {contents.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {contents.map((content) => (
                                    <Card key={content.id}>
                                        <CardHeader>
                                            <div className="flex items-center gap-2">
                                                {getContentIcon(content.type)}
                                                <CardTitle className="capitalize text-lg">
                                                    {content.type}
                                                </CardTitle>
                                            </div>
                                            <CardDescription>
                                                Created {new Date(content.created_at).toLocaleDateString()}
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            <p className="text-sm text-muted-foreground">
                                                {content.content?.description || 'No description'}
                                            </p>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        ) : (
                            <p className="text-muted-foreground">No generated content yet</p>
                        )}
                    </TabsContent>

                    {/* Resources Tab */}
                    <TabsContent value="resources" className="mt-6">
                        <h2 className="text-xl font-bold mb-4">Lesson Resources</h2>
                        {resources.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {resources.map((resource) => (
                                    <Card key={resource.id}>
                                        <CardHeader>
                                            <div className="flex items-center gap-2">
                                                <FolderOpen className="h-5 w-5" />
                                                <CardTitle className="text-lg">
                                                    {resource.content?.title || 'Resource'}
                                                </CardTitle>
                                            </div>
                                        </CardHeader>
                                        <CardContent>
                                            <p className="text-sm text-muted-foreground">
                                                {resource.content?.description || 'No description'}
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-2">
                                                Added {new Date(resource.created_at).toLocaleDateString()}
                                            </p>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        ) : (
                            <p className="text-muted-foreground">No resources attached</p>
                        )}
                    </TabsContent>
                </Tabs>

                {/* Edit Modal */}
                {lesson && (
                    <AdminLessonModal
                        open={isEditModalOpen}
                        onOpenChange={setIsEditModalOpen}
                        lesson={{
                            id: lesson.id,
                            title: lesson.title,
                            subject: lesson.subject,
                            gradelevel: lesson.gradelevel,
                            objectives: lesson.objectives,
                            content: lesson.content,
                            teacher_id: lesson.teacher_id,
                        }}
                        onSuccess={fetchLesson}
                    />
                )}
            </div>
        </DashboardLayout>
    );
}
