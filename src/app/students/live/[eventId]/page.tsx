'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

const LiveClassInteractiveTutor = dynamic(
  () =>
    import('@/components/learn/LiveClassInteractiveTutor').then((m) => ({
      default: m.LiveClassInteractiveTutor,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex justify-center py-16 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
      </div>
    ),
  }
)

export default function StudentLiveClassRoomPage() {
  const params = useParams()
  const eventId = typeof params.eventId === 'string' ? params.eventId : ''

  if (!eventId) {
    return null
  }

  return (
    <DashboardLayout>
      <div className="border-b px-4 py-2 flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/students/live">← Back</Link>
        </Button>
      </div>
      <LiveClassInteractiveTutor liveClassEventId={eventId} />
    </DashboardLayout>
  )
}
