'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Wand2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { GRADE_LEVELS, SUBJECTS } from '@/lib/constants';

interface Teacher {
    id: string;
    name: string;
    email: string;
    subjects?: string[];
    grades?: string[];
}

interface Lesson {
    id?: string;
    title: string;
    subject: string;
    gradelevel: string;
    objectives?: string[];
    content?: string;
    teacher_id?: string;
}

interface AdminLessonModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    lesson?: Lesson | null;
    onSuccess?: () => void;
}

export function AdminLessonModal({ open, onOpenChange, lesson, onSuccess }: AdminLessonModalProps) {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const [loadingTeachers, setLoadingTeachers] = useState(false);

    const [formData, setFormData] = useState({
        title: '',
        subject: '',
        gradelevel: '',
        objectives: '',
        content: '',
        teacher_id: '',
    });

    const isEditing = !!lesson?.id;

    // Get selected teacher's subjects and grades
    const selectedTeacher = useMemo(() => {
        return teachers.find(t => t.id === formData.teacher_id);
    }, [teachers, formData.teacher_id]);

    const availableSubjects = useMemo(() => {
        if (selectedTeacher?.subjects?.length) {
            return selectedTeacher.subjects;
        }
        return SUBJECTS;
    }, [selectedTeacher]);

    const availableGrades = useMemo(() => {
        if (selectedTeacher?.grades?.length) {
            return selectedTeacher.grades;
        }
        return GRADE_LEVELS;
    }, [selectedTeacher]);

    useEffect(() => {
        if (open) {
            fetchTeachers();
            if (lesson) {
                setFormData({
                    title: lesson.title || '',
                    subject: lesson.subject || '',
                    gradelevel: lesson.gradelevel || '',
                    objectives: Array.isArray(lesson.objectives) ? lesson.objectives.join('\n') : (lesson.objectives || ''),
                    content: lesson.content || '',
                    teacher_id: lesson.teacher_id || '',
                });
            } else {
                setFormData({
                    title: '',
                    subject: '',
                    gradelevel: '',
                    objectives: '',
                    content: '',
                    teacher_id: '',
                });
            }
        }
    }, [open, lesson]);

    // Reset subject and grade when teacher changes
    useEffect(() => {
        if (formData.teacher_id && selectedTeacher) {
            // Only reset if current values are not in the teacher's list
            const newFormData = { ...formData };

            if (selectedTeacher.subjects?.length && !selectedTeacher.subjects.includes(formData.subject)) {
                newFormData.subject = '';
            }
            if (selectedTeacher.grades?.length && !selectedTeacher.grades.includes(formData.gradelevel)) {
                newFormData.gradelevel = '';
            }

            if (newFormData.subject !== formData.subject || newFormData.gradelevel !== formData.gradelevel) {
                setFormData(newFormData);
            }
        }
    }, [formData.teacher_id, selectedTeacher]);

    const fetchTeachers = async () => {
        setLoadingTeachers(true);
        try {
            const response = await fetch('/api/admin/users/teachers');
            if (!response.ok) throw new Error('Failed to fetch teachers');
            const data = await response.json();
            setTeachers(data.map((t: any) => ({
                id: t.teacher_id || t._id || t.id, // Use teacher_id for FK reference
                name: t.name,
                email: t.email,
                subjects: t.subjects || [],
                grades: t.grades || [],
            })));
        } catch (error) {
            console.error('Error fetching teachers:', error);
        } finally {
            setLoadingTeachers(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const url = isEditing ? `/api/admin/lessons/${lesson?.id}` : '/api/admin/lessons';
            const method = isEditing ? 'PUT' : 'POST';

            const payload = {
                title: formData.title,
                subject: formData.subject,
                gradeLevel: formData.gradelevel,
                objectives: formData.objectives.split('\n').filter(o => o.trim()),
                content: formData.content,
                teacherId: formData.teacher_id || null,
            };

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error(isEditing ? 'Failed to update lesson' : 'Failed to create lesson');
            }

            toast({
                title: 'Success',
                description: isEditing ? 'Lesson updated successfully' : 'Lesson created successfully',
            });

            onOpenChange(false);
            onSuccess?.();
        } catch (error) {
            console.error(error);
            toast({
                title: 'Error',
                description: isEditing ? 'Failed to update lesson' : 'Failed to create lesson',
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    };

    const generateLessonContent = async () => {
        if (!formData.title || !formData.subject || !formData.gradelevel || !formData.objectives) {
            toast({
                title: 'Missing Information',
                description: 'Please fill in title, subject, grade level, and objectives before generating content',
                variant: 'destructive',
            });
            return;
        }

        setGenerating(true);
        try {
            const response = await fetch('/api/lessons/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: formData.title,
                    subject: formData.subject,
                    gradeLevel: formData.gradelevel,
                    objectives: formData.objectives,
                }),
            });

            if (!response.ok) throw new Error('Failed to generate lesson content');

            const data = await response.json();
            setFormData(prev => ({ ...prev, content: data.content }));

            toast({
                title: 'Content Generated',
                description: 'AI has generated the lesson content',
            });
        } catch (error) {
            console.error('Error generating lesson content:', error);
            toast({
                title: 'Error',
                description: 'Failed to generate lesson content',
                variant: 'destructive',
            });
        } finally {
            setGenerating(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{isEditing ? 'Edit Lesson' : 'Create New Lesson'}</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="teacher">Assign Teacher</Label>
                        <Select
                            value={formData.teacher_id || 'none'}
                            onValueChange={(value) => setFormData(prev => ({ ...prev, teacher_id: value === 'none' ? '' : value }))}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder={loadingTeachers ? "Loading teachers..." : "Select a teacher (optional)"} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">No teacher assigned</SelectItem>
                                {teachers.map((teacher) => (
                                    <SelectItem key={teacher.id} value={teacher.id}>
                                        {teacher.name} ({teacher.email})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {selectedTeacher && (
                            <p className="text-xs text-muted-foreground">
                                Subject and grade options are limited to this teacher's assignments
                            </p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="title">Lesson Title</Label>
                        <Input
                            id="title"
                            placeholder="Enter lesson title"
                            value={formData.title}
                            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="subject">Subject</Label>
                            <Select
                                value={formData.subject}
                                onValueChange={(value) => setFormData(prev => ({ ...prev, subject: value }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select subject" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableSubjects.map((subject) => (
                                        <SelectItem key={subject} value={subject}>
                                            {subject}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="gradelevel">Grade Level</Label>
                            <Select
                                value={formData.gradelevel}
                                onValueChange={(value) => setFormData(prev => ({ ...prev, gradelevel: value }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select grade level" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableGrades.map((grade) => (
                                        <SelectItem key={grade} value={grade}>
                                            {grade.toUpperCase()}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="objectives">Learning Objectives (one per line)</Label>
                        <Textarea
                            id="objectives"
                            placeholder="Enter the learning objectives for this lesson"
                            value={formData.objectives}
                            onChange={(e) => setFormData(prev => ({ ...prev, objectives: e.target.value }))}
                            className="min-h-[100px]"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="content">Lesson Content</Label>
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={generateLessonContent}
                                disabled={generating || !formData.title || !formData.subject || !formData.gradelevel || !formData.objectives}
                            >
                                {generating ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Wand2 className="mr-2 h-4 w-4" />
                                )}
                                {generating ? 'Generating...' : 'Generate with AI'}
                            </Button>
                        </div>
                        <Textarea
                            id="content"
                            placeholder="Lesson content will appear here after generation, or you can enter manually"
                            value={formData.content}
                            onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                            className="min-h-[150px]"
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading || !formData.title || !formData.subject || !formData.gradelevel}>
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    {isEditing ? 'Updating...' : 'Creating...'}
                                </>
                            ) : (
                                isEditing ? 'Update Lesson' : 'Create Lesson'
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
