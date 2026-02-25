import { Link, useRouterState } from '@tanstack/react-router'
import { BookUser, Mic, SendHorizonal, Settings2 } from 'lucide-react'
import type React from 'react'
import { cn } from '@/lib/utils'

interface NavTabProps {
  to: string
  icon: React.ReactNode
  label: string
  active: boolean
}

function NavTab({ to, icon, label, active }: NavTabProps) {
  return (
    <Link
      to={to}
      className={cn(
        'flex flex-col items-center justify-center gap-1 px-4 py-2 rounded-xl transition-colors',
        active
          ? 'text-primary'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent',
      )}
    >
      <span className="flex items-center justify-center">{icon}</span>
      <span className="text-[10px] font-medium leading-none">{label}</span>
    </Link>
  )
}

export default function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60"
      aria-label="Main navigation"
    >
      <div className="max-w-lg mx-auto flex h-16 items-center">
        {/* Contacts — left */}
        <div className="flex flex-1 justify-start pl-4">
          <NavTab
            to="/contacts"
            icon={<BookUser className="size-5" />}
            label="Contacts"
            active={pathname === '/contacts'}
          />
        </div>

        {/* Send — center (space reserved for floating FAB above) */}
        <div className="flex flex-col items-center justify-end w-20 pb-1">
        <NavTab
            to="/"
            icon={<Mic className="size-5" />}
            label="Send"
            active={pathname === '/'}
          />
        </div>


        {/* Settings — right */}
        <div className="flex flex-1 justify-end pr-4">
          <NavTab
            to="/settings"
            icon={<Settings2 className="size-5" />}
            label="Settings"
            active={pathname === '/settings'}
          />
        </div>
      </div>
    </nav>
  )
}
