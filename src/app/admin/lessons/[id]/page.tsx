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
import {
    ArrowLeft,
    BookOpen,
    GraduationCap,
    User,
    Calendar,
    Pencil,
    Trash2,
    Target,
    FileText
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

interface PageProps {
    params: Promise<{ id: string }>;
}

export default function AdminLessonDetailsPage({ params }: PageProps) {
    const resolvedParams = use(params);
    const router = useRouter();
    const { toast } = useToast();
    const [lesson, setLesson] = useState<Lesson | null>(null);
    const [loading, setLoading] = useState(true);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        fetchLesson();
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

                {/* Meta Info Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <User className="h-4 w-4 text-muted-foreground" />
                                Assigned Teacher
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {loading ? (
                                <Skeleton className="h-5 w-32" />
                            ) : lesson?.teacherName ? (
                                <div>
                                    <p className="font-medium">{lesson.teacherName}</p>
                                    <p className="text-sm text-muted-foreground">{lesson.teacherEmail}</p>
                                </div>
                            ) : (
                                <p className="text-muted-foreground">Not assigned</p>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                Created
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {loading ? (
                                <Skeleton className="h-5 w-24" />
                            ) : (
                                <p className="font-medium">
                                    {new Date(lesson?.created_at || '').toLocaleDateString()}
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                Last Updated
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {loading ? (
                                <Skeleton className="h-5 w-24" />
                            ) : (
                                <p className="font-medium">
                                    {new Date(lesson?.updated_at || '').toLocaleDateString()}
                                </p>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Objectives */}
                <Card className="mb-6">
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
                                <Skeleton className="h-4 w-1/2" />
                            </div>
                        ) : lesson?.objectives?.length ? (
                            <ul className="list-disc list-inside space-y-1">
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

                {/* Content */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <FileText className="h-5 w-5 text-primary" />
                            Lesson Content
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="space-y-2">
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-3/4" />
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-1/2" />
                            </div>
                        ) : lesson?.content ? (
                            <div className="prose prose-sm dark:prose-invert max-w-none">
                                <ReactMarkdown>{lesson.content}</ReactMarkdown>
                            </div>
                        ) : (
                            <p className="text-muted-foreground">No content available</p>
                        )}
                    </CardContent>
                </Card>

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
