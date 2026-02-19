import * as React from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

const DISMISS_KEY = 'pesamirror_pwa_hint_dismissed'

function usePWAHint(): boolean {
  const [show, setShow] = React.useState(false)

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      if (localStorage.getItem(DISMISS_KEY)) return
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as { standalone?: boolean }).standalone === true
      if (standalone) return
      const mobile =
        window.matchMedia('(max-width: 640px)').matches ||
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent,
        )
      if (mobile) setShow(true)
    } catch {
      // ignore
    }
  }, [])

  return show
}

function dismiss() {
  try {
    localStorage.setItem(DISMISS_KEY, '1')
  } catch {
    // ignore
  }
}

export function AddToHomeScreenHint() {
  const show = usePWAHint()
  const [visible, setVisible] = React.useState(false)

  React.useEffect(() => {
    if (show) setVisible(true)
  }, [show])

  function handleDismiss() {
    dismiss()
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      role="status"
      className="mx-4 mt-2 flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
    >
      <span>
        Add to Home Screen for quick access.
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
        aria-label="Dismiss"
        onClick={handleDismiss}
      >
        <X className="size-4" />
      </Button>
    </div>
  )
}
