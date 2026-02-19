/**
 * Remote Push via Firebase Cloud Messaging HTTP v1 API.
 *
 * Sending uses a Firebase service account to sign a short-lived JWT with the
 * browser-native Web Crypto API, then exchanges it for an OAuth2 access token
 * at oauth2.googleapis.com/token, and finally calls the FCM v1 REST endpoint.
 * No external library is required — pure fetch + Web Crypto.
 *
 * The Android side uses FirebaseMessagingService (stateless — FCM wakes the
 * app even when killed; no persistent connection needed).
 */

import {
  decryptPlaintext,
  encryptPlaintext,
  isEncryptedBlob,
} from './crypto-storage'
import type { EncryptedBlob } from './crypto-storage'

export interface ServiceAccount {
  type?: string
  project_id: string
  private_key_id?: string
  private_key: string
  client_email: string
  client_id?: string
  token_uri?: string
}

export interface FCMConfig {
  serviceAccount: ServiceAccount
  deviceToken: string
}

const STORAGE_KEY = 'pesamirror_fcm_config'
const SESSION_KEY = 'pesamirror_fcm_config_session'

function parsePlainConfig(raw: string): FCMConfig | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const sa = parsed.serviceAccount as ServiceAccount | undefined
    if (!sa || !sa.project_id || !sa.private_key || !sa.client_email) return null
    const token = parsed.deviceToken as string
    if (!token || !token.trim()) return null
    return parsed as unknown as FCMConfig
  } catch {
    return null
  }
}

/** True if stored config is passphrase-encrypted (requires unlock). */
export function isFCMConfigEncrypted(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw !== null && isEncryptedBlob(raw)
  } catch {
    return false
  }
}

/**
 * Load FCM config. Returns session-unlocked config if available, else plain
 * localStorage config. Returns null if storage is empty or encrypted and not unlocked.
 */
export function loadFCMConfig(): FCMConfig | null {
  try {
    const session = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(SESSION_KEY) : null
    if (session) {
      const parsed = parsePlainConfig(session)
      if (parsed) return parsed
    }
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    if (isEncryptedBlob(raw)) return null
    return parsePlainConfig(raw)
  } catch {
    return null
  }
}

/**
 * Unlock encrypted FCM config with passphrase. On success, decrypted config
 * is stored in sessionStorage for this tab so loadFCMConfig() returns it.
 */
export async function unlockFCMConfig(passphrase: string): Promise<boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw || !isEncryptedBlob(raw)) return false
    const blob = JSON.parse(raw) as EncryptedBlob
    const plain = await decryptPlaintext(blob, passphrase)
    const config = parsePlainConfig(plain)
    if (!config) return false
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(SESSION_KEY, plain)
    }
    return true
  } catch {
    return false
  }
}

/**
 * Save FCM config. If passphrase is provided, config is encrypted at rest.
 * Decrypted config is also written to sessionStorage so it's available without
 * unlocking again in this tab.
 */
export async function saveFCMConfig(
  config: FCMConfig,
  passphrase?: string,
): Promise<void> {
  const plain = JSON.stringify(config)
  if (passphrase && passphrase.trim()) {
    const blob = await encryptPlaintext(plain, passphrase.trim())
    localStorage.setItem(STORAGE_KEY, JSON.stringify(blob))
  } else {
    localStorage.setItem(STORAGE_KEY, plain)
  }
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(SESSION_KEY, plain)
  }
}

export function clearFCMConfig(): void {
  localStorage.removeItem(STORAGE_KEY)
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(SESSION_KEY)
  }
}

// ── JWT / OAuth2 helpers ─────────────────────────────────────────────────────

function base64url(input: Uint8Array | string): string {
  const bytes =
    typeof input === 'string' ? new TextEncoder().encode(input) : input
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function pemToBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/[\r\n\s]/g, '')
  const binary = atob(b64)
  const buf = new Uint8Array(binary.length)
  Array.from(binary).forEach((char, i) => {
    buf[i] = char.charCodeAt(0)
  })
  return buf.buffer
}

// Cache the access token (valid 60 min; refresh at 55 min to be safe)
let _tokenCache: { clientEmail: string; token: string; expiresAt: number } | null =
  null

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Date.now()
  if (
    _tokenCache &&
    _tokenCache.clientEmail === sa.client_email &&
    now < _tokenCache.expiresAt
  ) {
    return _tokenCache.token
  }

  const nowSec = Math.floor(now / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: sa.token_uri ?? 'https://oauth2.googleapis.com/token',
      iat: nowSec,
      exp: nowSec + 3600,
    }),
  )

  const sigInput = `${header}.${claims}`
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToBuffer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sigBytes = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(sigInput),
  )
  const jwt = `${sigInput}.${base64url(new Uint8Array(sigBytes))}`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  if (!tokenRes.ok) {
    const text = await tokenRes.text()
    throw new Error(`OAuth2 token error ${tokenRes.status}: ${text}`)
  }

  const { access_token } = (await tokenRes.json()) as { access_token: string }
  _tokenCache = {
    clientEmail: sa.client_email,
    token: access_token,
    expiresAt: now + 55 * 60 * 1000,
  }
  return access_token
}

// ── Public trigger ───────────────────────────────────────────────────────────

/**
 * Send a data-only FCM message to the Android device.
 * The message carries `data.body` (e.g. "SM|0712345678|1000") which the
 * Android FirebaseMessagingService parses and uses to execute the USSD flow.
 */
export async function triggerFCMEvent(
    config: FCMConfig,
  _event: string,
  data: Record<string, string>,
): Promise<void> {
  const accessToken = await getAccessToken(config.serviceAccount)
  const url = `https://fcm.googleapis.com/v1/projects/${config.serviceAccount.project_id}/messages:send`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        token: config.deviceToken,
        // data-only message: onMessageReceived() fires even when app is killed
        data: { body: data.body || '' },
        android: { priority: 'high' },
      },
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`FCM error ${response.status}: ${text}`)
  }
}
