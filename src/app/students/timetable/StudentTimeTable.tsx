'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar, BookOpen, BookA, User } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';
import { EducationLevelBadge } from '@/components/ui/education-level-badge';
import type { EducationLevel } from '@/lib/constants';
import Link from 'next/link';

interface TimeTableCell {
  subject: string;
  teacher: string;
  lessonId?: string;
}

interface Lesson {
  _id: string;
  title: string;
  subject: string;
}

export function StudentTimeTable() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [timeTable, setTimeTable] = useState<{ [key: string]: { [key: string]: TimeTableCell } }>({});
  const [lessons, setLessons] = useState<Lesson[]>([]);

  const periods = ['8:00-9:00', '9:00-10:00', '10:00-11:00', '11:30-12:30', '12:30-1:30', '2:00-3:00'];
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated' && session?.user?.role !== 'student') {
      router.push('/');
    } else if (status === 'authenticated') {
      fetchTimeTableAndLessons();
    }
  }, [status, session]);

  const fetchTimeTableAndLessons = async () => {
    try {
      setLoading(true);
      const timeTableRes = await fetch(`/api/students/timetable`);

      if (!timeTableRes.ok) {
        throw new Error('Failed to fetch data');
      }

      const { timeTable: fetchedTimeTable, lessons: fetchedLessons } = await timeTableRes.json();
      setTimeTable(fetchedTimeTable || {});
      setLessons(fetchedLessons || []);
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch timetable',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-2">Loading...</h2>
          <p className="text-muted-foreground">Please wait while we load your timetable</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Class Time Table</h1>
        <p className="text-muted-foreground mt-2">View your class schedule and assigned lessons</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-orange-500" />
            <span>Weekly Schedule</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  {days.map((day) => (
                    <TableHead key={day}>{day}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.map((period) => (
                  <TableRow key={period}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {period}
                    </TableCell>
                    {days.map((day) => (
                      <TableCell key={`${day}-${period}`} className="min-w-[200px]">
                        {timeTable[day]?.[period] && (
                          <div className="space-y-2">
                            <div className="flex flex-col items-start justify-start gap-2">
                                <div className="flex items-center gap-1 text-primary" title='Subject'>
                                    <BookA className="h-4 w-4" />
                                    <span>
                                        {timeTable[day][period].subject}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1 text-black" title='Teacher'>
                                    <User className="h-4 w-4" />
                                    <span>
                                        {timeTable[day][period].teacher}
                                    </span>
                                </div>
                            </div>
                            <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                              {timeTable[day][period].lessonId && (
                                <div className="flex items-center gap-1">
                                  <BookOpen className="h-4 w-4" />
                                  {lessons.find(l => l._id === timeTable[day][period].lessonId)?.title ?
                                  <Link href={`/students/lessons/${lessons.find(l => l._id === timeTable[day][period].lessonId)?._id}`}>
                                    {lessons.find(l => l._id === timeTable[day][period].lessonId)?.title}
                                  </Link>
                                  :
                                  <span>
                                    {'No lesson assigned'}
                                  </span>
                                  }
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 