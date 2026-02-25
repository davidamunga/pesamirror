import type React from 'react'
  import { useEffect, useState } from 'react'
import { Mic } from 'lucide-react'
import type { ParsedIntent } from '@/lib/intent'
import type { ContactType, VoiceContact } from '@/lib/voice-contacts'
import { getVoiceContacts, initVoiceContacts } from '@/lib/voice-contacts'
import { useVoiceCommand } from '@/hooks/use-voice-command'
import { VoiceCommandButton } from '@/components/VoiceCommandButton'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'


interface VoiceCommandDrawerProps {
  onVoiceSubmit: (intent: ParsedIntent) => void
  trigger?: React.ReactNode
}

const TYPE_COLOR: Record<ContactType, string> = {
  mobile: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  pochi: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  till: 'bg-green-500/10 text-green-600 dark:text-green-400',
  paybill: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
}

function examplePhrases(contact: VoiceContact): Array<string> {
  const type = contact.type ?? 'mobile'
  switch (type) {
    case 'mobile':
      return [`send 500 to ${contact.name}`]
    case 'pochi':
      return [`pochi 200 to ${contact.name}`, `send 200 to ${contact.name}`]
    case 'till':
      return [`pay ${contact.name} 500`, `send 500 to ${contact.name}`]
    case 'paybill':
      return [`pay ${contact.name} 1000`, `send 1000 to ${contact.name}`]
  }
}

export function VoiceCommandDrawer({ onVoiceSubmit, trigger }: VoiceCommandDrawerProps) {
  const [open, setOpen] = useState(false)
  const [contacts, setContacts] = useState<Array<VoiceContact>>([])

  const voice = useVoiceCommand(onVoiceSubmit, () => setOpen(false))

  useEffect(() => {
    if (open) {
      initVoiceContacts().then(() => setContacts(getVoiceContacts()))
    }
  }, [open])

  // Auto-start listening as soon as the drawer opens
  useEffect(() => {
    if (open && voice.state === 'idle') {
      const t = setTimeout(() => voice.start(), 300)
      return () => clearTimeout(t)
    }
  }, [open]) // voice.start is stable (useCallback); open is the only relevant trigger

  function handleOpenChange(next: boolean) {
    if (!next && voice.state !== 'idle') {
      voice.cancel()
    }
    setOpen(next)
  }

  const hasContacts = contacts.length > 0

  // Show up to 1 contact per type, with all its example phrases
  const hints = (
    ['mobile', 'pochi', 'till', 'paybill'] as Array<ContactType>
  ).flatMap((type) =>
    contacts
      .filter((c) => (c.type ?? 'mobile') === type)
      .slice(0, 1)
      .flatMap((c) =>
        examplePhrases(c).map((phrase) => ({ contact: c, type, phrase })),
      ),
  )

  return (
    <Drawer open={open} onOpenChange={handleOpenChange} direction="bottom">
      <DrawerTrigger asChild>
        {trigger ?? (
          <Button
            type="button"
            variant="outline"
            className="w-full gap-3 py-6 text-base font-medium border-dashed hover:border-solid"
            aria-label="Open voice command"
          >
            <Mic className="size-5 shrink-0" />
            Speak a command
          </Button>
        )}
      </DrawerTrigger>

      <DrawerContent className="max-h-[85svh]">
        <DrawerHeader className="pb-2">
          <DrawerTitle>Voice Command</DrawerTitle>
          <DrawerDescription>
            {hasContacts
              ? 'Say a payment command using a contact name or number.'
              : 'Say something like \u201csend 500 shillings to 0712345678\u201d'}
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-6 overflow-y-auto space-y-6">
          <VoiceCommandButton
            state={voice.state}
            transcript={voice.transcript}
            pendingIntent={voice.pendingIntent}
            errorMessage={voice.errorMessage}
            isSupported={voice.isSupported}
            onStart={voice.start}
            onConfirm={voice.confirm}
            onCancel={voice.cancel}
          />

          {hints.length > 0 && (
            <div className="space-y-3 flex flex-col w-full items-center justify-center">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Try saying
              </p>
              <div className="flex flex-wrap gap-1.5">
                {hints.map(({ contact, type, phrase }) => (
                  <span
                    key={`${type}-${contact.name}`}
                    className={cn(
                      'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
                      TYPE_COLOR[type],
                    )}
                  >
                    &ldquo;{phrase}&rdquo;
                  </span>
                ))}
              </div>
            </div>
          )}

          {!hasContacts && (
            <div className="flex w-full space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Try saying
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { phrase: 'send 10 to 0712345678', type: 'mobile' },
                  { phrase: 'pochi 20 to 0712345678', type: 'pochi' },
                  { phrase: 'pay till 522533 50', type: 'till' },
                  {
                    phrase: 'pay bill 247247 account 1234 20',
                    type: 'paybill',
                  },
                  {
                    phrase: 'withdraw 100 agent 123456 store 001',
                    type: 'mobile',
                  },
                ].map(({ phrase, type }) => (
                  <span
                    key={phrase}
                    className={cn(
                      'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
                      TYPE_COLOR[type as ContactType],
                    )}
                  >
                    &ldquo;{phrase}&rdquo;
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
