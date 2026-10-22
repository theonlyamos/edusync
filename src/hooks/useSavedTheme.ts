'use client'

import { useEffect } from 'react'
import { applyThemePreference, readThemePreference, watchSystemTheme } from '@/lib/theme'

/**
 * Applies the portal's saved light/dark/system choice on pages that render
 * without the sidebar (which normally applies it), such as the live class room.
 */
export function useSavedTheme() {
  useEffect(() => {
    applyThemePreference(readThemePreference())
    return watchSystemTheme()
  }, [])
}
