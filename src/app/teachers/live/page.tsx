'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import axios from 'axios'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { useLiveClassJoinTick } from '@/hooks/useLiveClassJoinTick'
import { getClientLiveClassLobbyMinutes, liveClassJoinStatesByEventId } from '@/lib/live-class-window'
import { CalendarPlus, Loader2, Pencil, Trash2 } from 'lucide-react'
import { GRADE_LEVELS } from '@/lib/constants'

type LessonOption = { _id: string; title: string; subject?: string }

type LessonsEmbed = { title?: string } | { title?: string }[] | null

type EventRow = {
  id: string
  title: string
  scheduled_start_at: string
  scheduled_end_at: string
  status: string
  grade_level?: string | null
  lesson_id?: string | null
  lessons?: LessonsEmbed
}

function lessonTitleFromEmbed(lessons: LessonsEmbed | undefined): string | null {
  if (!lessons) return null
  if (Array.isArray(lessons)) return lessons[0]?.title ?? null
  return lessons.title ?? null
}

const DEFAULT_TITLE = 'Live tutoring session'

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function TeachersLiveClassesPage() {
  const { toast } = useToast()
  const [items, setItems] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<EventRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState(DEFAULT_TITLE)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [gradeLevel, setGradeLevel] = useState('')
  const [lessonId, setLessonId] = useState<string>('')
  const [lessons, setLessons] = useState<LessonOption[]>([])
  const [lessonsLoading, setLessonsLoading] = useState(false)
  const [teacherGrades, setTeacherGrades] = useState<string[] | null>(null)
  const prevGradeForLessonsRef = useRef('')
  const editLessonIdRef = useRef('')
  const joinTick = useLiveClassJoinTick()
  const lobbyMinutes = getClientLiveClassLobbyMinutes()
  const joinById = useMemo(
    () => liveClassJoinStatesByEventId(items, lobbyMinutes, new Date()),
    [items, lobbyMinutes, joinTick]
  )

  const availableGrades = useMemo(() => {
    if (teacherGrades?.length) return teacherGrades
    return [...GRADE_LEVELS]
  }, [teacherGrades])

  const load = async () => {
    const { data } = await axios.get<{ items: EventRow[] }>('/api/live-classes')
    setItems(data.items || [])
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/teachers/profile')
        if (res.ok) {
          const data = await res.json()
          const g = data.grades as string[] | undefined
          if (!cancelled && g?.length) setTeacherGrades(g)
        }
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await load()
      } catch {
        if (!cancelled) setItems([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!gradeLevel) {
      setLessons([])
      setLessonId('')
      prevGradeForLessonsRef.current = ''
      return
    }
    const gradeChanged =
      prevGradeForLessonsRef.current !== '' && prevGradeForLessonsRef.current !== gradeLevel
    prevGradeForLessonsRef.current = gradeLevel
    if (gradeChanged) {
      setLessonId('')
    }
    let cancelled = false
    setLessonsLoading(true)
    ;(async () => {
      try {
        const res = await fetch(`/api/lessons?grade=${encodeURIComponent(gradeLevel)}`)
        if (!res.ok) throw new Error('lessons')
        const data = (await res.json()) as LessonOption[]
        if (!cancelled) setLessons(Array.isArray(data) ? data : [])
      } catch {
        if (!cancelled) setLessons([])
      } finally {
        if (!cancelled) setLessonsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [gradeLevel])

  useEffect(() => {
    if (!scheduleModalOpen || !gradeLevel || lessonsLoading) return
    const want = editLessonIdRef.current
    if (!want) return
    if (lessons.some((l) => l._id === want)) {
      setLessonId(want)
    }
    editLessonIdRef.current = ''
  }, [scheduleModalOpen, gradeLevel, lessons, lessonsLoading])

  const resetScheduleForm = () => {
    setTitle(DEFAULT_TITLE)
    setStart('')
    setEnd('')
    setGradeLevel('')
    setLessonId('')
    setLessons([])
    setEditingEventId(null)
    prevGradeForLessonsRef.current = ''
    editLessonIdRef.current = ''
  }

  const openNewScheduleModal = () => {
    resetScheduleForm()
    setScheduleModalOpen(true)
  }

  const openEditScheduleModal = (ev: EventRow) => {
    editLessonIdRef.current = ev.lesson_id ?? ''
    prevGradeForLessonsRef.current = ''
    setEditingEventId(ev.id)
    setTitle(ev.title || DEFAULT_TITLE)
    setStart(toDatetimeLocalValue(ev.scheduled_start_at))
    setEnd(toDatetimeLocalValue(ev.scheduled_end_at))
    setGradeLevel(ev.grade_level || '')
    setLessonId('')
    setScheduleModalOpen(true)
  }

  const handleScheduleModalOpenChange = (open: boolean) => {
    if (!open && saving) return
    setScheduleModalOpen(open)
    if (!open) {
      resetScheduleForm()
    }
  }

  const saveSchedule = async () => {
    if (!title.trim() || !start || !end || !gradeLevel) {
      toast({
        title: 'Missing details',
        description: 'Add a title, grade, start time, and end time.',
        variant: 'destructive',
      })
      return
    }
    const startMs = new Date(start).getTime()
    const endMs = new Date(end).getTime()
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs <= startMs) {
      toast({
        title: 'Check your times',
        description: 'End time must be after start time.',
        variant: 'destructive',
      })
      return
    }
    setSaving(true)
    try {
        if (editingEventId) {
        await axios.patch(`/api/live-classes/${editingEventId}`, {
          title: title.trim(),
          grade_level: gradeLevel,
          lesson_id: lessonId || null,
          scheduled_start_at: new Date(start).toISOString(),
          scheduled_end_at: new Date(end).toISOString(),
        })
        await load()
        setScheduleModalOpen(false)
        toast({
          title: 'Live class updated',
          description: 'Students see the new title, times, grade, or lesson on their list.',
        })
      } else {
        const gradeLabel = gradeLevel
        const { data: created } = await axios.post<{
          id: string
          auto_enrolled?: number
          auto_enroll_lookup_failed?: boolean
        }>('/api/live-classes', {
          title: title.trim(),
          grade_level: gradeLevel,
          lesson_id: lessonId || null,
          scheduled_start_at: new Date(start).toISOString(),
          scheduled_end_at: new Date(end).toISOString(),
        })
        await load()
        setScheduleModalOpen(false)

        const n = created?.auto_enrolled ?? 0
        const lookupFailed = created?.auto_enroll_lookup_failed === true
        let description =
          'It appears in your list below. Open the live room when you are ready to teach.'
        if (lookupFailed) {
          description =
            'We could not enroll students by grade automatically. Ask students to join from their live classes list, or contact support if this keeps happening.'
        } else if (n > 0) {
          description = `We enrolled ${n} student${n === 1 ? '' : 's'} in ${gradeLabel}. ${description}`
        } else {
          description = `No students matched this grade in the roster yet. ${description} Students can still join from their list if you share the class with them.`
        }

        toast({
          title: 'Live class scheduled',
          description,
        })
      }
    } catch (e: unknown) {
      let description = 'Something went wrong. Wait a moment and try again.'
      if (axios.isAxiosError(e)) {
        const err = (e.response?.data as { error?: string } | undefined)?.error
        if (typeof err === 'string' && err.trim()) description = err.trim()
      }
      toast({
        title: editingEventId ? 'Could not save changes' : 'Could not create live class',
        description,
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const confirmDeleteLiveClass = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await axios.delete(`/api/live-classes/${deleteTarget.id}`)
      setDeleteTarget(null)
      await load()
      toast({
        title: 'Live class removed',
        description: 'Students no longer see it on their list.',
      })
    } catch (e: unknown) {
      let description = 'Wait a moment and try again. If it keeps happening, contact support.'
      if (axios.isAxiosError(e)) {
        const err = (e.response?.data as { error?: string } | undefined)?.error
        if (typeof err === 'string' && err.trim()) description = err.trim()
      }
      toast({
        title: 'Could not delete live class',
        description,
        variant: 'destructive',
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Live classes</h1>
            <p className="text-muted-foreground text-sm mt-1 max-w-xl">
              Schedule a session for a grade—students in that grade are enrolled automatically when possible. Open the
              live room when class starts.
            </p>
          </div>
          <Button type="button" className="shrink-0 gap-2" onClick={() => openNewScheduleModal()}>
            <CalendarPlus className="h-4 w-4" aria-hidden />
            Schedule live class
          </Button>
        </div>

        <Dialog open={scheduleModalOpen} onOpenChange={handleScheduleModalOpenChange}>
          <DialogContent
            className="max-h-[min(90vh,720px)] overflow-y-auto sm:max-w-md"
            onPointerDownOutside={(e) => saving && e.preventDefault()}
            onEscapeKeyDown={(e) => saving && e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>{editingEventId ? 'Edit live class' : 'Schedule a live class'}</DialogTitle>
              <DialogDescription>
                {editingEventId
                  ? "Update the details below. Times use your device's time zone."
                  : "Pick a grade first—only your lessons for that grade appear. Times use your device's time zone."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-1">
              <div className="space-y-2">
                <Label htmlFor="live-class-title">Class title</Label>
                <Input
                  id="live-class-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Fractions review"
                />
              </div>
              <div className="space-y-2">
                <Label>Grade</Label>
                <Select value={gradeLevel || undefined} onValueChange={setGradeLevel}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a grade" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableGrades.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Lesson (optional)</Label>
                <p className="text-xs text-muted-foreground">
                  Tie this session to a lesson plan, or leave as a general session.
                </p>
                <Select
                  value={lessonId || '__none__'}
                  onValueChange={(v) => setLessonId(v === '__none__' ? '' : v)}
                  disabled={!gradeLevel || lessonsLoading}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={
                        !gradeLevel
                          ? 'Choose a grade first'
                          : lessonsLoading
                            ? 'Loading your lessons…'
                            : 'General session (no lesson)'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">General session (no lesson)</SelectItem>
                    {lessons.map((l) => (
                      <SelectItem key={l._id} value={l._id}>
                        {l.title}
                        {l.subject ? ` · ${l.subject}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="live-class-start">Starts</Label>
                <Input
                  id="live-class-start"
                  type="datetime-local"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="live-class-end">Ends</Label>
                <Input
                  id="live-class-end"
                  type="datetime-local"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleScheduleModalOpenChange(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="inline-flex items-center gap-2"
                onClick={() => void saveSchedule()}
                disabled={saving || !gradeLevel}
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                    {editingEventId ? 'Saving…' : 'Scheduling…'}
                  </>
                ) : editingEventId ? (
                  'Save changes'
                ) : (
                  'Create live class'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span>Loading your live classes…</span>
          </div>
        ) : items.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No live classes yet</CardTitle>
              <CardDescription>
                Create your first session with &quot;Schedule live class.&quot; Students in that grade are added when
                possible; they can also join from their live classes list.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button type="button" className="gap-2" onClick={() => openNewScheduleModal()}>
                <CalendarPlus className="h-4 w-4" aria-hidden />
                Schedule live class
              </Button>
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-4">
            {items.map((ev) => {
              const lt = lessonTitleFromEmbed(ev.lessons)
              const statusLabel = ev.status ? ev.status.charAt(0).toUpperCase() + ev.status.slice(1) : ''
              const row = joinById.get(ev.id)
              const joinAllowed = row?.joinAllowed ?? false
              const joinHint = row?.joinHint ?? ''
              return (
                <li key={ev.id}>
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex flex-row items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-1">
                          <CardTitle className="text-lg">{ev.title}</CardTitle>
                          <CardDescription>
                            {ev.grade_level ? <span className="block">Grade: {ev.grade_level}</span> : null}
                            {lt ? <span className="block">Lesson: {lt}</span> : null}
                            <span className="block mt-1">
                              {new Date(ev.scheduled_start_at).toLocaleString()} –{' '}
                              {new Date(ev.scheduled_end_at).toLocaleString()}
                              {statusLabel ? ` · ${statusLabel}` : null}
                            </span>
                          </CardDescription>
                        </div>
                        <div className="flex shrink-0 gap-0.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            aria-label="Edit live class"
                            onClick={() => openEditScheduleModal(ev)}
                          >
                            <Pencil className="h-4 w-4" aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            aria-label="Delete live class"
                            onClick={() => setDeleteTarget(ev)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 pt-0">
                      {joinAllowed ? (
                        <Button asChild size="sm">
                          <Link href={`/teachers/live/${ev.id}`}>Enter live classroom</Link>
                        </Button>
                      ) : (
                        <Button size="sm" disabled title={joinHint}>
                          Enter live classroom
                        </Button>
                      )}
                      {joinHint ? (
                        <p className="text-xs text-muted-foreground max-w-lg">{joinHint}</p>
                      ) : null}
                    </CardContent>
                  </Card>
                </li>
              )
            })}
          </ul>
        )}

        <AlertDialog
          open={!!deleteTarget}
          onOpenChange={(open) => {
            if (!open && !deleting) setDeleteTarget(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this live class?</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget ? (
                  <>
                    <span className="block font-medium text-foreground">{deleteTarget.title}</span>
                    <span className="mt-2 block">
                      Students will no longer see it on their list. Scheduled times and enrollments for this class are
                      removed. You cannot undo this.
                    </span>
                  </>
                ) : null}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Keep class</AlertDialogCancel>
              <Button
                type="button"
                variant="destructive"
                disabled={deleting}
                className="mt-2 sm:mt-0"
                onClick={() => void confirmDeleteLiveClass()}
              >
                {deleting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    Deleting…
                  </>
                ) : (
                  'Delete live class'
                )}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  )
}
