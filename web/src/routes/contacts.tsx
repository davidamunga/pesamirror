import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { BookUser, Pencil, Plus, Trash2, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import type { ContactType, VoiceContact } from '@/lib/voice-contacts'
import {
  clearVoiceContacts,
  deleteVoiceContact,
  getVoiceContacts,
  initVoiceContacts,
  saveVoiceContact,
} from '@/lib/voice-contacts'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'

export const Route = createFileRoute('/contacts')({
  component: ContactsPage,
})

const TYPE_LABELS: Record<ContactType, string> = {
  mobile: 'Mobile',
  pochi: 'Pochi',
  till: 'Till',
  paybill: 'Paybill',
}

const TYPE_BADGE: Record<ContactType, string> = {
  mobile: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  pochi: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  till: 'bg-green-500/10 text-green-600 dark:text-green-400',
  paybill: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
}

const PHONE_LABELS: Record<ContactType, string> = {
  mobile: 'Phone Number',
  pochi: 'Phone Number',
  till: 'Till Number',
  paybill: 'Business Number',
}

const PHONE_PLACEHOLDERS: Record<ContactType, string> = {
  mobile: 'e.g. 0712345678',
  pochi: 'e.g. 0712345678',
  till: 'e.g. 522533',
  paybill: 'e.g. 247247',
}

type FormState = {
  name: string
  type: ContactType
  phone: string
  accountNumber: string
}

const EMPTY_FORM: FormState = {
  name: '',
  type: 'mobile',
  phone: '',
  accountNumber: '',
}

function ContactsPage() {
  const [contacts, setContacts] = React.useState<Array<VoiceContact>>([])
  const [loading, setLoading] = React.useState(true)
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM)
  const [editing, setEditing] = React.useState<string | null>(null)
  const [formVisible, setFormVisible] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    setLoading(true)
    initVoiceContacts()
      .then(() => setContacts(getVoiceContacts()))
      .catch(() => toast.error('Could not load contacts.'))
      .finally(() => setLoading(false))
  }, [])

  function startAdd() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setFormVisible(true)
  }

  function startEdit(contact: VoiceContact) {
    setEditing(contact.name)
    setForm({
      name: contact.name,
      type: contact.type ?? 'mobile',
      phone: contact.phone,
      accountNumber: contact.accountNumber ?? '',
    })
    setFormError(null)
    setFormVisible(true)
  }

  function cancelForm() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setFormVisible(false)
  }

  async function handleSave() {
    const name = form.name.trim()
    const phone = form.phone.trim()
    const accountNumber = form.accountNumber.trim()

    if (!name) { setFormError('Name is required.'); return }
    if (!phone) { setFormError(`${PHONE_LABELS[form.type]} is required.`); return }

    if (form.type === 'mobile' || form.type === 'pochi') {
      if (!/^[+\d\s\-()]{7,15}$/.test(phone)) {
        setFormError('Enter a valid phone number (e.g. 0712345678).')
        return
      }
    } else {
      if (!/^\d{4,15}$/.test(phone)) {
        setFormError(`Enter a valid ${PHONE_LABELS[form.type].toLowerCase()} (digits only).`)
        return
      }
    }

    if (form.type === 'paybill' && accountNumber && !/^[\w-]{1,30}$/.test(accountNumber)) {
      setFormError('Enter a valid account number.')
      return
    }

    const duplicate = contacts.find(
      (c) => c.name.toLowerCase() === name.toLowerCase() && c.name !== editing,
    )
    if (duplicate) { setFormError(`A contact named "${name}" already exists.`); return }

    setSaving(true)
    try {
      if (editing && editing.toLowerCase() !== name.toLowerCase()) {
        await deleteVoiceContact(editing)
      }
      await saveVoiceContact({ name, type: form.type, phone, accountNumber: accountNumber || undefined })
      setContacts(getVoiceContacts())
      cancelForm()
      toast.success(editing ? 'Contact updated.' : 'Contact saved.')
    } catch {
      toast.error('Could not save contact.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(name: string) {
    if (!confirm(`Remove "${name}" from voice contacts?`)) return
    try {
      await deleteVoiceContact(name)
      setContacts(getVoiceContacts())
      if (editing === name) cancelForm()
      toast.success('Contact removed.')
    } catch {
      toast.error('Could not remove contact.')
    }
  }

  async function handlePickFromDevice() {
    type ContactsAPI = {
      select: (props: Array<string>, opts: { multiple: boolean }) => Promise<Array<{ name: Array<string>; tel: Array<string> }>>
    }
    const contactsApi = (navigator as unknown as { contacts?: ContactsAPI }).contacts
    if (!contactsApi?.select) {
      toast.error('Contacts Picker is not supported in this browser.')
      return
    }
    try {
      const results = await contactsApi.select(['name', 'tel'], { multiple: true })
      let added = 0
      for (const r of results) {
        const name = r.name[0]?.trim()
        const phone = r.tel[0]?.trim()
        if (name && phone) { await saveVoiceContact({ name, type: 'mobile', phone }); added++ }
      }
      setContacts(getVoiceContacts())
      if (added > 0) toast.success(`${added} contact${added > 1 ? 's' : ''} imported.`)
    } catch {
      toast.error('Could not import contacts.')
    }
  }

  async function handleClearAll() {
    if (!confirm('Remove all voice contacts from this device? This cannot be undone.')) return
    try {
      await clearVoiceContacts()
      setContacts([])
      cancelForm()
      toast.success('All voice contacts cleared.')
    } catch {
      toast.error('Could not clear contacts.')
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Voice Contacts</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Contacts used for voice commands. Stored encrypted on this device.
        </p>
      </div>

      {/* Contact list */}
      <div className="rounded-lg border bg-card">
        {loading && (
          <p className="text-sm text-muted-foreground text-center py-8">Loading&hellip;</p>
        )}

        {!loading && contacts.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-10 text-center px-4">
            <UserRound className="size-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">No contacts yet.</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Add contacts so you can say &ldquo;send 500 to David&rdquo; or &ldquo;pay KFC 300&rdquo;.
            </p>
          </div>
        )}

        {!loading && contacts.length > 0 && (
          <ScrollArea className="max-h-[50vh]">
            {contacts.map((c) => {
              const type = c.type ?? 'mobile'
              return (
                <div
                  key={c.name}
                  className="flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-accent group border-b last:border-b-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium leading-none', TYPE_BADGE[type])}>
                        {TYPE_LABELS[type]}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {type === 'paybill' && c.accountNumber ? `${c.phone} / Acc: ${c.accountNumber}` : c.phone}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity">
                    <Button type="button" variant="ghost" size="icon-xs" onClick={() => startEdit(c)} aria-label={`Edit ${c.name}`}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-xs" className="text-destructive hover:bg-destructive/10" onClick={() => handleDelete(c.name)} aria-label={`Delete ${c.name}`}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </ScrollArea>
        )}
      </div>

      {/* Add / Edit form */}
      {formVisible ? (
        <div className="space-y-3 rounded-lg border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">
            {editing ? `Editing "${editing}"` : 'New contact'}
          </p>

          <div className="space-y-1.5">
            <Label>Type</Label>
            <div className="grid grid-cols-4 gap-1">
              {(Object.keys(TYPE_LABELS) as Array<ContactType>).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, type: t, phone: '', accountNumber: '' }))}
                  className={cn(
                    'rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
                    form.type === t
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-input text-muted-foreground hover:bg-accent',
                  )}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vc-name">Name</Label>
            <input
              id="vc-name"
              type="text"
              placeholder={form.type === 'till' ? 'e.g. KFC Westlands' : form.type === 'paybill' ? 'e.g. Safaricom' : 'e.g. David'}
              value={form.name}
              onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setFormError(null) }}
              autoComplete="off"
              className="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs transition-colors focus-visible:ring-1 focus-visible:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vc-phone">{PHONE_LABELS[form.type]}</Label>
            <input
              id="vc-phone"
              type="tel"
              placeholder={PHONE_PLACEHOLDERS[form.type]}
              value={form.phone}
              onChange={(e) => { setForm((f) => ({ ...f, phone: e.target.value })); setFormError(null) }}
              autoComplete="off"
              className="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs transition-colors focus-visible:ring-1 focus-visible:outline-none"
            />
          </div>

          {form.type === 'paybill' && (
            <div className="space-y-1.5">
              <Label htmlFor="vc-account">
                Account Number <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <input
                id="vc-account"
                type="text"
                placeholder="e.g. 1234 or your account ref"
                value={form.accountNumber}
                onChange={(e) => { setForm((f) => ({ ...f, accountNumber: e.target.value })); setFormError(null) }}
                autoComplete="off"
                className="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs transition-colors focus-visible:ring-1 focus-visible:outline-none"
              />
              <p className="text-muted-foreground text-xs">
                Save your account number to use &ldquo;pay {form.name || 'Safaricom'} 500&rdquo; hands-free.
              </p>
            </div>
          )}

          {formError && <p className="text-xs text-destructive">{formError}</p>}

          <div className="flex gap-2">
            <Button type="button" size="sm" className="flex-1 py-6" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving\u2026' : editing ? 'Update' : 'Add'}
            </Button>
            <Button type="button" size="sm" variant="outline" className="flex-1 py-6" onClick={cancelForm} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1 gap-2 py-6" onClick={startAdd}>
            <Plus className="size-4" />
            Add contact
          </Button>
          <Button type="button" variant="outline" className="flex-1 gap-2 py-6" onClick={handlePickFromDevice}>
            <BookUser className="size-4" />
            Import
          </Button>
        </div>
      )}

      {contacts.length > 0 && !formVisible && (
        <button
          type="button"
          className="w-full text-xs py-3 cursor-pointer text-destructive/70 hover:text-destructive text-center transition-colors"
          onClick={handleClearAll}
        >
          Clear all contacts
        </button>
      )}
    </div>
  )
}
