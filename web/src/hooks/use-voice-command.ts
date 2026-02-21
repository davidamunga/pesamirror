import { useCallback, useEffect, useRef, useState } from 'react'
import type { ParsedIntent } from '@/lib/intent'
import type { VoiceContact } from '@/lib/voice-contacts'
import { describeIntent, parseIntent } from '@/lib/intent'
import { isSpeechRecognitionSupported, listenOnce } from '@/lib/stt'
import { cancelSpeech, speak } from '@/lib/tts'
import {
  initVoiceContacts,
  resolveContact,
  resolvePhoneOrName,
  saveVoiceContact,
} from '@/lib/voice-contacts'

/**
 * Convert a resolved VoiceContact + amount into the correct ParsedIntent type.
 * Returns null for paybill contacts that are missing an account number.
 */
function contactToIntent(contact: VoiceContact, amount: string): ParsedIntent | null {
  const type = contact.type ?? 'mobile'
  if (type === 'till') return { type: 'TILL', amount, till: contact.phone }
  if (type === 'paybill') {
    if (!contact.accountNumber) return null
    return { type: 'PAYBILL', amount, business: contact.phone, account: contact.accountNumber }
  }
  if (type === 'pochi') return { type: 'POCHI', amount, phone: contact.phone }
  return { type: 'SEND_MONEY', amount, phone: contact.phone }
}

export type VoiceCommandState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'confirming'
  | 'awaiting_confirmation'
  | 'error'

interface UseVoiceCommandResult {
  state: VoiceCommandState
  transcript: string
  pendingIntent: ParsedIntent | null
  errorMessage: string
  isSupported: boolean
  start: () => void
  confirm: () => void
  cancel: () => void
}

