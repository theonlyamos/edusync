'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { BarChart3, Check, Loader2, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { homeworkRequest } from '@/components/homework/shared'
import {
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  POLL_OPTION_MAX,
  POLL_QUESTION_MAX,
  mergePollBroadcast,
  mergePollRefresh,
  parsePollInput,
  votePercent,
  type PollBroadcast,
  type PollView,
} from '@/lib/live-class-polls'
import { cn } from '@/lib/utils'

/** While the teacher has a poll open, their totals refresh this often. */
const HOST_REFRESH_MS = 5000
/** Everyone else hears about polls from the room; this slow check only covers a missed message. */
const FALLBACK_REFRESH_MS = 75000

type Busy = 'start' | 'end' | 'vote' | null

/**
 * The class's current poll for one person in the room. The room tells
 * everyone when a poll opens or ends (`receive`); a slow background check
 * covers anyone who missed that.
 */
export function useLiveClassPoll(eventId: string, isHost: boolean, active: boolean) {
  const [poll, setPoll] = useState<PollView | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [problem, setProblem] = useState('')
  const base = `/api/live-classes/${eventId}/polls`
  const hostWatching = isHost && poll?.status === 'open'

  const refresh = useCallback(async () => {
    try {
      const data = await homeworkRequest<{ poll: PollView | null }>(base)
      // A check that was already on its way must not undo newer news from the room.
      setPoll((current) => mergePollRefresh(current, data.poll))
    } catch {
      // A missed check is harmless; the next one, or the room, catches up.
    }
  }, [base])

  useEffect(() => {
    if (!active) return
    void refresh()
    // Spread the slow checks out so a whole class doesn't ask at the same second.
    const every = hostWatching ? HOST_REFRESH_MS : FALLBACK_REFRESH_MS + Math.round(Math.random() * 20000)
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, every)
    return () => clearInterval(timer)
  }, [active, hostWatching, refresh])

  const receive = useCallback((incoming: PollBroadcast) => {
    setPoll((current) => mergePollBroadcast(current, incoming))
  }, [])

  const run = async (kind: Exclude<Busy, null>, work: () => Promise<void>) => {
    setBusy(kind)
    setProblem('')
    try {
      await work()
      return true
    } catch (error) {
      setProblem((error as Error).message || 'Something went wrong. Please try again.')
      return false
    } finally {
      setBusy(null)
    }
  }
  const start = (question: string, options: string[]) => run('start', async () => {
    setPoll((await homeworkRequest<{ poll: PollView }>(base, { method: 'POST', body: JSON.stringify({ question, options }) })).poll)
  })
  const end = () => run('end', async () => {
    if (!poll) return
    setPoll((await homeworkRequest<{ poll: PollView | null }>(`${base}/${poll.id}/close`, { method: 'POST' })).poll)
  })
  const vote = (option: number) => run('vote', async () => {
    if (!poll) return
    try {
      await homeworkRequest(`${base}/${poll.id}/vote`, { method: 'POST', body: JSON.stringify({ option }) })
      setPoll((current) => (current && current.id === poll.id ? { ...current, myVote: option } : current))
    } catch (error) {
      void refresh()
      throw error
    }
  })

  return { poll, busy, problem, receive, start, end, vote, clearProblem: () => setProblem('') }
}

type PollControls = ReturnType<typeof useLiveClassPoll>

