'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft } from 'lucide-react';
import { MultiSelect } from '@/components/ui/multi-select';
import { GRADE_LEVELS } from '@/lib/constants';

export default function CreateTeacherPage() {
    const router = useRouter();
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const response = await fetch("/api/admin/users/teachers", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(formData),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || "Failed to create teacher");
            }

            toast({
                title: "Success",
                description: "Teacher created successfully",
            });

            router.push("/admin/users/teachers");
            router.refresh();
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
        <DashboardLayout>
            <div className="container mx-auto py-10">
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="outline"
                            onClick={() => router.back()}
                        >
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back
                        </Button>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">Create Teacher</h1>
                            <p className="text-muted-foreground">
                                Add a new teacher to the system
                            </p>
                        </div>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Teacher Information</CardTitle>
                    </CardHeader>
                    <CardContent>
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
                                    <Label htmlFor="password">Password</Label>
                                    <Input
                                        id="password"
                                        name="password"
                                        type="password"
                                        value={formData.password}
                                        onChange={handleInputChange}
                                        required
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
                                    {isLoading ? "Creating..." : "Create Teacher"}
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    );
} 