'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { Loader2, Megaphone, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { homeworkRequest, useHomeworkData } from '@/components/homework/shared';
import { NATIVE_SELECT_CLASS } from '@/components/school-portal/PersonFormDialog';
import { ANNOUNCEMENT_BODY_MAX, ANNOUNCEMENT_TITLE_MAX, audienceLabel, timeAgo, type Announcement } from '@/lib/notifications';
import { sortGrades } from '@/lib/school-grades';
import { gradeLevelLabel } from '@/lib/school-registration';

type Board = {
  announcements: Announcement[];
  canPost: boolean;
  manager: boolean;
  classes: { id: string; name: string; grade: string }[];
  grades: string[];
};

/** What the audience picker holds: "everyone", "teachers", "students", "grade:<g>" or "class:<id>". */
function audienceFields(value: string) {
  if (value.startsWith('class:')) return { audience: 'students', classId: value.slice(6), gradeLevel: null };
  if (value.startsWith('grade:')) return { audience: 'students', classId: null, gradeLevel: value.slice(6) };
  return { audience: value, classId: null, gradeLevel: null };
}

function Compose({ board, onPosted }: { board: Board; onPosted: () => void }) {
  const { toast } = useToast();
  const grades = useMemo(() => sortGrades(board.grades), [board.grades]);
  const [audience, setAudience] = useState(board.manager ? 'everyone' : board.classes[0] ? `class:${board.classes[0].id}` : '');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  if (!board.manager && board.classes.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          You can post announcements to the classes you teach. Ask your school administrator to add you to a class.
        </CardContent>
      </Card>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const result = await homeworkRequest<{ recipients: number }>('/api/announcements', {
        method: 'POST',
        body: JSON.stringify({ title, body, ...audienceFields(audience) }),
      });
      toast({ title: `Sent to ${result.recipients} ${result.recipients === 1 ? 'person' : 'people'}` });
      setTitle('');
      setBody('');
      onPosted();
    } catch (error) {
      toast({ title: (error as Error).message || 'Could not post the announcement.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">New announcement</CardTitle>
        <CardDescription>Everyone you pick gets a notification in the app.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="announcement-audience">Send to</Label>
            <select id="announcement-audience" className={NATIVE_SELECT_CLASS} value={audience} onChange={(e) => setAudience(e.target.value)} required>
              {board.manager && (
                <>
                  <option value="everyone">Everyone at the school</option>
                  <option value="teachers">All teachers</option>
                  <option value="students">All students</option>
                  {grades.length > 0 && (
                    <optgroup label="One grade">
                      {grades.map((grade) => <option key={grade} value={`grade:${grade}`}>Students in {gradeLevelLabel(grade)}</option>)}
                    </optgroup>
                  )}
                </>
              )}
              {board.classes.length > 0 && (
                <optgroup label={board.manager ? 'One class' : 'Your classes'}>
                  {board.classes.map((c) => <option key={c.id} value={`class:${c.id}`}>{gradeLevelLabel(c.grade)} {c.name}</option>)}
                </optgroup>
              )}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="announcement-title">Title</Label>
            <Input id="announcement-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={ANNOUNCEMENT_TITLE_MAX} required placeholder="e.g. Sports day moved to Friday" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="announcement-body">Message</Label>
            <Textarea id="announcement-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={ANNOUNCEMENT_BODY_MAX} required rows={5} />
            <p className="text-right text-xs text-muted-foreground tabular-nums">{body.length} / {ANNOUNCEMENT_BODY_MAX}</p>
          </div>
          <Button type="submit" disabled={busy || !title.trim() || !body.trim() || !audience} className="min-h-11">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Post announcement
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** Announcements for whoever is signed in, with the compose form for people who can post. */
export function AnnouncementsBoard() {
  const board = useHomeworkData<Board>('/api/announcements');
  const data = board.data;

  if (board.loading && !data) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" /></div>;
  }
  if (/not in a school/i.test(board.error)) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Announcements come from a school. Your account isn’t part of one yet.
        </CardContent>
      </Card>
    );
  }
  if (board.error || !data) {
    return (
      <div className="space-y-3 py-12 text-center">
        <p role="alert" className="text-muted-foreground">{board.error || 'Could not load announcements.'}</p>
        <Button variant="outline" onClick={() => void board.refresh()}>Try again</Button>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <section aria-label="Announcements" className="min-w-0 space-y-3 lg:order-1">
        {data.announcements.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <Megaphone className="h-8 w-8 text-muted-foreground" aria-hidden />
              <p className="font-medium">No announcements yet</p>
              <p className="text-sm text-muted-foreground">
                {data.canPost ? 'Post one to tell people about events, changes and reminders.' : 'News from your school and teachers will show up here.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          data.announcements.map((a) => (
            <Card key={a.id}>
              <CardHeader className="pb-2">
                <CardTitle className="break-words text-lg">{a.title}</CardTitle>
                <CardDescription>
                  {[a.authorName, timeAgo(a.createdAt), data.canPost ? `To ${audienceLabel(a, gradeLevelLabel)} (${a.recipientCount})` : null].filter(Boolean).join(' · ')}
                </CardDescription>
              </CardHeader>
              <CardContent><p className="whitespace-pre-wrap break-words text-sm">{a.body}</p></CardContent>
            </Card>
          ))
        )}
      </section>
      {data.canPost && (
        <div className="min-w-0 lg:order-2">
          <Compose board={data} onPosted={() => void board.refresh()} />
        </div>
      )}
    </div>
  );
}