export function useVoiceCommand(
  onVoiceSubmit: (intent: ParsedIntent) => void,
  onDismiss?: () => void,
): UseVoiceCommandResult {
  const [state, setState] = useState<VoiceCommandState>('idle')
  const [transcript, setTranscript] = useState('')
  const [pendingIntent, setPendingIntent] = useState<ParsedIntent | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  const pendingIntentRef = useRef<ParsedIntent | null>(null)
  const transcriptRef = useRef('')

  const isSupported = isSpeechRecognitionSupported()

  // Ensure contacts are decrypted and cached before the first voice command
  useEffect(() => {
    initVoiceContacts().catch(() => {})
  }, [])

  const reset = useCallback(() => {
    setState('idle')
    setTranscript('')
    setPendingIntent(null)
    pendingIntentRef.current = null
    transcriptRef.current = ''
    setErrorMessage('')
  }, [])

  const setError = useCallback((msg: string) => {
    setState('error')
    setErrorMessage(msg)
    speak(msg).catch(() => {})
  }, [])

  const executeConfirm = useCallback(
    (intent: ParsedIntent, raw: string) => {
      // Auto-save named contact for future voice lookups
      const nameMatch = raw.match(/to\s+([a-z\s]+?)(?:\s*$)/i)
      const rawName = nameMatch?.[1]?.trim()
      if (
        rawName &&
        !/^\d/.test(rawName) &&
        (intent.type === 'SEND_MONEY' || intent.type === 'POCHI')
      ) {
        saveVoiceContact({ name: rawName, phone: intent.phone }).catch(() => {})
      }

      cancelSpeech()
      speak('Perfect, sending now via remote push.').catch(() => {})
      reset()
      onDismiss?.()
      onVoiceSubmit(intent)
    },
    [reset, onVoiceSubmit, onDismiss],
  )

  const start = useCallback(async () => {
    if (!isSupported) {
      setError(
        'Voice commands are not supported in this browser. Try Chrome or Safari.',
      )
      return
    }

    cancelSpeech()
    setState('listening')
    setTranscript('')
    setPendingIntent(null)
    pendingIntentRef.current = null
    transcriptRef.current = ''
    setErrorMessage('')

    // Step 1: capture the main command
    let raw: string
    try {
      raw = await listenOnce('en-US')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not capture audio.')
      return
    }

    setTranscript(raw)
    transcriptRef.current = raw
    setState('processing')

    const parsed = parseIntent(raw)
    if (!parsed) {
      setError(
        "Sorry, I didn't catch that. Try: send 500 shillings to 0712345678.",
      )
      return
    }

    // --- Resolve the intent to a concrete action ---
    // "send X to Name" / "pochi X to Name" may match any contact type.
    // "pay Name X" (NAMED_PAYMENT) is also resolved here.
    // All paths produce a single finalIntent used for the shared confirmation flow.
    let finalIntent: ParsedIntent = parsed

    if (parsed.type === 'SEND_MONEY' || parsed.type === 'POCHI') {
      const nameQuery = parsed.phone
      const resolvedPhone = resolvePhoneOrName(nameQuery)
      if (resolvedPhone) {
        finalIntent = { ...parsed, phone: resolvedPhone }
      } else if (!/^\d/.test(nameQuery.replace(/[\s\-()+]/g, ''))) {
        // Not a raw phone number — look up by name across all contact types
        const contact = resolveContact(nameQuery)
        if (!contact) {
          setError(
            `I couldn't find "${nameQuery}" in your contacts. Add them first, or say a phone number directly.`,
          )
          return
        }
        const resolved = contactToIntent(contact, parsed.amount)
        if (!resolved) {
          setError(
            `${contact.name} needs an account number. Edit the contact to add one, or say: pay bill ${contact.phone} account <number> ${parsed.amount}`,
          )
          return
        }
        finalIntent = resolved
      }
    } else if (parsed.type === 'NAMED_PAYMENT') {
      const contact = resolveContact(parsed.contactName)
      if (!contact) {
        setError(
          `I couldn't find "${parsed.contactName}" in your contacts. Add it first under Voice Contacts.`,
        )
        return
      }
      const resolved = contactToIntent(contact, parsed.amount)
      if (!resolved) {
        setError(
          `${contact.name} needs an account number. Edit the contact to add one, or say: pay bill ${contact.phone} account <number> ${parsed.amount}`,
        )
        return
      }
      finalIntent = resolved
    }

    // --- Shared confirmation flow ---
    setPendingIntent(finalIntent)
    pendingIntentRef.current = finalIntent
    setState('confirming')

    const description = describeIntent(finalIntent)
    try {
      await speak(`${description} Say yes to confirm, or no to cancel.`)
    } catch {
      // TTS unavailable — on-screen buttons serve as fallback
    }

    setState('awaiting_confirmation')
    let response: string
    try {
      response = await listenOnce('en-US')
    } catch {
      setState('confirming')
      speak("I couldn't hear you. Tap yes or no on screen.").catch(() => {})
      return
    }

    if (
      /^(yes|yeah|yep|yup|confirm|send|do it|go|ok|okay)/i.test(
        response.trim(),
      )
    ) {
      executeConfirm(finalIntent, raw)
    } else {
      speak('Okay, no problem. Cancelled.').catch(() => {})
      reset()
      onDismiss?.()
    }
  }, [isSupported, setError, executeConfirm, reset, onDismiss])

  // Tap fallback — used when hands-free confirmation fails
  const confirm = useCallback(() => {
    const intent = pendingIntentRef.current
    const raw = transcriptRef.current
    if (!intent) return
    cancelSpeech()
    executeConfirm(intent, raw)
  }, [executeConfirm])

  const cancel = useCallback(() => {
    cancelSpeech()
    speak('Okay, cancelled.').catch(() => {})
    reset()
    onDismiss?.()
  }, [reset, onDismiss])

  return {
    state,
    transcript,
    pendingIntent,
    errorMessage,
    isSupported,
    start,
    confirm,
    cancel,
  }
}
