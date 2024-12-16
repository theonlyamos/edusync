'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GRADE_LEVELS, SUBJECTS } from '@/lib/constants';
import { useToast } from '@/components/ui/use-toast';
import { TimeTableView } from '@/components/timetable/TimeTableView';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

interface Period {
  id: string;
  startTime: string;
  endTime: string;
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

interface Teacher {
  _id: string;
  name: string;
  subjects: string[];
}

interface Lesson {
  _id: string;
  title: string;
  subject: string;
}

export default function TimetablesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [selectedLevel, setSelectedLevel] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [timeTable, setTimeTable] = useState<TimeTable>({});
  const [periods, setPeriods] = useState<Period[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated' && session?.user?.role !== 'admin') {
      router.push('/');
    }
  }, [status, session, router]);

  useEffect(() => {
    if (selectedLevel) {
      fetchTimetableData();
    }
  }, [selectedLevel]);

  const fetchTimetableData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/grades/${selectedLevel}/timetable`);
      if (!response.ok) throw new Error('Failed to fetch timetable data');
      const data = await response.json();
      setTimeTable(data.timeTable || {});
      setPeriods(data.periods || []);
      setTeachers(data.teachers || []);
      setLessons(data.lessons || []);
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch timetable data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const addPeriod = async () => {
    try {
      const response = await fetch(`/api/admin/grades/${selectedLevel}/periods`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startTime: '08:00',
          endTime: '09:00'
        })
      });

      if (!response.ok) throw new Error('Failed to add period');
      
      const newPeriod = await response.json();
      setPeriods([...periods, newPeriod]);
      toast({
        title: 'Success',
        description: 'Period added successfully',
      });
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: 'Failed to add period',
        variant: 'destructive',
      });
    }
  };

  const updatePeriod = async (periodId: string, startTime: string, endTime: string) => {
    try {
      const response = await fetch(`/api/admin/grades/${selectedLevel}/periods/${periodId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startTime, endTime })
      });

      if (!response.ok) throw new Error('Failed to update period');

      setPeriods(periods.map(p => 
        p.id === periodId ? { ...p, startTime, endTime } : p
      ));
      toast({
        title: 'Success',
        description: 'Period updated successfully',
      });
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: 'Failed to update period',
        variant: 'destructive',
      });
    }
  };

  const deletePeriod = async (periodId: string) => {
    try {
      const response = await fetch(`/api/admin/grades/${selectedLevel}/periods/${periodId}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete period');

      setPeriods(periods.filter(p => p.id !== periodId));
      toast({
        title: 'Success',
        description: 'Period deleted successfully',
      });
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete period',
        variant: 'destructive',
      });
    }
  };

  const updateTimeTableCell = async (day: string, periodId: string, level: string, subject: string, teacherId: string, lessonId?: string) => {
    try {
      const response = await fetch(`/api/admin/grades/${selectedLevel}/timetable`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          day,
          periodId,
          subject,
          teacherId,
          lessonId
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

  if (status === 'loading') {
    return <div>Loading...</div>;
  }

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Timetables</h1>
            <p className="text-muted-foreground">View and manage class timetables</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Select Grade Level</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-w-xs">
              <Select
                value={selectedLevel}
                onValueChange={setSelectedLevel}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a grade level" />
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

            {selectedLevel && !loading && (
              <div className="mt-6">
                <TimeTableView
                  timeTable={timeTable}
                  periods={periods}
                  teachers={teachers}
                  lessons={lessons}
                  onAddPeriod={addPeriod}
                  onUpdatePeriod={updatePeriod}
                  onDeletePeriod={deletePeriod}
                  onUpdateTimeTableCell={updateTimeTableCell}
                  title="Class Time Table"
                  subjects={[...SUBJECTS]}
                />
              </div>
            )}

            {loading && (
              <div className="mt-6 text-center">
                <p>Loading timetable data...</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
} 