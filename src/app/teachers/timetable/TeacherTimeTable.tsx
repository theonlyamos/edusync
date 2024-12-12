'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar, BookOpen, GraduationCap, Book } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Link from 'next/link';


interface TimeTableCell {
  subject: string;
  teacher: string;
  lessonId?: string;
  level: string;
}

interface TimeTable {
  [key: string]: {
    [key: string]: TimeTableCell;
  };
}

interface Lesson {
  _id: string;
  title: string;
  subject: string;
  gradeLevel: string;
  teacherId: string;
}

export function TeacherTimeTable() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [timeTable, setTimeTable] = useState<TimeTable>({});
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [editMode, setEditMode] = useState(false);

  const periods = ['8:00-9:00', '9:00-10:00', '10:00-11:00', '11:30-12:30', '12:30-1:30', '2:00-3:00'];
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated' && session?.user?.role !== 'teacher') {
      router.push('/');
    } else if (status === 'authenticated') {
      fetchTimeTableAndLessons();
    }
  }, [status, session]);

  const fetchTimeTableAndLessons = async () => {
    try {
      setLoading(true);
      const timeTableRes= await fetch(`/api/teachers/timetable`)

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
        description: 'Failed to fetch timetable and lessons',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTimeTableChange = async (day: string, period: string, lessonId: string) => {
    const currentCell = timeTable[day]?.[period];
    if (!currentCell) return; // Only allow editing existing assignments

    if (lessonId === 'none') {
      setTimeTable(prev => ({
        ...prev,
        [day]: {
          ...prev[day],
          [period]: {
            ...currentCell,
            lessonId: undefined
          }
        }
      }));
      return;
    }

    const lesson = lessons.find(l => l._id === lessonId);
    if (!lesson) return;

    setTimeTable(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        [period]: {
          ...currentCell,
          lessonId: lesson._id
        }
      }
    }));
  };

  const saveTimeTable = async () => {
    try {
      // Group changes by grade level
      const changesByLevel: { [key: string]: any } = {};
      Object.entries(timeTable).forEach(([day, periods]) => {
        Object.entries(periods).forEach(([period, data]) => {
          if (!changesByLevel[data.level]) {
            changesByLevel[data.level] = {
              [day]: { [period]: data }
            };
          } else {
            if (!changesByLevel[data.level][day]) {
              changesByLevel[data.level][day] = {};
            }
            changesByLevel[data.level][day][period] = data;
          }
        });
      });

      // Save changes for each grade level
      await Promise.all(
        Object.entries(changesByLevel).map(([level, timeTable]) =>
          fetch('/api/teachers/timetable', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ timeTable, level }),
          })
        )
      );

      toast({
        title: 'Success',
        description: 'Timetable saved successfully',
      });
      setEditMode(false);
      fetchTimeTableAndLessons();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save timetable',
        variant: 'destructive',
      });
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

  // Get available lessons for a specific grade level
  const getLessonsForLevel = (level: string) => {
    return lessons.filter(lesson => lesson.gradeLevel === level);
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Time Table</h1>
          <div className="flex gap-2">
            {editMode ? (
              <>
                <Button variant="outline" onClick={() => setEditMode(false)}>
                  Cancel
                </Button>
                <Button onClick={saveTimeTable}>
                  Save Changes
                </Button>
              </>
            ) : (
              <Button onClick={() => setEditMode(true)}>
                Edit Time Table
              </Button>
            )}
          </div>
        </div>
        <p className="text-muted-foreground mt-2">Manage your teaching schedule and assign lessons to time slots</p>
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
                            <div className="flex flex-col items-start gap-2">
                              <div className="flex items-center gap-1 text-sm text-green-800">
                                <GraduationCap className="h-4 w-4"/>
                                {timeTable[day][period].level?.toUpperCase()}
                              </div>
                              <div className="flex items-center gap-1 text-sm text-primary-800">
                                <Book className="h-4 w-4"/>
                                {timeTable[day][period].subject}
                              </div>
                            </div>
                            {editMode ? (
                              <Select
                                value={timeTable[day][period].lessonId || 'none'}
                                onValueChange={(value) => handleTimeTableChange(day, period, value)}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select Lesson" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">No Lesson</SelectItem>
                                  {getLessonsForLevel(timeTable[day][period].level).map((lesson) => (
                                    <SelectItem key={lesson._id} value={lesson._id}>
                                      {lesson.title}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                <BookOpen className="h-4 w-4" />
                                {lessons.find(l => l._id === timeTable[day][period].lessonId)?.title ?
                                  <Link href={`/teachers/lessons/${lessons.find(l => l._id === timeTable[day][period].lessonId)?._id}`}>
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