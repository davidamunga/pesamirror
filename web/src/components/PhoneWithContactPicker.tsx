import { BookUser } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type FieldApi = {
  name: string
  state: {
    value: string
    meta: { errors: Array<string | { message: string }>; isTouched: boolean }
  }
  handleChange: (value: string) => void
  handleBlur: () => void
}

export function PhoneWithContactPicker({
  field,
  label,
  placeholder,
  className,
}: {
  field: FieldApi
  label: string
  placeholder?: string
  className?: string
}) {
  const errors = field.state.meta.errors
  async function pickContact() {
    if (
      !('contacts' in navigator) ||
      !(
        'select' in
        (
          navigator as {
            contacts?: {
              select: (props: {
                multiple?: boolean
              }) => Promise<Array<{ tel?: Array<string> }>>
            }
          }
        ).contacts!
      )
    ) {
      alert(
        'Contact picker is not supported in this browser. Try Chrome on Android or a recent Android WebView.',
      )
      return
    }
    try {
      const contactsManager = (
        navigator as {
          contacts: {
            select: (
              props: Array<string>,
            ) => Promise<Array<{ tel?: Array<string> }>>
            getProperties: () => Promise<Array<string>>
          }
        }
      ).contacts

      const propertiesAvailable = await contactsManager.getProperties()
      const contacts = await contactsManager.select(propertiesAvailable)
      const contact = contacts[0]
      const tel = contact.tel?.[0] ?? ''
      if (tel) {
        const normalized = tel.replace(/\s+/g, '').replace(/^\+254/, '0')
        field.handleChange(normalized)
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

  const hasContactsApi =
    typeof navigator !== 'undefined' &&
    'contacts' in navigator &&
    'select' in (navigator as { contacts?: { select?: unknown } }).contacts!

  return (
    <div className="space-y-2">
      <Label htmlFor={label} className="text-xl font-bold">
        {label}
      </Label>
      <div className="flex gap-2">
        <Input
          id={label}
          type="tel"
          inputMode="numeric"
          placeholder={placeholder}
          value={field.state.value}
          onBlur={field.handleBlur}
          onChange={(e) => field.handleChange(e.target.value)}
          className={cn('flex-1', className)}
        />
        {hasContactsApi && (
          <Button
            type="button"
            variant="outline"
            onClick={pickContact}
            className="h-full"
          >
            <BookUser className="size-4" />
          </Button>
        )}
      </div>
      {field.state.meta.isTouched && errors.length > 0 && (
        <div className="text-red-500 font-bold">
          {errors
            .map((e) => (typeof e === 'string' ? e : e.message))
            .join(', ')}
        </div>
      )}
    </div>
  )
}
