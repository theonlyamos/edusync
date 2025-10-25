'use client';

import { useEffect, useState, useContext } from 'react';
import { SupabaseSessionContext } from '@/components/providers/SupabaseAuthProvider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar, BookOpen, GraduationCap, Book, X } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface TimeTableCell {
  subject: string;
  teacherId: string;
  lessonId?: string;
  level: string;
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
  level: string;
}

interface Lesson {
  _id: string;
  title: string;
  subject: string;
  gradeLevel: string;
  teacherId: string;
}

export function TeacherTimeTable() {
  const session = useContext(SupabaseSessionContext);
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [timeTable, setTimeTable] = useState<TimeTable>({});
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [editingCell, setEditingCell] = useState<{ day: string; periodId: string; level: string } | null>(null);

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  useEffect(() => {
    if (session?.user?.role === 'teacher') {
      fetchTimeTableAndLessons();
    }
  }, [session]);

  const fetchTimeTableAndLessons = async () => {
    try {
      setLoading(true);
      const timeTableRes = await fetch(`/api/teachers/timetable`);

      if (!timeTableRes.ok) {
        throw new Error('Failed to fetch data');
      }

      const { timeTable: fetchedTimeTable, lessons: fetchedLessons, periods: fetchedPeriods } = await timeTableRes.json();

      setTimeTable(fetchedTimeTable || {});
      setLessons(fetchedLessons || []);
      setPeriods(fetchedPeriods || []);
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

  const updateTimeTableCell = async (day: string, periodId: string, level: string, lessonId: string) => {
    try {
      const lesson = lessons.find(l => l._id === lessonId);
      if (!lesson && lessonId !== 'none') return;

      const response = await fetch(`/api/admin/grades/${level}/timetable`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          day,
          periodId,
          subject: lesson?.subject || '',
          teacherId: lessonId === 'none' ? '' : session?.user?.id || '',
          lessonId: lessonId === 'none' ? undefined : lessonId
        }),
      });

      if (!response.ok) throw new Error('Failed to update timetable');

      const updatedSchedule = await response.json();
      setTimeTable(prev => ({
        ...prev,
        [day]: {
          ...prev[day],
          [periodId]: {
            ...prev[day]?.[periodId],
            subject: lesson?.subject || '',
            teacherId: lessonId === 'none' ? '' : session?.user?.id || '',
            lessonId: lessonId === 'none' ? undefined : lessonId,
            level
          }
        }
      }));

      setEditingCell(null);
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
        <h1 className="text-3xl font-bold">Time Table</h1>
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
                  <TableRow key={period.id}>
                    <TableCell className="font-medium whitespace-nowrap">
                      <div className="text-sm font-medium">
                        {period.startTime && period.endTime ? (
                          `${new Date('1970-01-01T' + period.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date('1970-01-01T' + period.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                        ) : (
                          'Time not set'
                        )}
                      </div>
                    </TableCell>
                    {days.map((day) => (
                      <TableCell key={`${day}-${period.id}`} className="min-w-[200px]">
                        {timeTable[day]?.[period.id] && (
                          <>
                            {editingCell?.day === day && editingCell?.periodId === period.id ? (
                              <div className="space-y-2">
                                <div className="flex items-center gap-1 text-sm text-green-800">
                                  <GraduationCap className="h-4 w-4"/>
                                  {timeTable[day][period.id].level?.toUpperCase()}
                                </div>
                                <div className="flex items-center gap-1 text-sm text-primary-800">
                                  <Book className="h-4 w-4"/>
                                  {timeTable[day][period.id].subject}
                                </div>
                                <Select
                                  defaultValue={timeTable[day][period.id].lessonId || 'none'}
                                  onValueChange={(value) => updateTimeTableCell(day, period.id, timeTable[day][period.id].level, value)}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select Lesson" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">No Lesson</SelectItem>
                                    {getLessonsForLevel(timeTable[day][period.id].level).map((lesson) => (
                                      <SelectItem key={lesson._id} value={lesson._id}>
                                        {lesson.title}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setEditingCell(null)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <div
                                className="space-y-2 cursor-pointer hover:bg-gray-50 p-2 rounded"
                                onClick={() => setEditingCell({ day, periodId: period.id, level: timeTable[day][period.id].level })}
                              >
                                <div className="flex items-center gap-1 text-sm text-green-800">
                                  <GraduationCap className="h-4 w-4"/>
                                  {timeTable[day][period.id].level?.toUpperCase()}
                                </div>
                                <div className="flex items-center gap-1 text-sm text-primary-800">
                                  <Book className="h-4 w-4"/>
                                  {timeTable[day][period.id].subject}
                                </div>
                                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                  <BookOpen className="h-4 w-4" />
                                  {lessons.find(l => l._id === timeTable[day][period.id].lessonId)?.title ? (
                                    <Link href={`/teachers/lessons/${timeTable[day][period.id].lessonId}`}>
                                      {lessons.find(l => l._id === timeTable[day][period.id].lessonId)?.title}
                                    </Link>
                                  ) : (
                                    <span>No lesson assigned</span>
                                  )}
                                </div>
                              </div>
                            )}
                          </>
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