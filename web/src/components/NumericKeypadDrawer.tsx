import { useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Drawer } from 'vaul'
import { Delete } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

interface NumericKeypadDrawerProps {
  value: string
  onChange: (value: string) => void
  label: string
  placeholder?: string
  className?: string
  /** Displayed before the value (e.g. "KES " for amounts) */
  prefix?: string
  error?: string
  /** Shows a "Contacts" button outside the drawer (requires navigator.contacts API) */
  enableContacts?: boolean
}

const DIGIT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

export function NumericKeypadDrawer({
  value,
  onChange,
  label,
  placeholder = 'Tap to enter',
  className,
  prefix,
  error,
  enableContacts = false,
}: NumericKeypadDrawerProps) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const draftRef = useRef(draft)

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    if (open) setDraft(value)
  }, [open, value])

  // Physical keyboard support while the drawer is open
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (/^[0-9]$/.test(e.key)) {
        setDraft((prev) => prev + e.key)
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        setDraft((prev) => prev.slice(0, -1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        onChange(draftRef.current)
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onChange])

  const hasContactsApi =
    typeof navigator !== 'undefined' &&
    'contacts' in navigator &&
    'select' in (navigator as { contacts?: { select?: unknown } }).contacts!

  async function pickContact() {
    if (!hasContactsApi) {
      alert(
        'Contact picker is not supported in this browser. Try Chrome on Android.',
      )
      return
    }
    try {
      const contacts = await (
        navigator as unknown as {
          contacts: {
            select: (opts: {
              multiple?: boolean
            }) => Promise<Array<{ tel?: Array<string> }>>
          }
        }
      ).contacts.select({ multiple: false })
      const tel = contacts[0]?.tel?.[0] ?? ''
      if (tel) {
        const normalized = tel.replace(/\s+/g, '').replace(/^\+254/, '0')
        onChange(normalized)
      }
    } catch (err) {
      if (
        (err as Error).name !== 'SecurityError' &&
        (err as Error).name !== 'AbortError'
      ) {
        console.error('Contact picker error:', err)
        alert('Could not open contacts.')
      }
    }
  }

  function handleDigit(digit: string) {
    setDraft((prev) => prev + digit)
  }

  function handleBackspace() {
    setDraft((prev) => prev.slice(0, -1))
  }

  function handleClear() {
    setDraft('')
  }

  function handleConfirm() {
    onChange(draft)
    setOpen(false)
  }

  function formatDisplay(raw: string) {
    return raw ? (prefix ? `${prefix} ${raw}` : raw) : null
  }

  const triggerDisplay = formatDisplay(value)

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Drawer.Root open={open} onOpenChange={setOpen}>
          <Drawer.Trigger asChild>
            <button
              id={id}
              type="button"
              aria-invalid={!!error}
              className={cn(
                'flex-1 text-left cursor-pointer  rounded-md border px-3 py-8 text-3xl font-bold',
                'border-input bg-transparent hover:bg-background/50 shadow-xs transition-[color,box-shadow] outline-none',
                'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                error &&
                  'border-destructive ring-[3px] ring-destructive/20 dark:ring-destructive/40',
                className,
              )}
            >
              {triggerDisplay ?? (
                <span className="text-muted-foreground text-3xl font-normal">
                  {placeholder}
                </span>
              )}
            </button>
          </Drawer.Trigger>

          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 z-40 bg-black/50" />
            <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-2xl bg-background outline-none max-h-[92dvh]">
              <Drawer.Handle className="mx-auto mt-3 mb-1 h-1.5 w-12 rounded-full bg-muted" />

              <div className="flex flex-col px-5 pt-2 pb-8 gap-4 overflow-y-auto">
                <div className="flex items-center justify-between">
                  <Drawer.Title className="text-sm font-medium text-muted-foreground">
                    {label}
                  </Drawer.Title>
                  <AnimatePresence>
                    {draft && (
                      <motion.button
                        type="button"
                        onClick={handleClear}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.15 }}
                        className="text-sm font-medium text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded-md"
                      >
                        Clear
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>

                {/* Value display */}
                <div className="min-h-14 flex items-end border-b border-border pb-3 overflow-hidden">
                  {draft ? (
                    <div className="flex items-baseline text-5xl font-bold tracking-tight leading-tight flex-wrap">
                      {prefix && (
                        <span className="text-muted-foreground/60 mr-2 text-3xl font-normal">
                          {prefix}
                        </span>
                      )}
                      <AnimatePresence initial={false} mode="popLayout">
                        {draft.split('').map((char, i) => (
                          <motion.span
                            key={i}
                            initial={{ opacity: 0, y: 14, scale: 0.75 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -14, scale: 0.75 }}
                            transition={{
                              type: 'spring',
                              damping: 18,
                              stiffness: 450,
                            }}
                            className="inline-block"
                          >
                            {char}
                          </motion.span>
                        ))}
                      </AnimatePresence>
                    </div>
                  ) : (
                    <span className="text-3xl text-muted-foreground/60 font-normal">
                      {placeholder}
                    </span>
                  )}
                </div>

                {/* Keypad grid */}
                <div className="grid grid-cols-3 gap-3">
                  {DIGIT_KEYS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => handleDigit(k)}
                      className="h-16 rounded-2xl text-2xl font-semibold bg-secondary hover:bg-secondary/70 active:scale-95 transition-all select-none"
                    >
                      {k}
                    </button>
                  ))}

                  {/* Backspace */}
                  <button
                    type="button"
                    onClick={handleBackspace}
                    className="h-16 rounded-2xl flex items-center justify-center bg-muted hover:bg-muted/70 active:scale-95 transition-all select-none"
                    aria-label="Backspace"
                  >
                    <Delete className="size-6" />
                  </button>

                  {/* 0 */}
                  <button
                    type="button"
                    onClick={() => handleDigit('0')}
                    className="h-16 rounded-2xl text-2xl font-semibold bg-secondary hover:bg-secondary/70 active:scale-95 transition-all select-none"
                  >
                    0
                  </button>

                  {/* Confirm */}
                  <button
                    type="button"
                    onClick={handleConfirm}
                    className="h-16 rounded-2xl text-2xl font-semibold bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 transition-all select-none"
                    aria-label="Confirm"
                  >
                    ✓
                  </button>
                </div>
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>

        {enableContacts && hasContactsApi && (
          <Button
            type="button"
            variant="outline"
            className="py-8 px-4 text-base font-semibold self-end mb-0"
            onClick={pickContact}
            title="Select from contacts"
          >
            Contacts
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
