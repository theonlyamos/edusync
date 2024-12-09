'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Link as LinkIcon, ExternalLink, BookOpen } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Lesson {
    _id: string;
    title: string;
}

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
    createdBy: string;
}

interface ResourceData {
    title: string;
    description: string;
    type: 'file' | 'url';
    url?: string;
    fileUrl?: string;
    filename?: string;
    lessonId: string;
}

export default function ResourcesPage() {
    const [resources, setResources] = useState<Resource[]>([]);
    const [lessons, setLessons] = useState<Lesson[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        url: '',
        lessonId: '',
    });
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [resourceType, setResourceType] = useState<'file' | 'url'>('file');
    const { toast } = useToast();

    useEffect(() => {
        fetchResources();
        fetchLessons();
    }, []);

    const fetchLessons = async () => {
        try {
            const response = await fetch('/api/lessons');
            if (!response.ok) throw new Error('Failed to fetch lessons');
            const data = await response.json();
            setLessons(data);
        } catch (error) {
            console.error('Error:', error);
            toast({
                title: 'Error',
                description: 'Failed to fetch lessons',
                variant: 'destructive',
            });
        }
    };

    const fetchResources = async () => {
        try {
            const response = await fetch('/api/resources');
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

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0]);
        }
    };

    const resetForm = () => {
        setFormData({ title: '', description: '', url: '', lessonId: '' });
        setSelectedFile(null);
        setResourceType('file');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!formData.lessonId) {
            toast({
                title: 'Error',
                description: 'Please select a lesson',
                variant: 'destructive',
            });
            return;
        }

        setIsLoading(true);

        try {
            let resourceData: ResourceData = {
                ...formData,
                type: resourceType,
            };

            if (resourceType === 'file' && selectedFile) {
                const uploadFormData = new FormData();
                uploadFormData.append('file', selectedFile);
                
                const uploadResponse = await fetch('/api/upload', {
                    method: 'POST',
                    body: uploadFormData,
                });

                if (!uploadResponse.ok) throw new Error('Failed to upload file');
                const uploadResult = await uploadResponse.json();
                
                resourceData = {
                    ...resourceData,
                    fileUrl: uploadResult.url,
                    filename: uploadResult.filename,
                };
            }

            const response = await fetch('/api/resources', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(resourceData),
            });

            if (!response.ok) throw new Error('Failed to create resource');

            setIsOpen(false);
            resetForm();
            fetchResources();
            
            toast({
                title: 'Success',
                description: 'Resource created successfully',
            });
        } catch (error) {
            console.error('Error:', error);
            toast({
                title: 'Error',
                description: 'Failed to create resource',
                variant: 'destructive',
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            const response = await fetch(`/api/resources/${id}`, {
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

    return (
        <DashboardLayout>
            <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-bold">Resources</h1>
                        <p className="text-muted-foreground">Manage your educational resources</p>
                    </div>
                    <Dialog open={isOpen} onOpenChange={(open) => {
                        setIsOpen(open);
                        if (!open) resetForm();
                    }}>
                        <DialogTrigger asChild>
                            <Button>Add Resource</Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Create New Resource</DialogTitle>
                            </DialogHeader>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <Label htmlFor="lesson">Lesson</Label>
                                    <Select
                                        value={formData.lessonId}
                                        onValueChange={(value) => setFormData({ ...formData, lessonId: value })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select a lesson" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {lessons.map((lesson) => (
                                                <SelectItem key={lesson._id} value={lesson._id}>
                                                    {lesson.title}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label htmlFor="title">Title</Label>
                                    <Input
                                        id="title"
                                        value={formData.title}
                                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                        required
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="description">Description</Label>
                                    <Textarea
                                        id="description"
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        required
                                    />
                                </div>
                                <Tabs value={resourceType} onValueChange={(value) => setResourceType(value as 'file' | 'url')}>
                                    <TabsList className="grid w-full grid-cols-2">
                                        <TabsTrigger value="file" className="flex items-center gap-2">
                                            <FileText className="h-4 w-4" />
                                            Upload File
                                        </TabsTrigger>
                                        <TabsTrigger value="url" className="flex items-center gap-2">
                                            <LinkIcon className="h-4 w-4" />
                                            Add URL
                                        </TabsTrigger>
                                    </TabsList>
                                    <TabsContent value="file">
                                        <div>
                                            <Label htmlFor="file">Upload File</Label>
                                            <Input
                                                id="file"
                                                type="file"
                                                onChange={handleFileChange}
                                                className="mt-1"
                                                required={resourceType === 'file'}
                                            />
                                        </div>
                                    </TabsContent>
                                    <TabsContent value="url">
                                        <div>
                                            <Label htmlFor="url">Resource URL</Label>
                                            <Input
                                                id="url"
                                                type="url"
                                                placeholder="https://"
                                                value={formData.url}
                                                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                                                required={resourceType === 'url'}
                                            />
                                        </div>
                                    </TabsContent>
                                </Tabs>
                                <Button type="submit" disabled={isLoading} className="w-full">
                                    {isLoading ? 'Creating...' : 'Create Resource'}
                                </Button>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {resources.map((resource) => (
                        <Card key={resource._id}>
                            <CardContent className="p-6">
                                <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                        <h2 className="text-xl font-semibold mb-2">{resource.title}</h2>
                                        {resource.lessonTitle && (
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                                                <BookOpen className="h-4 w-4" />
                                                {resource.lessonTitle}
                                            </div>
                                        )}
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
                                        onClick={() => handleDelete(resource._id)}
                                    >
                                        Delete
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </DashboardLayout>
    );
} 