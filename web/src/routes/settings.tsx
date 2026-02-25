import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Copy, Eye, EyeOff, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { ServiceAccount } from '@/lib/fcm'
import {
  clearFCMConfig,
  initFCMConfig,
  isFCMConfigEncrypted,
  loadFCMConfig,
  saveFCMConfig,
} from '@/lib/fcm'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
})

const SA_PLACEHOLDER = `{
  "type": "service_account",
  "project_id": "your-project",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n",
  "client_email": "firebase-adminsdk-...@your-project.iam.gserviceaccount.com",
  ...
}`

const REDACTED = '*** REDACTED ***'

function redactPrivateKey(jsonStr: string): string {
  try {
    const m = jsonStr.match(/"private_key"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/)
    if (!m) return jsonStr
    return jsonStr.replace(m[0], `"private_key": "${REDACTED}"`)
  } catch {
    return jsonStr
  }
}

function SettingsPage() {
  const [saJson, setSaJson] = React.useState('')
  const [deviceToken, setDeviceToken] = React.useState('')
  const [saved, setSaved] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [maskCredentials, setMaskCredentials] = React.useState(true)
  const [saveLoading, setSaveLoading] = React.useState(false)
  const [hasUnreadableConfig, setHasUnreadableConfig] = React.useState(false)

  React.useEffect(() => {
    initFCMConfig().then(() => {
      const stored = loadFCMConfig()
      setHasUnreadableConfig(isFCMConfigEncrypted() && !stored)
      if (stored) {
        setSaJson(JSON.stringify(stored.serviceAccount, null, 2))
        setDeviceToken(stored.deviceToken)
        setMaskCredentials(true)
      } else {
        setSaJson('')
        setDeviceToken('')
        setMaskCredentials(false)
      }
      setSaved(false)
      setError(null)
    })
  }, [])

  const hasStoredConfig = Boolean(saJson.trim() && deviceToken.trim())
  const displaySaJson = maskCredentials ? redactPrivateKey(saJson) : saJson

  function handleClearCredentials() {
    if (!confirm('Remove saved FCM credentials from this device? You can add them again later.')) return
    clearFCMConfig()
    setSaJson('')
    setDeviceToken('')
    setMaskCredentials(false)
    setHasUnreadableConfig(false)
    setError(null)
  }

  async function handleSave() {
    setError(null)
    let sa: ServiceAccount
    try {
      sa = JSON.parse(saJson) as ServiceAccount
    } catch {
      setError('Invalid JSON — check the format and try again.')
      return
    }
    if (!sa.project_id || !sa.private_key || !sa.client_email) {
      setError('Service account must have project_id, private_key, and client_email.')
      return
    }
    if (!sa.private_key.includes('BEGIN PRIVATE KEY')) {
      setError('private_key does not look like a PEM key.')
      return
    }
    if (!deviceToken.trim()) {
      setError('Device token is required. Copy it from the Android app.')
      return
    }
    setSaveLoading(true)
    try {
      await saveFCMConfig({ serviceAccount: sa, deviceToken: deviceToken.trim() })
      setSaved(true)
      toast.success('FCM settings saved.')
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save.')
    } finally {
      setSaveLoading(false)
    }
  }

  function handleCopyRedacted() {
    const redacted = redactPrivateKey(saJson)
    if (!redacted.trim()) return
    navigator.clipboard.writeText(redacted).then(
      () => toast.success('Redacted JSON copied (private key hidden).'),
      () => toast.error('Could not copy.'),
    )
  }

  const canSave = saJson.trim() && deviceToken.trim()

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Remote Push Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Sends triggers via{' '}
          <a
            href="https://firebase.google.com/docs/cloud-messaging"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            Firebase Cloud Messaging
          </a>
          . Stateless &mdash; FCM wakes the Android app even when it&apos;s killed.
        </p>
      </div>

      {hasUnreadableConfig && (
        <div className="flex items-start justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
          <p className="text-muted-foreground flex-1">
            Saved credentials could not be decrypted (possible data corruption). Paste below to overwrite, or clear saved data.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive shrink-0 hover:bg-destructive/10"
            onClick={() => {
              if (confirm('Remove saved FCM data from this device?')) {
                clearFCMConfig()
                setSaJson('')
                setDeviceToken('')
                setHasUnreadableConfig(false)
                setError(null)
              }
            }}
          >
            <Trash2 className="size-3.5 mr-1" />
            Clear
          </Button>
        </div>
      )}

      <div className="rounded-lg border bg-card p-4 space-y-4">
        <p className="text-muted-foreground text-xs">
          Credentials are stored only on this device and encrypted at rest.
        </p>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Label htmlFor="sa-json">Service Account JSON</Label>
            <div className="flex items-center gap-1">
              {hasStoredConfig && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground h-8 gap-1.5 px-2 text-xs"
                  onClick={handleCopyRedacted}
                  title="Copy JSON with private key redacted"
                >
                  <Copy className="size-3.5" />
                  Copy redacted
                </Button>
              )}
              {hasStoredConfig && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground h-8 gap-1.5 px-2 text-xs"
                  onClick={() => setMaskCredentials((m) => !m)}
                >
                  {maskCredentials ? (
                    <><Eye className="size-3.5" /> Reveal</>
                  ) : (
                    <><EyeOff className="size-3.5" /> Mask</>
                  )}
                </Button>
              )}
            </div>
          </div>
          <textarea
            id="sa-json"
            rows={7}
            placeholder={SA_PLACEHOLDER}
            value={displaySaJson}
            onChange={(e) => {
              if (!maskCredentials) { setSaJson(e.target.value); setError(null) }
            }}
            readOnly={maskCredentials}
            spellCheck={false}
            className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring w-full rounded-md border px-3 py-2 font-mono text-xs shadow-xs transition-colors focus-visible:ring-1 focus-visible:outline-none resize-none disabled:opacity-90"
          />
          <p className="text-muted-foreground text-xs">
            Firebase Console &rarr; Project Settings &rarr; Service accounts &rarr; Generate new private key.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="device-token">Device Token</Label>
          <input
            id="device-token"
            type="text"
            placeholder="Paste the FCM token from the Android app"
            value={deviceToken}
            onChange={(e) => { setDeviceToken(e.target.value); setError(null) }}
            autoComplete="off"
            spellCheck={false}
            className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs transition-colors focus-visible:ring-1 focus-visible:outline-none"
          />
          <p className="text-muted-foreground text-xs">
            Shown in the Android app under Remote Push settings &mdash; tap Copy Token.
          </p>
        </div>

        {error && <p className="text-destructive text-sm">{error}</p>}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        {hasStoredConfig && (
          <Button
            type="button"
            variant="outline"
            className="w-full border-destructive/50 text-destructive hover:bg-destructive/10 sm:w-auto gap-1.5"
            onClick={handleClearCredentials}
          >
            <Trash2 className="size-4" />
            Clear credentials
          </Button>
        )}
        <Button
          onClick={handleSave}
          disabled={!canSave || saveLoading}
          className="w-full sm:flex-1"
        >
          {saveLoading ? 'Saving\u2026' : saved ? 'Saved!' : 'Save'}
        </Button>
      </div>
    </div>
  )
}
