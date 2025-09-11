'use client'

import { useContext, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { SupabaseBrowserClientContext, SupabaseSessionContext } from '@/components/providers/SupabaseAuthProvider'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, LogOut, Sun, Moon, Coins, Plus, Play } from 'lucide-react'
import Link from 'next/link'
import axios from 'axios'

export default function SessionLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = useContext(SupabaseBrowserClientContext)
  const session = useContext(SupabaseSessionContext)
  const [collapsed, setCollapsed] = useState(true)
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  const [credits, setCredits] = useState<number>(0)
  const [loadingCredits, setLoadingCredits] = useState(true)

  useEffect(() => {
    const saved = typeof window !== 'undefined' && localStorage.getItem('theme')
    const initial = (saved === 'light' || saved === 'dark') ? (saved as 'light' | 'dark') : 'dark'
    setTheme(initial)
    document.documentElement.classList.toggle('dark', initial === 'dark')
  }, [])

  // Fetch credits on mount and set up refresh interval
  useEffect(() => {
    const fetchCredits = async () => {
      try {
        const response = await axios.get('/api/credits/status')
        setCredits(response.data.credits)
      } catch (error) {
        console.error('Failed to fetch credits:', error)
      } finally {
        setLoadingCredits(false)
      }
    }

    if (session?.user) {
      fetchCredits()
      
      // Refresh credits every 30 seconds
      const interval = setInterval(fetchCredits, 30000)
      return () => clearInterval(interval)
    }
  }, [session?.user])

  // Listen for credit updates from other components
  useEffect(() => {
    const handleCreditUpdate = (event: CustomEvent) => {
      setCredits(event.detail.credits)
    }

    window.addEventListener('creditUpdate', handleCreditUpdate as EventListener)
    return () => window.removeEventListener('creditUpdate', handleCreditUpdate as EventListener)
  }, [])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('theme', next)
    setTheme(next)
    document.documentElement.classList.toggle('dark', next === 'dark')
  }

  const avatarUrl = session?.user?.user_metadata?.avatar_url || session?.user?.user_metadata?.picture || '/next.svg'
  const displayName = session?.user?.user_metadata?.name || session?.user?.email || 'User'

  return (
    <div className="flex h-screen">
      <aside className={`border-r backdrop-blur-sm bg-card/95 transition-all duration-200 ${collapsed ? 'w-16' : 'w-64'} flex flex-col shadow-xl z-10`}>
        <div className="p-4 flex items-center gap-3">
          <img src={avatarUrl} alt="avatar" referrerPolicy="no-referrer" crossOrigin="anonymous" onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/next.svg' }} className="w-8 h-8 rounded-full object-cover" />
          {!collapsed && (
            <span className="text-sm font-medium truncate max-w-[8rem]">{displayName}</span>
          )}
        </div>
        
        {/* Credits Display */}
        <div className="px-4 pb-2">
          {collapsed ? (
            <Link href="/session/credits">
              <div className="flex items-center justify-center p-2 rounded-md hover:bg-muted/50 transition-colors">
                <Coins className="w-5 h-5 text-yellow-500" />
              </div>
            </Link>
          ) : (
            <Link href="/session/credits" className="block">
              <div className="flex items-center justify-between p-3 rounded-md hover:bg-muted/50 transition-colors border">
                <div className="flex items-center gap-2">
                  <Coins className="w-4 h-4 text-yellow-500" />
                  <span className="text-sm font-medium">
                    {loadingCredits ? '...' : credits}
                  </span>
                </div>
                {credits < 10 && (
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                )}
              </div>
            </Link>
          )}
          {!collapsed && (
            <div className="mt-2">
              <Link href="/session/credits">
                <Button size="sm" variant="outline" className="w-full">
                  <Plus className="w-3 h-3 mr-1" />
                  Buy Credits
                </Button>
              </Link>
            </div>
          )}
        </div>
        
        {/* Divider */}
        <div className="px-4 py-3">
          <div className="border-t border-gray-200 dark:border-gray-700"></div>
        </div>
        
        {/* New Session Button */}
        <div className="px-4 pb-4">
          {collapsed ? (
            <Button
              size="icon"
              variant="outline"
              className="w-full"
              onClick={() => router.push('/session')}
              title="Start New Session"
            >
              <Play className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => router.push('/session')}
            >
              <Play className="w-4 h-4 mr-2" />
              Start New Session
            </Button>
          )}
        </div>
        
        <div className="mt-auto">
          <div className="p-4 flex items-center justify-center">
            <button
              className="rounded-md border p-1 text-sm flex items-center justify-center"
              onClick={() => setCollapsed(v => !v)}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? (
                <ChevronRight className="h-5 w-5" />
              ) : (
                <ChevronLeft className="h-5 w-5" />
              )}
            </button>
          </div>
          <div className="p-4">
            {collapsed ? (
              <Button
                variant="ghost"
                size="icon"
                className="w-full"
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {theme === 'dark' ? (
                  <Sun className="h-5 w-5" />
                ) : (
                  <Moon className="h-5 w-5" />
                )}
              </Button>
            ) : (
              <Button
                variant="ghost"
                className="w-full justify-center"
                onClick={toggleTheme}
              >
                {theme === 'dark' ? (
                  <Sun className="h-5 w-5 mr-2" />
                ) : (
                  <Moon className="h-5 w-5 mr-2" />
                )}
                {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              </Button>
            )}
          </div>
          <div className="p-4">
            {collapsed ? (
              <Button
                variant="ghost"
                size="icon"
                className="w-full text-red-500 hover:bg-red-500 hover:text-white"
                onClick={async () => {
                  await supabase?.auth.signOut()
                  const back = pathname ? `?redirectedFrom=${encodeURIComponent(pathname)}` : ''
                  router.replace(`/login${back}`)
                }}
              >
                <LogOut className="h-5 w-5" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                className="w-full justify-center text-red-500 hover:bg-red-500 hover:text-white"
                onClick={async () => {
                  await supabase?.auth.signOut()
                  const back = pathname ? `?redirectedFrom=${encodeURIComponent(pathname)}` : ''
                  router.replace(`/login${back}`)
                }}
              >
                <LogOut className="h-5 w-5 mr-2" />
                Logout
              </Button>
            )}
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}


