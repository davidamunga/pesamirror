import { createFileRoute } from '@tanstack/react-router'
import { zodResolver } from '@hookform/resolvers/zod'
import { AnimatePresence, motion } from 'motion/react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import type { TransactionMode } from '@/lib/sms'
import { TRANSACTION_TYPES, buildSmsBody, openSmsApp } from '@/lib/sms'
import { NumericKeypadDrawer } from '@/components/NumericKeypadDrawer'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export const Route = createFileRoute('/')({ component: Home })

const msg = 'Please fill all required fields.'

const smsFormSchema = z
  .object({
    transactionType: z.string(),
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
    if (!data.receiver.trim()) {
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

function Home() {
  const {
    handleSubmit,
    watch,
    control,
    formState: { isSubmitting },
  } = useForm<SmsFormValues>({
    defaultValues: {
      transactionType: 'SEND_MONEY',
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
  const showPhone = mode === 'SEND_MONEY' || mode === 'POCHI'
  const showTill = mode === 'TILL'
  const showPaybill = mode === 'PAYBILL'
  const showWithdraw = mode === 'WITHDRAW'

  const onSubmit = (value: SmsFormValues) => {
    const body = buildSmsBody(value.transactionType as TransactionMode, {
      phone: value.phone,
      till: value.till,
      business: value.business,
      account: value.account,
      agent: value.agent,
      store: value.store,
      amount: value.amount,
    })
    openSmsApp(body, value.receiver || undefined)
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
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger
                    id="transactionType"
                    className="w-full py-8 text-3xl! font-bold text-start border"
                  >
                    <SelectValue placeholder="Choose transaction type" />
                  </SelectTrigger>
                  <SelectContent className="bg-background">
                    {TRANSACTION_TYPES.map((t) => (
                      <SelectItem
                        className="text-3xl! font-bold"
                        key={t.value}
                        value={t.value}
                      >
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
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

          <Controller
            name="receiver"
            control={control}
            render={({ field }) => (
              <NumericKeypadDrawer
                value={field.value}
                onChange={field.onChange}
                label="Send to (receiver phone number)"
                placeholder="e.g. 0712345678"
                enableContacts
              />
            )}
          />

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
          Opens your default SMS app with the message filled. Send to your
          number (with PesaMirror app) to trigger USSD, or use your own flow.
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
    </div>
  )
}
