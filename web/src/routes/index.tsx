import { createFileRoute } from '@tanstack/react-router'
import { zodResolver } from '@hookform/resolvers/zod'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowUpRight, Banknote, Building2, Mic, Smartphone, Store } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import type { ParsedIntent } from '@/lib/intent'
import type { TransactionMode } from '@/lib/sms'
import { buildSmsBody, openSmsApp } from '@/lib/sms'
import { loadFCMConfig, triggerFCMEvent } from '@/lib/fcm'
import { NumericKeypadDrawer } from '@/components/NumericKeypadDrawer'
import { VoiceCommandDrawer } from '@/components/VoiceCommandDrawer'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'

const TRANSACTION_OPTIONS: Array<{
  value: TransactionMode
  label: string
  description: string
  icon: typeof ArrowUpRight
}> = [
  {
    value: 'SEND_MONEY',
    label: 'Send Money',
    description: 'Send to a phone number',
    icon: ArrowUpRight,
  },
  {
    value: 'POCHI',
    label: 'Pochi',
    description: 'Send to a Pochi number',
    icon: Smartphone,
  },
  {
    value: 'PAYBILL',
    label: 'Paybill',
    description: 'Pay a business bill',
    icon: Building2,
  },
  {
    value: 'TILL',
    label: 'Buy Goods (Till)',
    description: 'Pay a till number',
    icon: Store,
  },
  {
    value: 'WITHDRAW',
    label: 'Withdraw Cash',
    description: 'Withdraw at an agent',
    icon: Banknote,
  },
]

export const Route = createFileRoute('/')({ component: Home })

const msg = 'Please fill all required fields.'

type DeliveryMethod = 'sms' | 'push'

const smsFormSchema = z
  .object({
    transactionType: z.string(),
    deliveryMethod: z.enum(['sms', 'push']),
    receiver: z.string(),
    phone: z.string(),
    till: z.string(),
    business: z.string(),
    account: z.string(),
    agent: z.string(),
    store: z.string(),
    amount: z.string(),
  })
  .superRefine((data, ctx) => {
    if (!data.amount.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amount'],
        message: msg,
      })
    }
    if (data.deliveryMethod === 'sms' && !data.receiver.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['receiver'],
        message: msg,
      })
    }
    const mode = data.transactionType as TransactionMode
    if (mode === 'SEND_MONEY' || mode === 'POCHI') {
      if (!data.phone.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['phone'],
          message: msg,
        })
      }
    }
    if (mode === 'TILL') {
      if (!data.till.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['till'],
          message: msg,
        })
      }
    }
    if (mode === 'PAYBILL') {
      if (!data.business.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['business'],
          message: msg,
        })
      }
      if (!data.account.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['account'],
          message: msg,
        })
      }
    }
    if (mode === 'WITHDRAW') {
      if (!data.agent.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['agent'],
          message: msg,
        })
      }
      if (!data.store.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['store'],
          message: msg,
        })
      }
    }
  })

type SmsFormValues = z.infer<typeof smsFormSchema>

const DELIVERY_METHODS: Array<{ value: DeliveryMethod; label: string }> = [
  { value: 'sms', label: 'SMS' },
  { value: 'push', label: 'Remote Push' },
]

