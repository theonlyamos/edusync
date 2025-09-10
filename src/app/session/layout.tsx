'use client'

import { useContext, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { SupabaseBrowserClientContext, SupabaseSessionContext } from '@/components/providers/SupabaseAuthProvider'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, LogOut } from 'lucide-react'

export default function SessionLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = useContext(SupabaseBrowserClientContext)
  const session = useContext(SupabaseSessionContext)
  const [collapsed, setCollapsed] = useState(true)

  const avatarUrl = session?.user?.user_metadata?.avatar_url || session?.user?.user_metadata?.picture || '/next.svg'
  const displayName = session?.user?.user_metadata?.name || session?.user?.email || 'User'

  return (
    <div className="flex h-screen bg-background">
      <aside className={`border-r bg-card transition-all duration-200 ${collapsed ? 'w-16' : 'w-64'} flex flex-col`}>
        <div className="p-4 flex items-center gap-3">
          <img src={avatarUrl} alt="avatar" className="w-8 h-8 rounded-full object-cover" />
          {!collapsed && (
            <span className="text-sm font-medium truncate max-w-[8rem]">{displayName}</span>
          )}
        </div>
        <div className="mt-auto">
          <div className="p-4">
            <button
              className="rounded-md border p-1 text-sm w-full flex items-center justify-center"
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


