'use client'

import { useEffect } from 'react'
import { applyThemePreference, readThemePreference } from '@/lib/theme'

/**
 * Applies the portal's saved light/dark/system choice on pages that render
 * without the sidebar (which normally applies it), such as the live class room.
 */
export function useSavedTheme() {
  useEffect(() => {
    const preference = readThemePreference()
    applyThemePreference(preference)
    if (preference !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyThemePreference('system')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
}
