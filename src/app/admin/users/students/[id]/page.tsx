'use client';

import { useState, useEffect, useContext, use } from 'react';
import { useRouter } from 'next/navigation';
import { SupabaseSessionContext } from '@/components/providers/SupabaseAuthProvider';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft, Loader2, Save, GraduationCap, BookOpen, Brain, User, Phone } from 'lucide-react';
import { GRADE_LEVELS } from '@/lib/constants';
import { EducationLevelBadge } from '@/components/ui/education-level-badge';
import { type GradeLevel } from '@/lib/constants';
import { Skeleton } from "@/components/ui/skeleton";

interface Student {
  id: string; // Changed from _id to id
  name: string;
  email: string;
  isActive: boolean;
  grade: GradeLevel;
  createdAt: string;
  lastLogin?: string;
  lastActivity?: string;
  guardianName?: string;
  guardianContact?: string;
}

interface StudentStats {
  totalExercisesCompleted: number;
  totalPointsEarned: number;
  averageScore: number;
  recentScores: number[];
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function StudentDetailsPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const session = useContext(SupabaseSessionContext);
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [student, setStudent] = useState<Student | null>(null);
  const [stats, setStats] = useState<StudentStats | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    grade: '',
    isActive: false,
    guardianName: '',
    guardianContact: '',
  });

  useEffect(() => {
    const fetchStudentData = async () => {
      try {
        setIsLoading(true);
        // Fetch student details
        const studentResponse = await fetch(`/api/admin/users/students/${resolvedParams.id}`);
        if (!studentResponse.ok) throw new Error('Failed to fetch student details');
        const studentRaw = await studentResponse.json();

        // Map snake_case to CamelCase if necessary/ensure types
        const studentData: Student = {
          id: studentRaw.id,
          name: studentRaw.name,
          email: studentRaw.email,
          isActive: studentRaw.isactive ?? studentRaw.isActive,
          grade: studentRaw.grade,
          createdAt: studentRaw.created_at ?? studentRaw.createdAt,
          lastLogin: studentRaw.last_login ?? studentRaw.lastLogin,
          lastActivity: studentRaw.last_activity ?? studentRaw.lastActivity,
          guardianName: studentRaw.guardian_name ?? studentRaw.guardianName,
          guardianContact: studentRaw.guardian_contact ?? studentRaw.guardianContact,
        };

        setStudent(studentData);
        setFormData({
          name: studentData.name || '',
          email: studentData.email || '',
          grade: studentData.grade || '',
          isActive: studentData.isActive,
          guardianName: studentData.guardianName || '',
          guardianContact: studentData.guardianContact || '',
        });

        // Fetch student stats
        const statsResponse = await fetch(`/api/admin/users/students/${resolvedParams.id}/stats`);
        if (statsResponse.ok) {
          const statsData = await statsResponse.json();
          setStats(statsData);
        }
      } catch (error) {
        console.error('Error fetching student data:', error);
        toast({
          title: 'Error',
          description: 'Failed to load student details',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchStudentData();
  }, [resolvedParams.id, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const response = await fetch(`/api/admin/users/students/${resolvedParams.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }

      toast({
        title: 'Success',
        description: 'Student details updated successfully',
      });

      // Refresh student data locally with strict mapping
      // Although response returns the updated object, let's just update local state for simplicity
      setStudent(prev => prev ? ({ ...prev, ...formData } as Student) : null);

    } catch (error) {
      console.error('Error updating student:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update student details',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleLevelChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      grade: value,
    }));
  };

  const handleStatusChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      isActive: value === 'active',
    }));
  };

  if (!isLoading && !student) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="flex items-center gap-4 mb-6">
            <Button
              variant="outline"
              onClick={() => router.back()}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Student Not Found</h1>
              <p className="text-muted-foreground">
                The requested student could not be found
              </p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="outline"
            onClick={() => router.back()}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Student Details</h1>
            <p className="text-muted-foreground">
              View and manage student information
            </p>
          </div>
        </div>

        <div className="grid gap-6 mb-6 md:grid-cols-2">
          {/* Account Information Card */}
          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
              <CardDescription>
                Basic account details and status
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="space-y-4">
                  <div className="flex justify-between"><Skeleton className="h-4 w-24" /><Skeleton className="h-6 w-16 rounded-full" /></div>
                  <div className="flex justify-between"><Skeleton className="h-4 w-32" /><Skeleton className="h-6 w-24" /></div>
                  <div className="flex justify-between"><Skeleton className="h-4 w-20" /><Skeleton className="h-4 w-32" /></div>
                  <div className="space-y-2 pt-4 border-t">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-48" />
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Account Status</span>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${student?.isActive
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                      }`}>
                      {student?.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Education Level</span>
                    <EducationLevelBadge level={student?.grade || 'primary 1'} />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Joined</span>
                    <span className="text-sm text-muted-foreground">
                      {student?.createdAt ? new Date(student.createdAt).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>

                  {(student?.guardianName || student?.guardianContact) && (
                    <div className="pt-4 border-t space-y-2">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <User className="h-3 w-3" /> Guardian Info
                      </h4>
                      {student.guardianName && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Name:</span>
                          <span>{student.guardianName}</span>
                        </div>
                      )}
                      {student.guardianContact && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Contact:</span>
                          <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {student.guardianContact}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {student?.lastLogin && (
                    <div className="flex justify-between items-center pt-2">
                      <span className="text-sm font-medium">Last Login</span>
                      <span className="text-sm text-muted-foreground">
                        {new Date(student.lastLogin).toLocaleString()}
                      </span>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Learning Progress Card */}
          <Card>
            <CardHeader>
              <CardTitle>Learning Progress</CardTitle>
              <CardDescription>
                Student&apos;s learning statistics and achievements
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-2 w-full" />
                  <div className="flex gap-1 pt-2">
                    <Skeleton className="flex-1 h-16" />
                    <Skeleton className="flex-1 h-16" />
                    <Skeleton className="flex-1 h-16" />
                    <Skeleton className="flex-1 h-16" />
                    <Skeleton className="flex-1 h-16" />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center text-sm font-medium text-muted-foreground">
                        <Brain className="h-4 w-4 mr-2" />
                        Exercises Completed
                      </div>
                      <p className="text-2xl font-bold">
                        {stats?.totalExercisesCompleted || 0}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center text-sm font-medium text-muted-foreground">
                        <GraduationCap className="h-4 w-4 mr-2" />
                        Total Points
                      </div>
                      <p className="text-2xl font-bold">
                        {stats?.totalPointsEarned || 0}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center text-sm font-medium text-muted-foreground">
                      <BookOpen className="h-4 w-4 mr-2" />
                      Average Score
                    </div>
                    <div className="flex items-center">
                      <div className="flex-1 bg-muted rounded-full h-2">
                        <div
                          className="bg-primary rounded-full h-2"
                          style={{ width: `${stats?.averageScore || 0}%` }}
                        />
                      </div>
                      <span className="ml-2 text-sm font-medium">
                        {stats?.averageScore || 0}%
                      </span>
                    </div>
                  </div>

                  {stats?.recentScores && stats.recentScores.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">
                        Recent Scores
                      </p>
                      <div className="flex gap-1">
                        {stats.recentScores.map((score, index) => (
                          <div
                            key={index}
                            className="flex-1 h-16 bg-muted rounded-sm relative"
                          >
                            <div
                              className="absolute bottom-0 w-full bg-primary rounded-sm"
                              style={{ height: `${score}%` }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Edit Student Form */}
        <Card>
          <CardHeader>
            <CardTitle>Edit Student Information</CardTitle>
            <CardDescription>
              Update the student&apos;s profile information
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="guardianName">Guardian Name</Label>
                    <Input
                      id="guardianName"
                      name="guardianName"
                      value={formData.guardianName}
                      onChange={handleChange}
                      placeholder="Parent/Guardian Name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="guardianContact">Guardian Contact</Label>
                    <Input
                      id="guardianContact"
                      name="guardianContact"
                      value={formData.guardianContact}
                      onChange={handleChange}
                      placeholder="Phone or Email"
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="level">Education Level</Label>
                    <Select
                      value={formData.grade}
                      onValueChange={handleLevelChange}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select education level" />
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

                  <div className="space-y-2">
                    <Label htmlFor="status">Account Status</Label>
                    <Select
                      value={formData.isActive ? 'active' : 'inactive'}
                      onValueChange={handleStatusChange}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select account status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button type="submit" className="w-full md:w-auto" disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving Changes
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}