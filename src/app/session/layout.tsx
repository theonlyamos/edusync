'use client'

import { useContext, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { SupabaseBrowserClientContext, SupabaseSessionContext } from '@/components/providers/SupabaseAuthProvider'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, LogOut, Sun, Moon, Coins, Plus, Play, MessageSquarePlus, Search, Library } from 'lucide-react'
import Link from 'next/link'
import axios from 'axios'

type SessionHistoryItem = {
  id: string;
  created_at: string;
  topic: string | null;
};


export default function SessionLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = useContext(SupabaseBrowserClientContext)
  const session = useContext(SupabaseSessionContext)
  const [collapsed, setCollapsed] = useState(true)
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  const [credits, setCredits] = useState<number>(0)
  const [loadingCredits, setLoadingCredits] = useState(true)
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryItem[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  useEffect(() => {
    const saved = typeof window !== 'undefined' && localStorage.getItem('theme')
    const initial = (saved === 'light' || saved === 'dark') ? (saved as 'light' | 'dark') : 'dark'
    setTheme(initial)
    document.documentElement.classList.toggle('dark', initial === 'dark')
  }, [])

  // Fetch credits and session history on mount
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

    const fetchHistory = async () => {
      try {
        const response = await axios.get('/api/sessions')
        setSessionHistory(response.data)
      } catch (error) {
        console.error('Failed to fetch session history:', error)
      } finally {
        setLoadingHistory(false)
      }
    }

    if (session?.user) {
      fetchCredits()
      fetchHistory()
      
      const creditInterval = setInterval(fetchCredits, 30000)
      return () => clearInterval(creditInterval)
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

  const handleSidebarClick = (e: React.MouseEvent<HTMLElement>) => {
    if (collapsed) {
      // Prevent expanding when clicking on an interactive element
      if ((e.target as HTMLElement).closest('button, a')) {
        return;
      }
      setCollapsed(false);
    }
  };

  const avatarUrl = session?.user?.user_metadata?.avatar_url || session?.user?.user_metadata?.picture || '/next.svg'
  const displayName = session?.user?.user_metadata?.name || session?.user?.email || 'User'

  return (
    <div className="flex h-screen bg-background">
      <aside 
        className={`border-r bg-card transition-all duration-300 ${collapsed ? 'w-20 hover:cursor-pointer' : 'w-64'} flex flex-col shadow-lg z-20`}
        onClick={handleSidebarClick}
      >
        {/* Header */}
        <div className="p-4">
          {collapsed ? (
            <Button
              size="icon"
              variant="outline"
              className="w-full"
              onClick={(e) => {
                e.stopPropagation();
                router.push('/session');
              }}
              title="New Chat"
            >
              <MessageSquarePlus className="w-5 h-5" />
            </Button>
          ) : (
            <div className="flex items-center justify-between">
               <Button
                variant="outline"
                className="justify-start flex-grow"
                onClick={() => router.push('/session')}
              >
                <MessageSquarePlus className="w-4 h-4 mr-2" />
                New Session
              </Button>
              <button
                className="rounded-md border p-1 text-sm flex items-center justify-center hover:bg-muted ml-2"
                onClick={(e) => {
                  e.stopPropagation();
                  setCollapsed(true);
                }}
                aria-label="Collapse sidebar"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>

        <div className="p-4 flex-grow">
          {/* Credits Display */}
          <div className="pb-4">
            {collapsed ? (
                <Link href="/session/credits" className="flex items-center justify-center p-2 rounded-md hover:bg-muted/50 transition-colors">
                  <Coins className="w-5 h-5 text-yellow-500" />
                  <span className="text-sm font-medium ml-2">{loadingCredits ? '...' : credits}</span>
                </Link>
            ) : (
              <Link href="/session/credits" className="block">
                <div className="flex items-center justify-between p-3 rounded-md hover:bg-muted/50 transition-colors border">
                  <div className="flex items-center gap-2">
                    <Coins className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm font-medium">
                      {loadingCredits ? '...' : `${credits} Credits`}
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
          <div className="my-4">
            <div className="border-t border-border"></div>
          </div>

          {/* Session History */}
          {!collapsed && <h2 className="text-xs font-semibold text-muted-foreground px-2 mb-2">Sessions</h2>}
          <div className="space-y-1 overflow-y-auto">
            {loadingHistory ? (
              [...Array(5)].map((_, i) => (
                <div key={i} className={`h-8 rounded-md ${collapsed ? 'w-10 mx-auto' : 'w-full'} bg-muted animate-pulse`} />
              ))
            ) : (
              sessionHistory.map(s => (
                <Link key={s.id} href={`/session/${s.id}`} title={s.topic || 'Chat'}
                  className={`block text-sm truncate rounded-md py-2 transition-colors ${collapsed ? 'px-2' : 'px-3'} ${pathname === `/session/${s.id}` ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                >
                  {collapsed ? '...' : (s.topic || 'New Session')}
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Footer Section */}
        <div className="p-4 border-t border-border">

          {/* Theme Toggle */}
          <div className="pb-4">
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

          {/* User Info & Logout */}
          <div className={`flex items-center gap-3 ${collapsed ? 'flex-col' : 'justify-between'}`}>
            <div className="flex items-center gap-3">
              <img src={avatarUrl} alt="avatar" referrerPolicy="no-referrer" crossOrigin="anonymous" onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/next.svg' }} className="w-8 h-8 rounded-full object-cover" />
              {!collapsed && (
                <span className="text-sm font-medium truncate max-w-[8rem]">{displayName}</span>
              )}
            </div>
            <Button
              variant="ghost"
              size={collapsed ? "icon" : "default"}
              className={`text-red-500 hover:bg-red-500 hover:text-white ${collapsed ? 'w-full' : ''}`}
              onClick={async () => {
                await supabase?.auth.signOut()
                const back = pathname ? `?redirectedFrom=${encodeURIComponent(pathname)}` : ''
                router.replace(`/login${back}`)
              }}
              title="Logout"
            >
              <LogOut className="h-5 w-5" />
              {!collapsed && <span className="ml-2">Logout</span>}
            </Button>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}


