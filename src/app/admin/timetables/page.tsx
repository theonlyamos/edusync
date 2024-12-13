'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EDUCATION_LEVELS } from '@/lib/constants';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Calendar, BookA, GraduationCap, Plus, Trash2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';

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

export default function TimetablesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [selectedLevel, setSelectedLevel] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [timeTable, setTimeTable] = useState<TimeTable>({});
  const [periods, setPeriods] = useState<Period[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [editingCell, setEditingCell] = useState<{ day: string; periodId: string } | null>(null);
  const [editingPeriod, setEditingPeriod] = useState<string | null>(null);

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

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
      const response = await fetch(`/api/admin/grades/${selectedLevel}`);
      if (!response.ok) throw new Error('Failed to fetch timetable data');
      const data = await response.json();
      setTimeTable(data.timeTable || {});
      setPeriods(data.periods || []);
      setTeachers(data.teachers || []);
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: "Failed to fetch timetable data",
        variant: "destructive",
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
        title: "Success",
        description: "Period added successfully",
      });
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: "Failed to add period",
        variant: "destructive",
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
      setEditingPeriod(null);
      toast({
        title: "Success",
        description: "Period updated successfully",
      });
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: "Failed to update period",
        variant: "destructive",
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
        title: "Success",
        description: "Period deleted successfully",
      });
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: "Failed to delete period",
        variant: "destructive",
      });
    }
  };

  const updateTimeTableCell = async (day: string, periodId: string, subject: string, teacherId: string) => {
    try {
      const response = await fetch(`/api/admin/grades/${selectedLevel}/timetable`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          day,
          periodId,
          subject,
          teacherId
        })
      });

      if (!response.ok) throw new Error('Failed to update timetable');

      setTimeTable(prev => ({
        ...prev,
        [day]: {
          ...prev[day],
          [periodId]: { subject, teacherId }
        }
      }));
      setEditingCell(null);
      toast({
        title: "Success",
        description: "Timetable updated successfully",
      });
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: "Failed to update timetable",
        variant: "destructive",
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
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-orange-500" />
              <span>Select Grade Level</span>
            </CardTitle>
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
                  {EDUCATION_LEVELS.map((level) => (
                    <SelectItem key={level} value={level}>
                      {level.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedLevel && !loading && (
              <div className="mt-6">
                <div className="flex justify-end mb-4">
                  <Button onClick={addPeriod} className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Add Period
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[200px]">Time</TableHead>
                        {days.map((day) => (
                          <TableHead key={day}>{day}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {periods.map((period) => (
                        <TableRow key={period.id}>
                          <TableCell className="font-medium whitespace-nowrap">
                            {editingPeriod === period.id ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  type="time"
                                  defaultValue={period.startTime}
                                  className="w-32"
                                  onChange={(e) => {
                                    const startTime = e.target.value;
                                    const endTimeInput = e.target.parentElement?.querySelector('input[type="time"]:last-child') as HTMLInputElement;
                                    if (endTimeInput && endTimeInput.value) {
                                      updatePeriod(period.id, startTime, endTimeInput.value);
                                    }
                                  }}
                                />
                                <span>-</span>
                                <Input
                                  type="time"
                                  defaultValue={period.endTime}
                                  className="w-32"
                                  onChange={(e) => {
                                    const endTime = e.target.value;
                                    const startTimeInput = e.target.parentElement?.querySelector('input[type="time"]:first-child') as HTMLInputElement;
                                    if (startTimeInput && startTimeInput.value) {
                                      updatePeriod(period.id, startTimeInput.value, endTime);
                                    }
                                  }}
                                />
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setEditingPeriod(null)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between">
                                <div className="text-sm font-medium" onClick={() => setEditingPeriod(period.id)}>
                                  {period.startTime && period.endTime ? (
                                    `${new Date('1970-01-01T' + period.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date('1970-01-01T' + period.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                                  ) : (
                                    'Click to set time'
                                  )}
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => deletePeriod(period.id)}
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                          {days.map((day) => (
                            <TableCell key={`${day}-${period.id}`} className="min-w-[200px]">
                              {editingCell?.day === day && editingCell?.periodId === period.id ? (
                                <div className="space-y-2">
                                  <Select
                                    defaultValue={timeTable[day]?.[period.id]?.subject || ''}
                                    onValueChange={(subject) => {
                                      const teacherId = timeTable[day]?.[period.id]?.teacherId || '';
                                      updateTimeTableCell(day, period.id, subject, teacherId);
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select subject" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">No Subject</SelectItem>
                                      {Array.from(new Set(teachers.flatMap(t => t.subjects))).map(subject => (
                                        <SelectItem key={subject} value={subject}>
                                          {subject}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Select
                                    defaultValue={timeTable[day]?.[period.id]?.teacherId || ''}
                                    onValueChange={(teacherId) => {
                                      const subject = timeTable[day]?.[period.id]?.subject || '';
                                      updateTimeTableCell(day, period.id, subject, teacherId);
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select teacher" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">No Teacher</SelectItem>
                                      {teachers.map(teacher => (
                                        <SelectItem key={teacher._id} value={teacher._id}>
                                          {teacher.name}
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
                                  className="space-y-1 cursor-pointer hover:bg-gray-50 p-2 rounded"
                                  onClick={() => setEditingCell({ day, periodId: period.id })}
                                >
                                  {timeTable[day]?.[period.id] && (
                                    <>
                                      <div className="flex items-center gap-1 text-sm">
                                        <BookA className="h-4 w-4" />
                                        <span className="font-medium">{timeTable[day][period.id].subject || 'No subject'}</span>
                                      </div>
                                      <div className="flex items-center gap-1 text-primary text-sm">
                                        <GraduationCap className="h-4 w-4" />
                                        {teachers.find(t => t._id === timeTable[day][period.id].teacherId)?.name || 'No teacher assigned'}
                                      </div>
                                    </>
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