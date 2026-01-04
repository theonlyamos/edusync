'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { FileText, Link as LinkIcon } from 'lucide-react';

interface ResourceModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    lessonId: string;
    onSuccess?: () => void;
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

export function ResourceModal({ open, onOpenChange, lessonId, onSuccess }: ResourceModalProps) {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        url: '',
    });
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [resourceType, setResourceType] = useState<'file' | 'url'>('file');

    const resetForm = () => {
        setFormData({ title: '', description: '', url: '' });
        setSelectedFile(null);
        setResourceType('file');
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0]);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            let resourceData: ResourceData = {
                ...formData,
                type: resourceType,
                lessonId,
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

            toast({
                title: 'Success',
                description: 'Resource created successfully',
            });

            resetForm();
            onOpenChange(false);
            onSuccess?.();
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

    return (
        <Dialog open={open} onOpenChange={(isOpen) => {
            onOpenChange(isOpen);
            if (!isOpen) resetForm();
        }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add Resource</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <Label htmlFor="title">Title</Label>
                        <Input
                            id="title"
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            placeholder="Resource title"
                            required
                        />
                    </div>
                    <div>
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                            id="description"
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            placeholder="Brief description of the resource"
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
                        <TabsContent value="file" className="mt-4">
                            <div>
                                <Label htmlFor="file">Upload File</Label>
                                <Input
                                    id="file"
                                    type="file"
                                    onChange={handleFileChange}
                                    className="mt-1"
                                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.jpeg,.png,.gif,.mp4,.mp3"
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    Supported: PDF, Word, Excel, PowerPoint, Images, Audio, Video
                                </p>
                            </div>
                        </TabsContent>
                        <TabsContent value="url" className="mt-4">
                            <div>
                                <Label htmlFor="url">Resource URL</Label>
                                <Input
                                    id="url"
                                    type="url"
                                    placeholder="https://example.com/resource"
                                    value={formData.url}
                                    onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                                />
                            </div>
                        </TabsContent>
                    </Tabs>
                    <Button type="submit" disabled={isLoading} className="w-full">
                        {isLoading ? 'Creating...' : 'Add Resource'}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}
