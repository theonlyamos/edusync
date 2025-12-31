'use client'

import { useContext, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { SupabaseBrowserClientContext, SupabaseSessionContext } from '@/components/providers/SupabaseAuthProvider'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, LogOut, Sun, Moon, Coins, Plus, Play, SquarePen, Library, Menu, X, Building2 } from 'lucide-react'
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobileMenuAnimating, setMobileMenuAnimating] = useState(false)
  const [orgUrl, setOrgUrl] = useState<string>('/learn/org')

  const fetchOrganizations = async () => {
    try {
      const response = await axios.get('/api/organizations');
      const orgs = response.data.organizations || [];
      if (orgs.length === 1) {
        setOrgUrl(`/learn/org/${orgs[0].id}`);
      }
    } catch (error) {
      console.error('Failed to fetch organizations:', error);
    }
  };

  useEffect(() => {
    fetchOrganizations();
  }, []);

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
        const response = await axios.get('/api/sessions?limit=8')
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

  const handleNewSession = () => {
    if (pathname === '/learn') {
      // If already on session page, dispatch event to reset session state
      window.dispatchEvent(new CustomEvent('resetSession'));
    } else {
      // Navigate to session page
      router.push('/learn');
    }
  };

  const openMobileMenu = () => {
    setMobileMenuOpen(true);
    // Use requestAnimationFrame to ensure DOM is rendered before animation starts
    requestAnimationFrame(() => {
      setMobileMenuAnimating(true);
    });
  };

  const closeMobileMenu = () => {
    setMobileMenuAnimating(false);
    setTimeout(() => {
      setMobileMenuOpen(false);
    }, 300); // Match the animation duration
  };

  const avatarUrl = session?.user?.user_metadata?.avatar_url || session?.user?.user_metadata?.picture
  const displayName = session?.user?.user_metadata?.name || session?.user?.email || 'User'

  const getInitials = (name: string) => {
    const names = name.split(' ').filter(n => n.length > 0)
    if (names.length === 0) return 'U'
    if (names.length === 1) return names[0].charAt(0).toUpperCase()
    return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase()
  }

  const userInitials = getInitials(displayName)

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex border-r bg-card transition-all duration-300 relative ${collapsed ? 'hover:cursor-pointer' : ''} flex-col shadow-none z-20`}
        onClick={handleSidebarClick}
      >
        {/* Header */}
        <div className="p-4 border-b border-border">
          {collapsed ? (
            <Button
              size="icon"
              variant="ghost"
              className="w-full hover:bg-transparent group"
              onClick={(e) => {
                e.stopPropagation();
                handleNewSession();
              }}
              title="New Session"
            >
              <SquarePen className="w-5 h-5 transition-transform text-muted-foreground group-hover:text-primary" />
            </Button>
          ) : (
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                className="justify-start flex-grow hover:bg-transparent group"
                onClick={handleNewSession}
              >
                <SquarePen className="w-5 h-5 mr-2 transition-transform text-muted-foreground group-hover:text-primary" />
                New Session
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-md p-1 text-sm flex items-center justify-center hover:bg-muted ml-2"
                onClick={(e) => {
                  e.stopPropagation();
                  setCollapsed(true);
                }}
                aria-label="Collapse sidebar"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
            </div>
          )}

        </div>

        <div className={`flex flex-col gap-2 py-4 border-b border-border ${collapsed ? 'items-center' : ''}`}>
          <Link href="/learn/credits" className="flex items-center justify-start py-2 px-7 rounded-md hover:bg-muted/50 transition-colors">
            <Coins className="w-5 h-5 text-yellow-500" />
            <span className="text-sm font-medium ml-2">{loadingCredits ? '...' : credits} {collapsed ? '' : ' Credits'}</span>
          </Link>
          <Link href={orgUrl} className="flex items-center justify-start py-2 px-7 rounded-md hover:bg-muted/50 transition-colors">
            <Building2 className="w-5 h-5 mr-2" />
            {collapsed ? '' : 'Organization'}
          </Link>
        </div>

        <div className={`${collapsed ? 'hidden' : ''} p-4`}>
          <h2 className="text-xs font-semibold text-muted-foreground px-2 mb-2">Sessions</h2>
          <div className="space-y-1 overflow-y-auto">
            {loadingHistory ? (
              [...Array(5)].map((_, i) => (
                <div key={i} className="h-8 rounded-md w-full bg-muted animate-pulse" />
              ))
            ) : (
              sessionHistory.length === 0 ? (
                <div className="text-xs text-muted-foreground px-2 py-1">No sessions</div>
              ) : (
                sessionHistory.map(s => (
                  <Link key={s.id} href={`/learn/${s.id}`} title={s.topic || 'Chat'}
                    className={`block text-sm truncate rounded-md py-2 px-3 transition-colors ${pathname === `/learn/${s.id}` ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                  >
                    {s.topic || 'New Session'}
                  </Link>
                ))
              )
            )}
          </div>
        </div>

        {/* Footer Section */}
        <div className="p-4 flex flex-col gap-3 border-t border-border absolute bottom-0 left-0 right-0">
          <div className={`flex gap-3 ${collapsed ? 'flex-col' : ''}`}>
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
              {collapsed ? '' : theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </Button>
            <Button
              variant="ghost"
              size={collapsed ? "icon" : "default"}
              className={`text-red-500 hover:bg-red-500 hover:text-white ${collapsed ? 'w-full' : ''}`}
              onClick={async () => {
                await supabase?.auth.signOut()
                router.replace(`/login`)
              }}
              title="Logout"
            >
              <LogOut className="h-5 w-5" />
              {!collapsed && <span className="ml-2">Logout</span>}
            </Button>
          </div>

          {/* User Info & Logout */}
          <div className={`flex items-center gap-3 ${collapsed ? 'flex-col' : 'justify-between'}`}>
            <div className="flex items-center gap-3">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="avatar"
                  referrerPolicy="no-referrer"
                  crossOrigin="anonymous"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; (e.currentTarget as HTMLImageElement).nextElementSibling?.classList.remove('hidden') }}
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : null}
              <div className={`${avatarUrl ? 'hidden' : ''} w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-semibold text-sm`}>
                {userInitials}
              </div>
              {!collapsed && (
                <span className="text-sm font-medium truncate max-w-[8rem]">{displayName}</span>
              )}
            </div>

          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-background border-b border-border">
        <div className="flex items-center justify-between p-4">
          <Button
            variant="outline"
            size="icon"
            onClick={openMobileMenu}
            className="mr-3"
          >
            <Menu className="w-5 h-5" />
          </Button>

          <div className="flex items-center gap-3 flex-1">
            <Link href="/learn/credits" className="flex items-center gap-2 text-sm">
              <Coins className="w-4 h-4 text-yellow-500" />
              <span className="font-medium">{loadingCredits ? '...' : credits}</span>
            </Link>

            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="ml-auto"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div
          className={`lg:hidden fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ease-in-out ${mobileMenuAnimating ? 'opacity-100' : 'opacity-0'
            }`}
          onClick={closeMobileMenu}
        >
          <div
            className={`fixed left-0 top-0 h-full w-80 bg-card border-r shadow-xl transform transition-transform duration-300 ease-in-out ${mobileMenuAnimating ? 'translate-x-0' : '-translate-x-full'
              }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="avatar"
                      referrerPolicy="no-referrer"
                      crossOrigin="anonymous"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; (e.currentTarget as HTMLImageElement).nextElementSibling?.classList.remove('hidden') }}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : null}
                  <div className={`${avatarUrl ? 'hidden' : ''} w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-semibold text-sm`}>
                    {userInitials}
                  </div>
                  <span className="text-lg font-semibold">{displayName}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={closeMobileMenu}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>

            <div className="p-4 flex-grow overflow-y-auto">
              {/* New Session Button */}
              <div className="mb-4">
                <Button
                  variant="ghost"
                  className="w-full justify-start group"
                  onClick={() => {
                    handleNewSession();
                    closeMobileMenu();
                  }}
                >
                  <SquarePen className="w-4 h-4 mr-2 transition-transform text-muted-foreground group-hover:text-primary" />
                  New Session
                </Button>
              </div>



              {/* Credits Section */}
              <div className="mb-6">
                <Link href="/learn/credits" className="block mb-2" onClick={closeMobileMenu}>
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
                <Link href="/learn/credits" onClick={closeMobileMenu}>
                  <Button size="sm" variant="outline" className="w-full">
                    <Plus className="w-3 h-3 mr-1" />
                    Buy Credits
                  </Button>
                </Link>
              </div>

              {/* Organization Link */}
              <div className="mb-6">
                <Link href={orgUrl} onClick={closeMobileMenu}>
                  <Button variant="outline" size="sm" className="w-full justify-start">
                    <Building2 className="w-4 h-4 mr-2" />
                    Organization
                  </Button>
                </Link>
              </div>

              {/* Session History */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-muted-foreground mb-2">Sessions</h3>
                <div className="space-y-1">
                  {loadingHistory ? (
                    [...Array(5)].map((_, i) => (
                      <div key={i} className="h-8 rounded-md bg-muted animate-pulse" />
                    ))
                  ) : (
                    (sessionHistory.length === 0 ? (
                      <div className="text-xs text-muted-foreground px-1 py-1">No sessions</div>
                    ) : (
                      sessionHistory.map(s => (
                        <Link
                          key={s.id}
                          href={`/learn/${s.id}`}
                          title={s.topic || 'Chat'}
                          className={`block text-sm truncate rounded-md py-2 px-3 transition-colors ${pathname === `/learn/${s.id}` ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                          onClick={closeMobileMenu}
                        >
                          {s.topic || 'New Session'}
                        </Link>
                      ))
                    ))
                  )}
                </div>
              </div>

              {/* Logout Button */}
              <div className="border-t border-border pt-4">
                <Button
                  variant="ghost"
                  className="w-full justify-start text-red-500 hover:bg-red-500 hover:text-white"
                  onClick={async () => {
                    await supabase?.auth.signOut()
                    const back = pathname ? `?redirectedFrom=${encodeURIComponent(pathname)}` : ''
                    router.replace(`/login${back}`)
                  }}
                >
                  <LogOut className="h-5 w-5 mr-2" />
                  Logout
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto lg:ml-0 pt-16 lg:pt-0">
        {children}
      </main>
    </div>
  )
}


