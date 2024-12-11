'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
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
import { ArrowLeft, Loader2, Save, GraduationCap, BookOpen, Brain } from 'lucide-react';
import { EDUCATION_LEVELS } from '@/lib/constants';
import { EducationLevelBadge } from '@/components/ui/education-level-badge';
import { type EducationLevel } from '@/lib/constants';
import { use } from 'react';

interface Student {
  _id: string;
  name: string;
  email: string;
  status: 'active' | 'inactive';
  level: EducationLevel;
  createdAt: string;
  lastLogin?: string;
  lastActivity?: string;
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
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [student, setStudent] = useState<Student | null>(null);
  const [stats, setStats] = useState<StudentStats | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    level: '',
    status: '',
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
      return;
    }
    
    if (status === 'authenticated') {
      if (session?.user?.role !== 'admin') {
        switch (session?.user?.role) {
          case 'teacher':
            router.replace('/teachers/dashboard');
            break;
          case 'student':
            router.replace('/students/dashboard');
            break;
          default:
            router.replace('/login');
        }
        return;
      }

      const fetchStudentData = async () => {
        try {
          // Fetch student details
          const studentResponse = await fetch(`/api/admin/users/students/${resolvedParams.id}`);
          if (!studentResponse.ok) throw new Error('Failed to fetch student details');
          const studentData = await studentResponse.json();
          setStudent(studentData);
          setFormData({
            name: studentData.name,
            email: studentData.email,
            level: studentData.level,
            status: studentData.status,
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
          router.push('/admin/users/students');
        } finally {
          setIsLoading(false);
        }
      };

      fetchStudentData();
    }
  }, [session, status, router, resolvedParams.id, toast]);

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

      // Refresh student data
      const updatedStudent = await response.json();
      setStudent(updatedStudent);
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
      level: value,
    }));
  };

  const handleStatusChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      status: value,
    }));
  };

  if (status === 'loading' || isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (status === 'unauthenticated' || session?.user?.role !== 'admin') {
    return null;
  }

  if (!student) {
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
          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
              <CardDescription>
                Basic account details and status
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm font-medium">Account Status</span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  student.status === 'active' 
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}>
                  {student.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium">Education Level</span>
                <EducationLevelBadge level={student.level} />
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium">Joined</span>
                <span className="text-sm text-muted-foreground">
                  {new Date(student.createdAt).toLocaleDateString()}
                </span>
              </div>
              {student.lastLogin && (
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Last Login</span>
                  <span className="text-sm text-muted-foreground">
                    {new Date(student.lastLogin).toLocaleString()}
                  </span>
                </div>
              )}
              {student.lastActivity && (
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Last Activity</span>
                  <span className="text-sm text-muted-foreground">
                    {new Date(student.lastActivity).toLocaleString()}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Learning Progress</CardTitle>
              <CardDescription>
                Student's learning statistics and achievements
              </CardDescription>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Edit Student Information</CardTitle>
            <CardDescription>
              Update the student's profile information
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
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

              <div className="space-y-2">
                <Label htmlFor="level">Education Level</Label>
                <Select
                  value={formData.level}
                  onValueChange={handleLevelChange}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select education level" />
                  </SelectTrigger>
                  <SelectContent>
                    {EDUCATION_LEVELS.map((level) => (
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
                  value={formData.status}
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

              <Button type="submit" className="w-full" disabled={isSaving}>
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
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
} 