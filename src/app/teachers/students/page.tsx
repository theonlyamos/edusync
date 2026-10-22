'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { Input } from '@/components/ui/input'
import { DataState, useHomeworkData } from '@/components/homework/shared'
import { formatDate } from '@/lib/format-date'
import { formatGrade } from '@/lib/grade'
import type { TeacherRoster } from '@/lib/teacher-students-server'

const ALL = '__all'

function scoreClass(score: number | null) {
  if (score === null) return 'text-muted-foreground'
  if (score < 50) return 'text-destructive font-medium'
  return ''
}

export default function TeacherStudentsPage() {
  const { data, loading, error, refresh } = useHomeworkData<TeacherRoster>('/api/teachers/students')
  const [query, setQuery] = useState('')
  const [gradeChoice, setGradeChoice] = useState<string | null>(null)

  const grades = useMemo(
    () => [...new Set((data?.students ?? []).map((s) => s.grade?.trim().toLowerCase()).filter((g): g is string => Boolean(g)))].sort(),
    [data],
  )
  // Default to the teacher's own grades when any of their students are in them.
  const defaultGrade = data?.teacherGrades.length === 1 && grades.includes(data.teacherGrades[0]) ? data.teacherGrades[0] : ALL
  const grade = gradeChoice ?? defaultGrade
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (data?.students ?? []).filter(
      (s) => (grade === ALL || s.grade?.trim().toLowerCase() === grade) && (!q || s.name.toLowerCase().includes(q)),
    )
  }, [data, grade, query])

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Students</h1>
          <p className="text-muted-foreground">How students in your school are doing on the homework you set.</p>
        </div>
        {!data ? (
          <DataState loading={loading} error={error} retry={refresh} />
        ) : data.students.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No students have joined your school yet. Share a class code so they can ask to join.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Search students"
                  placeholder="Search by name"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div role="tablist" aria-label="Grade" className="inline-flex flex-wrap rounded-lg border bg-muted/40 p-1 text-sm">
                {[ALL, ...grades].map((g) => (
                  <button
                    key={g}
                    role="tab"
                    aria-selected={grade === g}
                    onClick={() => setGradeChoice(g)}
                    className={`min-h-9 rounded-md px-3 font-medium ${grade === g ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {g === ALL ? 'All grades' : formatGrade(g)}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Student</th>
                    <th className="px-4 py-3 font-medium">Grade</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">Homework done</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">Late or missed</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">Average score</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">Last active</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Link href={`/teachers/students/${s.id}`} className="font-medium text-primary hover:underline">
                          {s.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{s.grade ? formatGrade(s.grade) : '—'}</td>
                      <td className="px-4 py-3 tabular-nums">{s.assigned ? `${s.submitted} of ${s.assigned}` : '—'}</td>
                      <td className={`px-4 py-3 tabular-nums ${s.missed ? 'text-destructive' : ''}`}>
                        {s.late || s.missed ? [s.late ? `${s.late} late` : null, s.missed ? `${s.missed} missed` : null].filter(Boolean).join(' · ') : '—'}
                      </td>
                      <td className={`px-4 py-3 tabular-nums ${scoreClass(s.averageScore)}`}>
                        {s.averageScore === null ? '—' : `${s.averageScore}%`}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {s.lastActive ? formatDate(s.lastActive) : 'Not in the last 90 days'}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No students match.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Average score uses released marks only. Activity counts homework, lessons with the AI tutor and voice sessions.
            </p>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
