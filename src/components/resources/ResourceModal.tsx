'use client';

import { useContext, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { FileText, Link as LinkIcon, Loader2 } from 'lucide-react';
import { SupabaseBrowserClientContext } from '@/components/providers/SupabaseAuthProvider';
import {
    LESSON_RESOURCE_BUCKET,
    MAX_RESOURCE_BYTES,
    RESOURCE_ACCEPT,
    formatBytes,
    normalizeResourceUrl,
    validateResourceFile,
    type LessonResource,
} from '@/lib/lesson-resources';

interface ResourceModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Fixed lesson. Leave out and pass `lessons` to let the teacher pick one. */
    lessonId?: string;
    lessons?: { id: string; title: string }[];
    onSuccess?: (resource: LessonResource) => void;
}

async function readError(response: Response, fallback: string) {
    const body = await response.json().catch(() => null);
    return typeof body?.error === 'string' ? body.error : fallback;
}

export function ResourceModal({ open, onOpenChange, lessonId, lessons, onSuccess }: ResourceModalProps) {
    const { toast } = useToast();
    const supabase = useContext(SupabaseBrowserClientContext);
    const [busy, setBusy] = useState<'' | 'uploading' | 'saving'>('');
    const [error, setError] = useState('');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [url, setUrl] = useState('');
    const [pickedLesson, setPickedLesson] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [type, setType] = useState<'file' | 'url'>('file');
    const targetLesson = lessonId ?? pickedLesson;

    const reset = () => {
        setTitle('');
        setDescription('');
        setUrl('');
        setFile(null);
        setType('file');
        setError('');
        setPickedLesson('');
    };

    const chooseFile = (next: File | null) => {
        setError('');
        setFile(next);
        if (!next) return;
        try {
            validateResourceFile(next.name, next.type, next.size);
        } catch (e) {
            setError((e as Error).message);
        }
        // Default the title to the file name so a quick upload needs one step.
        if (!title.trim()) setTitle(next.name.replace(/\.[^.]+$/, '').slice(0, 200));
    };

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError('');
        try {
            if (!targetLesson) throw new Error('Choose a lesson');
            if (!title.trim()) throw new Error('Add a title');
            let payload: Record<string, unknown>;
            if (type === 'url') {
                payload = { type, lessonId: targetLesson, title, description, url: normalizeResourceUrl(url) };
            } else {
                if (!file) throw new Error('Choose a file');
                validateResourceFile(file.name, file.type, file.size);
                setBusy('uploading');
                const ticketResponse = await fetch('/api/resources/upload-url', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lessonId: targetLesson, filename: file.name, mimeType: file.type, size: file.size }),
                });
                if (!ticketResponse.ok) throw new Error(await readError(ticketResponse, 'Could not start the upload'));
                const ticket = await ticketResponse.json() as { path: string; token: string };
                if (!supabase) throw new Error('Sign in again to upload files');
                const { error: uploadError } = await supabase.storage
                    .from(LESSON_RESOURCE_BUCKET)
                    .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type || undefined });
                if (uploadError) throw new Error(uploadError.message || 'Upload failed');
                payload = {
                    type,
                    lessonId: targetLesson,
                    title,
                    description,
                    path: ticket.path,
                    filename: file.name,
                    mimeType: file.type,
                    size: file.size,
                };
            }
            setBusy('saving');
            const response = await fetch('/api/resources', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!response.ok) throw new Error(await readError(response, 'Could not save the resource'));
            const created = await response.json() as LessonResource;
            toast({ title: 'Resource added', description: 'Students in this lesson can now open it.' });
            reset();
            onOpenChange(false);
            onSuccess?.(created);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy('');
        }
    };

    return (
        <Dialog open={open} onOpenChange={(isOpen) => {
            if (busy) return;
            onOpenChange(isOpen);
            if (!isOpen) reset();
        }}>
            <DialogContent className="max-h-[90dvh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Add resource</DialogTitle>
                    <DialogDescription>Students see resources on the lesson&apos;s Resources tab.</DialogDescription>
                </DialogHeader>
                <form onSubmit={submit} className="space-y-4">
                    {!lessonId && (
                        <div className="space-y-1">
                            <Label htmlFor="resource-lesson">Lesson</Label>
                            <Select value={pickedLesson} onValueChange={setPickedLesson}>
                                <SelectTrigger id="resource-lesson">
                                    <SelectValue placeholder={lessons?.length ? 'Choose a lesson' : 'Create a lesson first'} />
                                </SelectTrigger>
                                <SelectContent>
                                    {(lessons ?? []).map((lesson) => (
                                        <SelectItem key={lesson.id} value={lesson.id}>{lesson.title}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <Tabs value={type} onValueChange={(value) => { setType(value as 'file' | 'url'); setError(''); }}>
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="file" className="flex items-center gap-2">
                                <FileText className="h-4 w-4" />
                                Upload file
                            </TabsTrigger>
                            <TabsTrigger value="url" className="flex items-center gap-2">
                                <LinkIcon className="h-4 w-4" />
                                Add link
                            </TabsTrigger>
                        </TabsList>
                        <TabsContent value="file" className="mt-4 space-y-1">
                            <Label htmlFor="resource-file">File</Label>
                            <Input
                                id="resource-file"
                                type="file"
                                accept={RESOURCE_ACCEPT}
                                onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
                            />
                            <p className="text-xs text-muted-foreground">
                                {file
                                    ? `${file.name} · ${formatBytes(file.size)}`
                                    : `PDF, Word, Excel, PowerPoint, text, images, MP3 or MP4, up to ${formatBytes(MAX_RESOURCE_BYTES)}.`}
                            </p>
                        </TabsContent>
                        <TabsContent value="url" className="mt-4 space-y-1">
                            <Label htmlFor="resource-url">Link</Label>
                            <Input
                                id="resource-url"
                                type="url"
                                inputMode="url"
                                placeholder="https://example.com/video"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                            />
                        </TabsContent>
                    </Tabs>
                    <div className="space-y-1">
                        <Label htmlFor="resource-title">Title</Label>
                        <Input
                            id="resource-title"
                            value={title}
                            maxLength={200}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g. Photosynthesis diagram"
                        />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="resource-description">Description (optional)</Label>
                        <Textarea
                            id="resource-description"
                            value={description}
                            maxLength={2000}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="What should students do with it?"
                        />
                    </div>
                    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                    <Button type="submit" disabled={Boolean(busy)} className="w-full">
                        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {busy === 'uploading' ? 'Uploading…' : busy === 'saving' ? 'Saving…' : 'Add resource'}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}
