'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Users, GraduationCap, BookOpen, Calendar, Book, BookA, Plus, X, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { EducationLevelBadge } from '@/components/ui/education-level-badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { GradeLevel } from '@/lib/constants';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { v4 as uuidv4 } from 'uuid';
import { TimeTableView } from '@/components/timetable/TimeTableView';

interface User {
  _id: string;
  name: string;
  email: string;
  status: string;
  createdAt: string;
}

interface Lesson {
  _id: string;
  title: string;
  subject: string;
  teacherName: string;
  createdAt: string;
}

interface TimeTableCell {
  subject: string;
  teacherId: string;
  lessonId?: string;
}

interface TimeTable {
  [key: string]: {
    [key: string]: TimeTableCell;
  };
}

interface Period {
  id: string;
  startTime: string;
  endTime: string;
}

interface GradeDetails {
  students: User[];
  teachers: User[];
  lessons: Lesson[];
  timeTable?: TimeTable;
  periods?: Period[];
}

interface GradeDetailsContentProps {
  level: string;
}

const SUBJECTS = [
  'Mathematics',
  'English Language',
  'Science',
  'Social Studies',
  'Religious and Moral Education',
  'Information Technology',
  'Creative Arts',
  'Physical Education',
  'Local Language',
  'French'
];

