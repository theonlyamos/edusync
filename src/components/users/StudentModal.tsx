'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { GRADE_LEVELS, type GradeLevel } from '@/lib/constants';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Loader2, User, Users } from 'lucide-react';

export interface StudentData {
    id?: string;
    name: string;
    email: string;
    grade: GradeLevel | string;
    status?: string;
    guardianName?: string;
    guardianContact?: string;
}

interface StudentModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    student?: StudentData | null;
    onSuccess?: () => void;
}

export function StudentModal({ open, onOpenChange, student, onSuccess }: StudentModalProps) {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);

    const [formData, setFormData] = useState({
        name: "",
        email: "",
        password: "",
        level: "" as GradeLevel | string,
        guardianName: "",
        guardianContact: "",
    });

    const isEditMode = !!student?.id;

    useEffect(() => {
        if (student) {
            setFormData({
                name: student.name || "",
                email: student.email || "",
                password: "", // Don't populate password on edit
                level: student.grade || "",
                guardianName: student.guardianName || "",
                guardianContact: student.guardianContact || "",
            });
        } else {
            setFormData({
                name: "",
                email: "",
                password: "",
                level: "",
                guardianName: "",
                guardianContact: "",
            });
        }
    }, [student, open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const url = isEditMode
                ? `/api/admin/users/students/${student.id}`
                : "/api/admin/users/students";

            const method = isEditMode ? "PATCH" : "POST";

            // Build payload
            const bodyData: Record<string, any> = {
                name: formData.name,
                email: formData.email,
                level: formData.level,
                guardianName: formData.guardianName || null,
                guardianContact: formData.guardianContact || null,
            };

            // Only include password for create or if provided during edit
            if (!isEditMode) {
                bodyData.password = formData.password;
            } else if (formData.password) {
                bodyData.password = formData.password;
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
                throw new Error(error.error || `Failed to ${isEditMode ? 'update' : 'create'} student`);
            }

            toast({
                title: "Success",
                description: `Student ${isEditMode ? 'updated' : 'created'} successfully`,
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
        e: React.ChangeEvent<HTMLInputElement>
    ) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleLevelChange = (value: string) => {
        setFormData((prev) => ({ ...prev, level: value }));
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{isEditMode ? 'Edit Student' : 'Add New Student'}</DialogTitle>
                    <DialogDescription>
                        {isEditMode
                            ? 'Update the student\'s information below.'
                            : 'Create a new student account. They will receive login credentials via email.'
                        }
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Student Information Section */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <User className="h-4 w-4" />
                            Student Information
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Full Name</Label>
                                <Input
                                    id="name"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleInputChange}
                                    placeholder="John Doe"
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
                                    placeholder="john@example.com"
                                    required
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="password">
                                    Password {isEditMode && <span className="text-muted-foreground text-xs">(Leave blank to keep current)</span>}
                                </Label>
                                <Input
                                    id="password"
                                    name="password"
                                    type="password"
                                    value={formData.password}
                                    onChange={handleInputChange}
                                    placeholder="••••••••"
                                    required={!isEditMode}
                                    minLength={6}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="level">Education Level</Label>
                                <Select
                                    value={formData.level}
                                    onValueChange={handleLevelChange}
                                    required
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select level" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {GRADE_LEVELS.map((level) => (
                                            <SelectItem key={level} value={level}>
                                                {level.toUpperCase()}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>

                    {/* Guardian Information Section */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <Users className="h-4 w-4" />
                            Guardian Information
                            <span className="text-xs font-normal">(Optional)</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="guardianName">Guardian Name</Label>
                                <Input
                                    id="guardianName"
                                    name="guardianName"
                                    value={formData.guardianName}
                                    onChange={handleInputChange}
                                    placeholder="Parent/Guardian name"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="guardianContact">Guardian Contact</Label>
                                <Input
                                    id="guardianContact"
                                    name="guardianContact"
                                    value={formData.guardianContact}
                                    onChange={handleInputChange}
                                    placeholder="Phone or email"
                                />
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={isLoading}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            {isEditMode ? 'Update Student' : 'Create Student'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