function Home() {
  const {
    handleSubmit,
    watch,
    control,
    formState: { isSubmitting },
  } = useForm<SmsFormValues>({
    defaultValues: {
      transactionType: 'SEND_MONEY',
      deliveryMethod: 'sms',
      receiver: '',
      phone: '',
      till: '',
      business: '',
      account: '',
      agent: '',
      store: '',
      amount: '',
    },
    resolver: zodResolver(smsFormSchema),
  })

  const mode = watch('transactionType') as TransactionMode
  const deliveryMethod = watch('deliveryMethod') as DeliveryMethod
  const showPhone = mode === 'SEND_MONEY' || mode === 'POCHI'
  const showTill = mode === 'TILL'
  const showPaybill = mode === 'PAYBILL'
  const showWithdraw = mode === 'WITHDRAW'
  const isSms = deliveryMethod === 'sms'

  const onSubmit = async (value: SmsFormValues) => {
    const body = buildSmsBody(value.transactionType as TransactionMode, {
      phone: value.phone,
      till: value.till,
      business: value.business,
      account: value.account,
      agent: value.agent,
      store: value.store,
      amount: value.amount,
    })

    if (value.deliveryMethod === 'push') {
      const config = loadFCMConfig()
      if (!config) {
        toast.error(
          'Remote push not configured. Open settings (gear icon) to set up FCM.',
        )
        return
      }
      try {
        await triggerFCMEvent(config, 'ussd-trigger', { body })
        toast.success('Push sent to device.')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Push failed.'
        toast.error(
          message.startsWith('FCM error')
            ? `Remote push failed. Check internet and FCM settings.`
            : message,
        )
      }
      return
    }

    openSmsApp(body, value.receiver || undefined)
  }

  const voiceSubmitHandler = async (intent: ParsedIntent) => {
    const config = loadFCMConfig()
    if (!config) {
      toast.error('Remote push not configured. Open Settings to set up FCM.')
      return
    }
    const body = buildSmsBody(intent.type as TransactionMode, {
      phone: 'phone' in intent ? intent.phone : '',
      till: 'till' in intent ? intent.till : '',
      business: 'business' in intent ? intent.business : '',
      account: 'account' in intent ? intent.account : '',
      agent: 'agent' in intent ? intent.agent : '',
      store: 'store' in intent ? intent.store : '',
      amount: intent.amount,
    })
    try {
      await triggerFCMEvent(config, 'ussd-trigger', { body })
      toast.success('Push sent to device.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Push failed.'
      toast.error(
        message.startsWith('FCM error')
          ? 'Remote push failed. Check internet and FCM settings.'
          : message,
      )
    }
  }

  return (
    <div className="min-h-screen">
      <main className="max-w-lg mx-auto px-4 py-8">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="transactionType">Transaction type</Label>
            <Controller
              name="transactionType"
              control={control}
              render={({ field }) => {
                const selected = TRANSACTION_OPTIONS.find(
                  (t) => t.value === field.value,
                )
                const SelectedIcon = selected?.icon ?? ArrowUpRight
                return (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger
                      id="transactionType"
                      className="w-full py-6 text-start border"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <SelectedIcon className="size-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-lg font-bold leading-tight truncate">
                            {selected?.label ?? 'Choose transaction type'}
                          </p>
                          {selected && (
                            <p className="text-xs text-muted-foreground truncate">
                              {selected.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {TRANSACTION_OPTIONS.map((t) => {
                        const Icon = t.icon
                        return (
                          <SelectItem key={t.value} value={t.value}>
                            <div className="flex items-center gap-3 py-0.5">
                              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                                <Icon className="size-4" />
                              </span>
                              <div>
                                <p className="font-medium leading-tight">
                                  {t.label}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {t.description}
                                </p>
                              </div>
                            </div>
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                )
              }}
            />
          </div>

          {showPhone && (
            <Controller
              name="phone"
              control={control}
              render={({ field, fieldState }) => (
                <NumericKeypadDrawer
                  value={field.value}
                  onChange={field.onChange}
                  label="Phone number"
                  placeholder="e.g. 0712345678"
                  error={fieldState.error?.message}
                  enableContacts
                />
              )}
            />
          )}

          {showTill && (
            <Controller
              name="till"
              control={control}
              render={({ field, fieldState }) => (
                <NumericKeypadDrawer
                  value={field.value}
                  onChange={field.onChange}
                  label="Till Number"
                  placeholder="e.g. 522533"
                  error={fieldState.error?.message}
                />
              )}
            />
          )}

          {showPaybill && (
            <>
              <Controller
                name="business"
                control={control}
                render={({ field, fieldState }) => (
                  <NumericKeypadDrawer
                    value={field.value}
                    onChange={field.onChange}
                    label="Business Number"
                    placeholder="e.g. 247247"
                    error={fieldState.error?.message}
                  />
                )}
              />
              <Controller
                name="account"
                control={control}
                render={({ field, fieldState }) => (
                  <NumericKeypadDrawer
                    value={field.value}
                    onChange={field.onChange}
                    label="Account Number"
                    placeholder="e.g. 1234567"
                    error={fieldState.error?.message}
                  />
                )}
              />
            </>
          )}

          {showWithdraw && (
            <>
              <Controller
                name="agent"
                control={control}
                render={({ field, fieldState }) => (
                  <NumericKeypadDrawer
                    value={field.value}
                    onChange={field.onChange}
                    label="Agent Number"
                    placeholder="e.g. 123456"
                    error={fieldState.error?.message}
                  />
                )}
              />
              <Controller
                name="store"
                control={control}
                render={({ field, fieldState }) => (
                  <NumericKeypadDrawer
                    value={field.value}
                    onChange={field.onChange}
                    label="Store Number"
                    placeholder="e.g. 001"
                    error={fieldState.error?.message}
                  />
                )}
              />
            </>
          )}

          <Controller
            name="amount"
            control={control}
            render={({ field, fieldState }) => (
              <NumericKeypadDrawer
                value={field.value}
                onChange={field.onChange}
                label="Amount"
                placeholder="Enter amount in KES"
                prefix="KES "
                error={fieldState.error?.message}
              />
            )}
          />


          <div className="space-y-2">
            <Label>Send via</Label>
            <Controller
              name="deliveryMethod"
              control={control}
              render={({ field }) => (
                <div className="flex gap-2">
                  {DELIVERY_METHODS.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => field.onChange(m.value)}
                      className={`flex-1 rounded-md border py-3 text-sm font-medium transition-colors cursor-pointer ${
                        field.value === m.value
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-foreground border-border hover:bg-accent'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
            />
          </div>

          {isSms && (
            <Controller
              name="receiver"
              control={control}
              render={({ field, fieldState }) => (
                <NumericKeypadDrawer
                  value={field.value}
                  onChange={field.onChange}
                  label="Send to (receiver phone number)"
                  placeholder="e.g. 0712345678"
                  error={fieldState.error?.message}
                  enableContacts
                />
              )}
            />
          )}

          <div className="pt-2">
            <AnimatePresence>
              <motion.div
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                whileHover={{ scale: 1.05 }}
                exit={{ scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                <Button
                  className="w-full cursor-pointer py-8 text-3xl! font-bold text-start border"
                  type="submit"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Sending...' : 'Send'}
                </Button>
              </motion.div>
            </AnimatePresence>
          </div>
        </form>

        <p className="mt-6 text-xs text-muted-foreground text-center">
          {isSms
            ? 'Opens your default SMS app with the message filled. Send to your number (with PesaMirror app) to trigger USSD, or use your own flow. Works fully offline.'
            : 'Sends an FCM push notification directly to your device running the PesaMirror app. Configure settings via the gear icon.'}
        </p>

        <p className="mt-4 text-xs text-muted-foreground text-center max-w-md mx-auto">
          For personal use only. Automates M-Pesa USSD; can perform real
          transactions. Use at your own risk. Not affiliated with Safaricom.
          Open source on{' '}
          <a
            href="https://github.com/davidamunga/pesamirror"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            GitHub
          </a>
          .
        </p>
      </main>

      {/* Floating mic FAB — fixed above bottom nav center */}
      <VoiceCommandDrawer
        onVoiceSubmit={voiceSubmitHandler}
        trigger={
          <motion.button
            type="button"
            className="fixed bottom-[34px] left-1/2 -translate-x-1/2 z-30 flex size-16 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-colors"
            whileTap={{ scale: 0.92 }}
            aria-label="Speak a voice command"
          >
            <Mic className="size-6" />
          </motion.button>
        }
      />
    </div>
  )
}
