import { useEffect, useState } from 'react'

const DEFAULT_MS = 30_000

/**
 * Periodically bumps state so join-window checks stay accurate without polling every second.
 * Also refreshes when the tab becomes visible again.
 */
export function useLiveClassJoinTick(intervalMs: number = DEFAULT_MS): number {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') setTick((n) => n + 1)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  return tick
}
