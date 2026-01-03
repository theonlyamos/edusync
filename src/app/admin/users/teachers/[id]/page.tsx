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
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft, Pencil } from 'lucide-react';
import { EducationLevelBadge } from '@/components/ui/education-level-badge';
import { type GradeLevel } from '@/lib/constants';
import { Skeleton } from '@/components/ui/skeleton';
import { TeacherModal } from '@/components/users/TeacherModal';

interface Teacher {
  _id: string;
  id?: string;
  name: string;
  email: string;
  status: 'active' | 'inactive';
  subjects?: string[];
  grades?: string[];
  qualifications?: string[];
  specializations?: string[];
  createdAt: string;
  lastLogin?: string;
  lastActivity?: string;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function TeacherDetailsPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const session = useContext(SupabaseSessionContext);
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchTeacher = async () => {
    try {
      const response = await fetch(`/api/admin/users/teachers/${resolvedParams.id}`);
      if (!response.ok) throw new Error('Failed to fetch teacher details');
      const data = await response.json();
      setTeacher(data);
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

  useEffect(() => {
    fetchTeacher();
  }, [resolvedParams.id]);

  const handleEditSuccess = () => {
    fetchTeacher();
    setIsModalOpen(false);
  };

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
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
          {teacher && (
            <Button onClick={() => setIsModalOpen(true)}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit Teacher
            </Button>
          )}
        </div>

        {!isLoading && !teacher ? (
          <Card>
            <CardContent className="py-8">
              <div className="text-center text-muted-foreground">
                The requested teacher could not be found
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-6 mb-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Account Information</CardTitle>
                  <CardDescription>
                    Basic account details and status
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {isLoading ? (
                    <>
                      <div className="flex justify-between">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-5 w-16 rounded-full" />
                      </div>
                      <div className="flex justify-between">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-32" />
                      </div>
                      <div className="flex justify-between">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                    </>
                  ) : teacher && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-sm font-medium">Account Status</span>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${teacher.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                          }`}>
                          {teacher.status}
                        </span>
                      </div>
                      {teacher.grades && teacher.grades.length > 0 && (
                        <div className="flex justify-between">
                          <span className="text-sm font-medium">Grade Levels</span>
                          <div className="flex flex-wrap gap-1 justify-end">
                            {teacher.grades.map((grade, index) => (
                              <EducationLevelBadge key={index} level={grade as GradeLevel} />
                            ))}
                          </div>
                        </div>
                      )}
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
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Teaching Information</CardTitle>
                  <CardDescription>
                    Subjects and qualifications
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-16" />
                        <div className="flex gap-2">
                          <Skeleton className="h-6 w-20 rounded-full" />
                          <Skeleton className="h-6 w-24 rounded-full" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <div className="flex gap-2">
                          <Skeleton className="h-6 w-28 rounded-full" />
                        </div>
                      </div>
                    </div>
                  ) : teacher && (
                    <>
                      {teacher.subjects && teacher.subjects.length > 0 && (
                        <div className="space-y-2 mb-4">
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
                      )}

                      {teacher.qualifications && teacher.qualifications.length > 0 && (
                        <div className="space-y-2 mb-4">
                          <Label>Qualifications</Label>
                          <div className="flex flex-wrap gap-2">
                            {teacher.qualifications.map((qual, index) => (
                              <span
                                key={index}
                                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                              >
                                {qual}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {teacher.specializations && teacher.specializations.length > 0 && (
                        <div className="space-y-2">
                          <Label>Specializations</Label>
                          <div className="flex flex-wrap gap-2">
                            {teacher.specializations.map((spec, index) => (
                              <span
                                key={index}
                                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800"
                              >
                                {spec}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}

        <TeacherModal
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
          teacher={teacher ? { ...teacher, id: teacher._id || teacher.id } : undefined}
          onSuccess={handleEditSuccess}
        />
      </div>
    </DashboardLayout>
  );
} 