/** One bar per answer, with the count and share written out. */
function Results({ poll }: { poll: PollView }) {
  const counts = poll.counts ?? poll.options.map(() => 0)
  const top = Math.max(...counts)
  return (
    <ul className="space-y-2.5">
      {poll.options.map((option, index) => {
        const percent = votePercent(counts[index], poll.totalVotes)
        return (
          <li key={index} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 break-words">
                {option}
                {poll.myVote === index && <span className="ml-1.5 text-xs text-muted-foreground">(your answer)</span>}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{counts[index]} · {percent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className={cn('h-full rounded-full transition-[width]', counts[index] > 0 && counts[index] === top ? 'bg-primary' : 'bg-primary/50')} style={{ width: `${percent}%` }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function PollForm({ controls }: { controls: PollControls }) {
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [problem, setProblem] = useState('')
  const submit = async () => {
    const parsed = parsePollInput({ question, options })
    if (!parsed.ok) return setProblem(parsed.error)
    setProblem('')
    await controls.start(parsed.poll.question, parsed.poll.options)
  }
  const shown = problem || controls.problem
  return (
    <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <div className="space-y-1.5">
        <Label htmlFor="poll-question">Question</Label>
        <Input id="poll-question" value={question} maxLength={POLL_QUESTION_MAX} placeholder="Which fraction is larger?" onChange={(event) => setQuestion(event.target.value)} />
      </div>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Answers</legend>
        {options.map((option, index) => (
          <div key={index} className="flex items-center gap-1.5">
            <Input
              aria-label={`Answer ${index + 1}`}
              value={option}
              maxLength={POLL_OPTION_MAX}
              placeholder={`Answer ${index + 1}`}
              onChange={(event) => setOptions(options.map((current, at) => (at === index ? event.target.value : current)))}
            />
            {options.length > POLL_MIN_OPTIONS && (
              <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0" aria-label={`Remove answer ${index + 1}`} onClick={() => setOptions(options.filter((_, at) => at !== index))}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
        {options.length < POLL_MAX_OPTIONS && (
          <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => setOptions([...options, ''])}>
            <Plus className="h-4 w-4" /> Add an answer
          </Button>
        )}
      </fieldset>
      {shown && <p role="alert" className="text-sm text-destructive">{shown}</p>}
      <Button type="submit" className="min-h-11 w-full" disabled={controls.busy !== null}>
        {controls.busy === 'start' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Ask the class
      </Button>
    </form>
  )
}

function HostPoll({ controls }: { controls: PollControls }) {
  const { poll } = controls
  const [composing, setComposing] = useState(false)
  // Once a new poll is running, the form has done its job.
  const lastId = useRef(poll?.id)
  useEffect(() => {
    if (poll?.id !== lastId.current) {
      lastId.current = poll?.id
      setComposing(false)
    }
  }, [poll?.id])

  if (!poll || composing) return <PollForm controls={controls} />
  const answered = `${poll.totalVotes} ${poll.totalVotes === 1 ? 'answer' : 'answers'}`
  return (
    <div className="space-y-3">
      <p className="break-words font-medium">{poll.question}</p>
      <Results poll={poll} />
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {poll.status === 'open' ? `${answered} so far. Students see the results when you end the poll.` : `Poll ended with ${answered}. The class can see these results.`}
      </p>
      {controls.problem && <p role="alert" className="text-sm text-destructive">{controls.problem}</p>}
      {poll.status === 'open' ? (
        <Button className="min-h-11 w-full" disabled={controls.busy !== null} onClick={() => void controls.end()}>
          {controls.busy === 'end' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} End poll and show results
        </Button>
      ) : (
        <Button variant="outline" className="min-h-11 w-full" onClick={() => { controls.clearProblem(); setComposing(true) }}>
          Ask another question
        </Button>
      )}
    </div>
  )
}

function StudentPoll({ controls }: { controls: PollControls }) {
  const { poll } = controls
  if (!poll) return <p className="text-sm text-muted-foreground">Your teacher hasn’t asked a poll yet.</p>
  if (poll.status === 'closed') {
    return (
      <div className="space-y-3">
        <p className="break-words font-medium">{poll.question}</p>
        <Results poll={poll} />
        <p className="text-xs text-muted-foreground">{poll.totalVotes} {poll.totalVotes === 1 ? 'answer' : 'answers'}. This poll has ended.</p>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <p className="break-words font-medium" id="poll-question-text">{poll.question}</p>
      <div role="radiogroup" aria-labelledby="poll-question-text" className="space-y-1.5">
        {poll.options.map((option, index) => {
          const picked = poll.myVote === index
          return (
            <button
              key={index}
              type="button"
              role="radio"
              aria-checked={picked}
              disabled={controls.busy !== null}
              onClick={() => { if (!picked) void controls.vote(index) }}
              className={cn(
                'flex min-h-11 w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70',
                picked ? 'border-primary bg-primary/10 font-medium' : 'border-input bg-background hover:bg-accent',
              )}
            >
              <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', picked ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/50')}>
                {picked && <Check className="h-3 w-3" />}
              </span>
              <span className="min-w-0 break-words">{option}</span>
            </button>
          )
        })}
      </div>
      {controls.problem && <p role="alert" className="text-sm text-destructive">{controls.problem}</p>}
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {poll.myVote === null ? 'Pick one answer.' : 'Answer sent. You can change it until your teacher ends the poll.'}
      </p>
    </div>
  )
}

/** The poll card that sits over the board in a live class. */
export function LiveClassPollCard({ isHost, controls, onClose }: { isHost: boolean; controls: PollControls; onClose: () => void }) {
  return (
    <section
      aria-label="Poll"
      className="absolute bottom-3 right-3 z-20 flex max-h-[calc(100%-1.5rem)] w-[min(24rem,calc(100%-1.5rem))] flex-col rounded-lg border bg-card shadow-lg"
    >
      <header className="flex items-center justify-between gap-2 border-b px-4 py-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><BarChart3 className="h-4 w-4" aria-hidden /> Poll</h2>
        <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Hide poll" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </header>
      <div className="min-h-0 overflow-y-auto p-4">
        {isHost ? <HostPoll controls={controls} /> : <StudentPoll controls={controls} />}
      </div>
    </section>
  )
}
