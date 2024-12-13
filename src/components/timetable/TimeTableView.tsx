'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar, BookOpen, BookA, User, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Link from 'next/link';

interface TimeTableCell {
  subject: string;
  teacherId: string;
  teacherName?: string;
  lessonId?: string;
  lessonTitle?: string;
  level?: string;
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
  level?: string;
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
  gradeLevel?: string;
}

interface TimeTableViewProps {
  timeTable: TimeTable;
  periods: Period[];
  teachers: Teacher[];
  lessons: Lesson[];
  onAddPeriod?: () => void;
  onUpdatePeriod?: (periodId: string, startTime: string, endTime: string) => void;
  onDeletePeriod?: (periodId: string) => void;
  onUpdateTimeTableCell?: (day: string, periodId: string, level: string, subject: string, teacherId: string, lessonId?: string) => void;
  showLessonSelect?: boolean;
  showTeacherSelect?: boolean;
  showSubjectSelect?: boolean;
  isTeacherView?: boolean;
  currentUserId?: string;
  title?: string;
  subjects?: string[];
}

export function TimeTableView({
  timeTable,
  periods,
  teachers,
  lessons,
  onAddPeriod,
  onUpdatePeriod,
  onDeletePeriod,
  onUpdateTimeTableCell,
  showLessonSelect = true,
  showTeacherSelect = true,
  showSubjectSelect = true,
  isTeacherView = false,
  currentUserId,
  title = "Time Table",
  subjects = []
}: TimeTableViewProps) {
  const [editingCell, setEditingCell] = useState<{ day: string; periodId: string; level?: string } | null>(null);
  const [editingPeriod, setEditingPeriod] = useState<string | null>(null);

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  // Get available lessons for a specific grade level
  const getLessonsForLevel = (level: string) => {
    if (isTeacherView) {
      return lessons.filter(lesson => lesson.gradeLevel === level);
    }
    return lessons;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-orange-500" />
          <span>{title}</span>
        </CardTitle>
        {onAddPeriod && (
          <Button onClick={onAddPeriod} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Period
          </Button>
        )}
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
                    {onUpdatePeriod ? (
                      editingPeriod === period.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            type="time"
                            defaultValue={period.startTime}
                            className="w-32"
                            onChange={(e) => {
                              const startTime = e.target.value;
                              const endTimeInput = e.target.parentElement?.querySelector('input[type="time"]:last-child') as HTMLInputElement;
                              if (endTimeInput && endTimeInput.value) {
                                onUpdatePeriod(period.id, startTime, endTimeInput.value);
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
                                onUpdatePeriod(period.id, startTimeInput.value, endTime);
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
                          <div className="text-sm font-medium cursor-pointer" onClick={() => setEditingPeriod(period.id)}>
                            {period.startTime && period.endTime ? (
                              `${new Date('1970-01-01T' + period.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date('1970-01-01T' + period.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                            ) : (
                              'Click to set time'
                            )}
                          </div>
                          {onDeletePeriod && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onDeletePeriod(period.id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          )}
                        </div>
                      )
                    ) : (
                      <div className="text-sm font-medium">
                        {period.startTime && period.endTime ? (
                          `${new Date('1970-01-01T' + period.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date('1970-01-01T' + period.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                        ) : (
                          'Time not set'
                        )}
                      </div>
                    )}
                  </TableCell>
                  {days.map((day) => (
                    <TableCell key={`${day}-${period.id}`} className="min-w-[200px]">
                      {timeTable[day]?.[period.id] && (
                        <div 
                          className={`space-y-2 p-2 rounded ${onUpdateTimeTableCell ? 'hover:bg-gray-50 cursor-pointer' : ''}`}
                          onClick={() => {
                            if (onUpdateTimeTableCell && (!isTeacherView || timeTable[day][period.id].teacherId === currentUserId)) {
                              setEditingCell({ 
                                day, 
                                periodId: period.id,
                                level: period.level || timeTable[day][period.id].level
                              });
                            }
                          }}
                        >
                          {editingCell?.day === day && editingCell?.periodId === period.id ? (
                            <div className="space-y-2">
                              {period.level && (
                                <div className="text-sm font-medium text-green-800">
                                  Grade: {period.level.toUpperCase()}
                                </div>
                              )}
                              {showSubjectSelect && (
                                <Select
                                  defaultValue={timeTable[day][period.id].subject || 'none'}
                                  onValueChange={(subject) => {
                                    if (onUpdateTimeTableCell) {
                                      const teacherId = timeTable[day][period.id].teacherId || 'none';
                                      const lessonId = timeTable[day][period.id].lessonId;
                                      onUpdateTimeTableCell(
                                        day,
                                        period.id,
                                        editingCell.level || '',
                                        subject === 'none' ? '' : subject,
                                        teacherId === 'none' ? '' : teacherId,
                                        lessonId
                                      );
                                    }
                                  }}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select subject" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">No Subject</SelectItem>
                                    {subjects.map(subject => (
                                      <SelectItem key={subject} value={subject}>
                                        {subject}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                              {showTeacherSelect && (
                                <Select
                                  defaultValue={timeTable[day][period.id].teacherId || 'none'}
                                  onValueChange={(teacherId) => {
                                    if (onUpdateTimeTableCell) {
                                      const subject = timeTable[day][period.id].subject || 'none';
                                      const lessonId = timeTable[day][period.id].lessonId;
                                      onUpdateTimeTableCell(
                                        day,
                                        period.id,
                                        editingCell.level || '',
                                        subject === 'none' ? '' : subject,
                                        teacherId === 'none' ? '' : teacherId,
                                        lessonId
                                      );
                                    }
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
                              )}
                              {showLessonSelect && timeTable[day][period.id].teacherId && (
                                <Select
                                  defaultValue={timeTable[day][period.id].lessonId || 'none'}
                                  onValueChange={(lessonId) => {
                                    if (onUpdateTimeTableCell) {
                                      const subject = timeTable[day][period.id].subject || 'none';
                                      const teacherId = timeTable[day][period.id].teacherId || 'none';
                                      onUpdateTimeTableCell(
                                        day,
                                        period.id,
                                        editingCell.level || '',
                                        subject === 'none' ? '' : subject,
                                        teacherId === 'none' ? '' : teacherId,
                                        lessonId === 'none' ? undefined : lessonId
                                      );
                                    }
                                  }}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select lesson" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">No Lesson</SelectItem>
                                    {getLessonsForLevel(editingCell.level || '').map(lesson => (
                                      <SelectItem key={lesson._id} value={lesson._id}>
                                        {lesson.title}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingCell(null);
                                }}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              {period.level && (
                                <div className="flex items-center gap-1 text-sm text-green-800">
                                  Grade: {period.level.toUpperCase()}
                                </div>
                              )}
                              <div className="flex items-center gap-1 text-sm">
                                <BookA className="h-4 w-4" />
                                <span className="font-medium">
                                  {timeTable[day][period.id].subject || 'No subject'}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 text-primary text-sm">
                                <User className="h-4 w-4" />
                                {timeTable[day][period.id].teacherName || 
                                 teachers.find(t => t._id === timeTable[day][period.id].teacherId)?.name || 
                                 'No teacher assigned'}
                              </div>
                              {timeTable[day][period.id].lessonId && (
                                <div className="flex items-center gap-1 text-blue-600 text-sm">
                                  <BookOpen className="h-4 w-4" />
                                  <Link 
                                    href={`/${isTeacherView ? 'teachers' : 'admin'}/lessons/${timeTable[day][period.id].lessonId}`}
                                  >
                                    {timeTable[day][period.id].lessonTitle || 
                                     lessons.find(l => l._id === timeTable[day][period.id].lessonId)?.title || 
                                     'Lesson not found'}
                                  </Link>
                                </div>
                              )}
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
  );
} 