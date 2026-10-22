'use client'

import { useEffect } from 'react'

/**
 * Applies the portal's saved light/dark choice on pages that render without
 * the sidebar (which normally applies it), such as the live class room.
 */
export function useSavedTheme() {
  useEffect(() => {
    let saved: string | null = null
    try {
      saved = localStorage.getItem('theme')
    } catch {
      // Storage can be blocked; fall back to the portal default.
    }
    document.documentElement.classList.toggle('dark', saved !== 'light')
  }, [])
}
