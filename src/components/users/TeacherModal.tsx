'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { MultiSelect } from '@/components/ui/multi-select';
import { GRADE_LEVELS } from '@/lib/constants';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

interface TeacherModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    teacher?: any; // Using any for now to match existing type usage, should be typed properly
    onSuccess?: () => void;
}

export function TeacherModal({ open, onOpenChange, teacher, onSuccess }: TeacherModalProps) {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);

    const [formData, setFormData] = useState({
        name: "",
        email: "",
        password: "",
        subjects: [] as string[],
        grades: [] as string[],
        qualifications: [] as string[],
        specializations: [] as string[]
    });

    useEffect(() => {
        if (teacher) {
            setFormData({
                name: teacher.name || "",
                email: teacher.email || "",
                password: "", // Don't populate password on edit
                subjects: Array.isArray(teacher.subjects) ? teacher.subjects :
                    teacher.subject ? teacher.subject.split(',').map((s: string) => s.trim()) : [],
                grades: Array.isArray(teacher.grades) ? teacher.grades :
                    teacher.gradesList ? teacher.gradesList.split(',').map((g: string) => g.trim()) : [],
                qualifications: teacher.qualifications || [],
                specializations: teacher.specializations || []
            });
        } else {
            setFormData({
                name: "",
                email: "",
                password: "",
                subjects: [],
                grades: [],
                qualifications: [],
                specializations: []
            });
        }
    }, [teacher, open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const url = teacher
                ? `/api/admin/users/teachers?id=${teacher.id}`
                : "/api/admin/users/teachers";

            const method = teacher ? "PUT" : "POST";

            // If editing and password is empty, don't send it (assuming backend handles this)
            // Or if backend requires it, validation will fail. Usually updates don't require password unless changing.
            const bodyData = { ...formData };
            if (teacher && !bodyData.password) {
                delete (bodyData as any).password;
            }

            const response = await fetch(url, {
                method,
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(bodyData),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || `Failed to ${teacher ? 'update' : 'create'} teacher`);
            }

            toast({
                title: "Success",
                description: `Teacher ${teacher ? 'updated' : 'created'} successfully`,
            });

            onSuccess?.();
            onOpenChange(false);
        } catch (error: any) {
            toast({
                title: "Error",
                description: error.message,
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleInputChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleMultiSelectChange = (name: string) => (value: string[]) => {
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const subjectOptions = [
        "Mathematics",
        "Science",
        "English",
        "History",
        "Geography",
        "Physics",
        "Chemistry",
        "Biology",
        "Computer Science",
        "Art",
        "Music",
        "Physical Education"
    ];

    const qualificationOptions = [
        "Bachelor's Degree",
        "Master's Degree",
        "Ph.D.",
        "Teaching Certificate",
        "Professional Certification"
    ];

    const specializationOptions = [
        "Special Education",
        "Early Childhood Education",
        "STEM Education",
        "Language Arts",
        "Educational Technology",
        "Curriculum Development"
    ];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{teacher ? 'Edit Teacher' : 'Create Teacher'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label htmlFor="name">Name</Label>
                            <Input
                                id="name"
                                name="name"
                                value={formData.name}
                                onChange={handleInputChange}
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                name="email"
                                type="email"
                                value={formData.email}
                                onChange={handleInputChange}
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password">Password {teacher && '(Leave blank to keep current)'}</Label>
                            <Input
                                id="password"
                                name="password"
                                type="password"
                                value={formData.password}
                                onChange={handleInputChange}
                                required={!teacher}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Grades</Label>
                            <MultiSelect
                                options={GRADE_LEVELS.map(level => ({
                                    label: level,
                                    value: level
                                }))}
                                selected={formData.grades}
                                onChange={handleMultiSelectChange("grades")}
                                placeholder="Select grades..."
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Subjects</Label>
                            <MultiSelect
                                options={subjectOptions.map(subject => ({
                                    label: subject,
                                    value: subject
                                }))}
                                selected={formData.subjects}
                                onChange={handleMultiSelectChange("subjects")}
                                placeholder="Select subjects..."
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Qualifications</Label>
                            <MultiSelect
                                options={qualificationOptions.map(qual => ({
                                    label: qual,
                                    value: qual
                                }))}
                                selected={formData.qualifications}
                                onChange={handleMultiSelectChange("qualifications")}
                                placeholder="Select qualifications..."
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Specializations</Label>
                            <MultiSelect
                                options={specializationOptions.map(spec => ({
                                    label: spec,
                                    value: spec
                                }))}
                                selected={formData.specializations}
                                onChange={handleMultiSelectChange("specializations")}
                                placeholder="Select specializations..."
                            />
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <Button type="submit" disabled={isLoading}>
                            {isLoading ? "Saving..." : (teacher ? "Update Teacher" : "Create Teacher")}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