export function GradeDetailsContent({ level }: GradeDetailsContentProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [gradeDetails, setGradeDetails] = useState<GradeDetails>({
    students: [],
    teachers: [],
    lessons: [],
    periods: []
  });
  const [timeTable, setTimeTable] = useState<TimeTable>({});
  const [editMode, setEditMode] = useState(false);
  const [newPeriodId, setNewPeriodId] = useState<string | null>(null);
  const [editingPeriod, setEditingPeriod] = useState<string | null>(null);
  const [availableTeachers, setAvailableTeachers] = useState<User[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [editingCell, setEditingCell] = useState<{ day: string; periodId: string } | null>(null);

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated' && session?.user?.role !== 'admin') {
      router.push('/');
    }
  }, [status, session, router]);

  useEffect(() => {
    fetchGradeDetails();
  }, [level]);

  useEffect(() => {
    if (gradeDetails.timeTable) {
      setTimeTable(gradeDetails.timeTable);
    }
  }, [gradeDetails.timeTable]);

  useEffect(() => {
    if (gradeDetails.teachers) {
      setAvailableTeachers(gradeDetails.teachers);
    }
  }, [gradeDetails.teachers]);

  useEffect(() => {
    if (gradeDetails.periods) {
      setPeriods(gradeDetails.periods);
    }
  }, [gradeDetails.periods]);

  const fetchGradeDetails = async () => {
    try {
      const response = await fetch(`/api/admin/grades/${level}`);
      if (!response.ok) throw new Error('Failed to fetch grade details');
      const data = await response.json();
      setGradeDetails(data);
      setTimeTable(data.timeTable || {});
      setPeriods(data.periods || []);
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch grade details',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const updateTimeTableCell = async (day: string, periodId: string, subject: string, teacherId: string) => {
    try {
      const response = await fetch(`/api/admin/grades/${level}/timetable`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          day,
          periodId,
          subject,
          teacherId
        }),
      });

      if (!response.ok) throw new Error('Failed to update timetable');

      const updatedSchedule = await response.json();
      setTimeTable(updatedSchedule);
      toast({
        title: 'Success',
        description: 'Timetable updated successfully',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update timetable',
        variant: 'destructive',
      });
    }
  };

  const addPeriod = async () => {
    try {
      const response = await fetch(`/api/admin/grades/${level}/periods`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startTime: '08:00',
          endTime: '09:00'
        }),
      });

      if (!response.ok) throw new Error('Failed to add period');
      
      const newPeriod = await response.json();
      setPeriods([...periods, newPeriod]);
      toast({
        title: 'Success',
        description: 'Period added successfully',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to add period',
        variant: 'destructive',
      });
    }
  };

  const updatePeriod = async (periodId: string, startTime: string, endTime: string) => {
    try {
      const response = await fetch(`/api/admin/grades/${level}/periods/${periodId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ startTime, endTime }),
      });

      if (!response.ok) throw new Error('Failed to update period');

      setPeriods(periods.map(p => 
        p.id === periodId ? { ...p, startTime, endTime } : p
      ));
      setEditingPeriod(null);
      toast({
        title: 'Success',
        description: 'Period updated successfully',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update period',
        variant: 'destructive',
      });
    }
  };

  const deletePeriod = async (periodId: string) => {
    try {
      const response = await fetch(`/api/admin/grades/${level}/periods/${periodId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete period');

      setPeriods(periods.filter(p => p.id !== periodId));
      toast({
        title: 'Success',
        description: 'Period deleted successfully',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete period',
        variant: 'destructive',
      });
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-2">Loading...</h2>
          <p className="text-muted-foreground">Please wait while we load the grade details</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <Button
          variant="ghost"
          className="mb-4"
          onClick={() => router.push('/admin/grades')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Grades
        </Button>
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-bold">Grade Details</h1>
          <EducationLevelBadge level={level as GradeLevel} />
        </div>
        <p className="text-muted-foreground mt-2">Manage students, teachers, and lessons for this grade</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-500" />
              <span>Students</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{gradeDetails.students.length}</div>
            <p className="text-muted-foreground">Enrolled students</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-green-500" />
              <span>Teachers</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{gradeDetails.teachers.length}</div>
            <p className="text-muted-foreground">Assigned teachers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-purple-500" />
              <span>Lessons</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{gradeDetails.lessons.length}</div>
            <p className="text-muted-foreground">Created lessons</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="students" className="w-full">
        <TabsList>
          <TabsTrigger value="students">Students</TabsTrigger>
          <TabsTrigger value="teachers">Teachers</TabsTrigger>
          <TabsTrigger value="lessons">Lessons</TabsTrigger>
          <TabsTrigger value="timetable">Time Table</TabsTrigger>
        </TabsList>

        <TabsContent value="students">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gradeDetails.students.map((student) => (
                  <TableRow key={student._id}>
                    <TableCell className="font-medium">{student.name}</TableCell>
                    <TableCell>{student.email}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        student.status === 'active' 
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {student.status}
                      </span>
                    </TableCell>
                    <TableCell>{new Date(student.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/admin/users/students/${student._id}`)}
                      >
                        View Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="teachers">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gradeDetails.teachers.map((teacher) => (
                  <TableRow key={teacher._id}>
                    <TableCell className="font-medium">{teacher.name}</TableCell>
                    <TableCell>{teacher.email}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        teacher.status === 'active' 
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {teacher.status}
                      </span>
                    </TableCell>
                    <TableCell>{new Date(teacher.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/admin/users/teachers/${teacher._id}`)}
                      >
                        View Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="lessons">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Teacher</TableHead>
                  <TableHead>Created Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gradeDetails.lessons.map((lesson) => (
                  <TableRow key={lesson._id}>
                    <TableCell className="font-medium">{lesson.title}</TableCell>
                    <TableCell>{lesson.subject}</TableCell>
                    <TableCell>{lesson.teacherName}</TableCell>
                    <TableCell>{new Date(lesson.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/teachers/lessons/${lesson._id}`)}
                      >
                        View Lesson
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="timetable">
          <Card>
            <TimeTableView
              timeTable={timeTable}
              periods={periods}
              teachers={gradeDetails.teachers}
              lessons={gradeDetails.lessons}
              onAddPeriod={addPeriod}
              onUpdatePeriod={updatePeriod}
              onDeletePeriod={deletePeriod}
              onUpdateTimeTableCell={updateTimeTableCell}
              title="Class Time Table"
              subjects={SUBJECTS}
            />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
} 