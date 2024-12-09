'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
import { FileText, Link as LinkIcon, ExternalLink, Plus, Brain, BookOpen, FileQuestion, FileText as FileTextIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

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
    objectives: string;
    content: string;
    teacherId: string;
    createdAt: string;
    updatedAt: string;
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
    const params = useParams();
    const router = useRouter();
    const { toast } = useToast();
    const [lesson, setLesson] = useState<Lesson | null>(null);
    const [contents, setContents] = useState<Content[]>([]);
    const [resources, setResources] = useState<Resource[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [activeTab, setActiveTab] = useState('overview');

    useEffect(() => {
        if (params.lessonId) {
            fetchLesson();
            fetchContents();
            fetchResources();
        }
    }, [params.lessonId]);

    const fetchLesson = async () => {
        try {
            const response = await fetch(`/api/lessons/${params.lessonId}`);
            if (!response.ok) throw new Error('Failed to fetch lesson');
            const data = await response.json();
            setLesson(data);
        } catch (error) {
            console.error('Error:', error);
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
                <div className="flex items-center justify-center min-h-screen">
                    <p>Loading...</p>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className="p-6">
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h1 className="text-3xl font-bold">{lesson.title}</h1>
                        <p className="text-muted-foreground">
                            {lesson.subject} • Grade {lesson.gradeLevel}
                        </p>
                    </div>
                    <Button onClick={() => router.push('/teachers/lessons')}>
                        Back to Lessons
                    </Button>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList>
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="content">Content</TabsTrigger>
                        <TabsTrigger value="resources">Resources</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="mt-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Lesson Overview</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-6">
                                    <div>
                                        <h3 className="text-lg font-semibold mb-2">Objectives</h3>
                                        <div className="prose prose-sm max-w-none">
                                            <ReactMarkdown>
                                                {lesson.objectives}
                                            </ReactMarkdown>
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold mb-2">Content</h3>
                                        <div className="prose prose-sm max-w-none">
                                            <ReactMarkdown>
                                                {lesson.content}
                                            </ReactMarkdown>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="content" className="mt-6">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-2xl font-bold">Lesson Content</h2>
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
                                                onClick={() => handleContentDelete(content._id)}
                                            >
                                                Delete
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>

                        {isGenerating && (
                            <Dialog open={isGenerating} onOpenChange={setIsGenerating}>
                                <DialogContent className="max-w-3xl">
                                    <ContentGenerationForm
                                        lessonId={params.lessonId as string}
                                        lessonTitle={lesson.title}
                                        subject={lesson.subject}
                                        gradeLevel={lesson.gradeLevel}
                                        onContentGenerated={(content) => {
                                            setIsGenerating(false);
                                            fetchContents();
                                        }}
                                    />
                                </DialogContent>
                            </Dialog>
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
                                                onClick={() => handleResourceDelete(resource._id)}
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
        </DashboardLayout>
    );
} 