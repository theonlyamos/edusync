'use client'

import { useContext, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useParams, useRouter } from 'next/navigation'
import { SupabaseSessionContext } from '@/components/providers/SupabaseAuthProvider'
import { Loader2 } from 'lucide-react'

const LiveClassInteractiveTutor = dynamic(
  () =>
    import('@/components/learn/LiveClassInteractiveTutor').then((m) => ({
      default: m.LiveClassInteractiveTutor,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
      </div>
    ),
  }
)

export default function TeacherLiveClassRoomPage() {
  const params = useParams()
  const router = useRouter()
  const session = useContext(SupabaseSessionContext)
  const eventId = typeof params.eventId === 'string' ? params.eventId : ''

  useEffect(() => {
    if (session === null) {
      router.push(`/login?redirectedFrom=${encodeURIComponent(`/teachers/live/${eventId}`)}`)
    }
  }, [session, router, eventId])

  if (!session?.user || !eventId) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
      </div>
    )
  }

  return (
    <LiveClassInteractiveTutor
      liveClassEventId={eventId}
      backHref="/teachers/live"
      currentUserId={session.user.id}
    />
  )
}
