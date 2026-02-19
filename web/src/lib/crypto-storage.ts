/**
 * Passphrase-based encryption for sensitive localStorage data.
 * Uses AES-GCM (256-bit) with a key derived from the passphrase via PBKDF2.
 * All binary data is stored as base64url.
 */

const PBKDF2_ITERATIONS = 260_000
const SALT_LENGTH = 16
const IV_LENGTH = 12
const KEY_LENGTH = 256

export interface EncryptedBlob {
  v: 1
  enc: string
  iv: string
  salt: string
}

function base64urlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey'],
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptPlaintext(
  plaintext: string,
  passphrase: string,
): Promise<EncryptedBlob> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const key = await deriveKey(passphrase, salt)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  )
  return {
    v: 1,
    enc: base64urlEncode(new Uint8Array(ciphertext)),
    iv: base64urlEncode(iv),
    salt: base64urlEncode(salt),
  }
}

export async function decryptPlaintext(
  blob: EncryptedBlob,
  passphrase: string,
): Promise<string> {
  const salt = base64urlDecode(blob.salt)
  const iv = base64urlDecode(blob.iv)
  const ciphertext = base64urlDecode(blob.enc)
  const key = await deriveKey(passphrase, salt)
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  )
  return new TextDecoder().decode(decrypted)
}

export function isEncryptedBlob(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return parsed?.v === 1 && typeof parsed?.enc === 'string' && typeof parsed?.iv === 'string' && typeof parsed?.salt === 'string'
  } catch {
    return false
  }
}
