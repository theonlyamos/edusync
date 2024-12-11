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
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { EDUCATION_LEVELS } from '@/lib/constants';
import { EducationLevelBadge } from '@/components/ui/education-level-badge';
import { type EducationLevel } from '@/lib/constants';
import { use } from 'react';

interface Teacher {
  _id: string;
  name: string;
  email: string;
  status: 'active' | 'inactive';
  level: EducationLevel;
  subjects: string[];
  createdAt: string;
  lastLogin?: string;
  lastActivity?: string;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function TeacherDetailsPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subjects: '',
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

      const fetchTeacher = async () => {
        try {
          const response = await fetch(`/api/admin/users/teachers/${resolvedParams.id}`);
          if (!response.ok) throw new Error('Failed to fetch teacher details');
          const data = await response.json();
          setTeacher(data);
          setFormData({
            name: data.name,
            email: data.email,
            subjects: data.subjects.join(', '),
            level: data.level,
            status: data.status,
          });
        } catch (error) {
          console.error('Error fetching teacher:', error);
          toast({
            title: 'Error',
            description: 'Failed to load teacher details',
            variant: 'destructive',
          });
          router.push('/admin/users/teachers');
        } finally {
          setIsLoading(false);
        }
      };

      fetchTeacher();
    }
  }, [session, status, router, resolvedParams.id, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const response = await fetch(`/api/admin/users/teachers/${resolvedParams.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          subjects: formData.subjects.split(',').map(s => s.trim()).filter(Boolean),
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }

      toast({
        title: 'Success',
        description: 'Teacher details updated successfully',
      });

      // Refresh teacher data
      const updatedTeacher = await response.json();
      setTeacher(updatedTeacher);
    } catch (error) {
      console.error('Error updating teacher:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update teacher details',
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

  if (!teacher) {
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
              <h1 className="text-3xl font-bold">Teacher Not Found</h1>
              <p className="text-muted-foreground">
                The requested teacher could not be found
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
            <h1 className="text-3xl font-bold">Teacher Details</h1>
            <p className="text-muted-foreground">
              View and manage teacher information
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
                  teacher.status === 'active' 
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}>
                  {teacher.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium">Education Level</span>
                <EducationLevelBadge level={teacher.level} />
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium">Joined</span>
                <span className="text-sm text-muted-foreground">
                  {new Date(teacher.createdAt).toLocaleDateString()}
                </span>
              </div>
              {teacher.lastLogin && (
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Last Login</span>
                  <span className="text-sm text-muted-foreground">
                    {new Date(teacher.lastLogin).toLocaleString()}
                  </span>
                </div>
              )}
              {teacher.lastActivity && (
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Last Activity</span>
                  <span className="text-sm text-muted-foreground">
                    {new Date(teacher.lastActivity).toLocaleString()}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Teaching Information</CardTitle>
              <CardDescription>
                Subjects and teaching details
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label>Subjects</Label>
                <div className="flex flex-wrap gap-2">
                  {teacher.subjects.map((subject, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary"
                    >
                      {subject}
                    </span>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Edit Teacher Information</CardTitle>
            <CardDescription>
              Update the teacher's profile information
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

              <div className="space-y-2">
                <Label htmlFor="subjects">Subjects</Label>
                <Input
                  id="subjects"
                  name="subjects"
                  value={formData.subjects}
                  onChange={handleChange}
                  required
                  placeholder="Enter subjects (comma-separated)"
                />
                <p className="text-sm text-muted-foreground">
                  Enter subjects separated by commas (e.g., Mathematics, Physics, Chemistry)
                </p>
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