/**
 * Application-level field encryption using AES-256-GCM.
 * Uses Node.js built-in crypto — no external dependency required.
 *
 * Required env vars:
 *   ENCRYPTION_KEY  64-char hex string (32 bytes) — generate: openssl rand -hex 32
 *   HMAC_KEY        64-char hex string (32 bytes) — generate: openssl rand -hex 32
 *
 * WARNING: If ENCRYPTION_KEY is lost, all encrypted data is unrecoverable.
 * Store it in Vercel Encrypted Environment Variables or a secrets manager.
 */

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto'

function getKey(envVar: string): Buffer | null {
  const hex = process.env[envVar]
  if (!hex) return null
  const buf = Buffer.from(hex, 'hex')
  return buf.length === 32 ? buf : null
}

/**
 * Encrypt a string field. Returns "iv_b64:cipher_b64:tag_b64" or null if value is null/undefined.
 * Returns the original value unchanged if ENCRYPTION_KEY is not configured.
 */
export function encrypt(value: string | null | undefined): string | null {
  if (value == null) return null
  const key = getKey('ENCRYPTION_KEY')
  if (!key) return value // passthrough when key not configured

  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}:${encrypted.toString('base64')}:${tag.toString('base64')}`
}

/**
 * Decrypt a value produced by encrypt(). Returns null on failure (bad key, corrupted data).
 * Returns the original value unchanged if it doesn't look like ciphertext (migration safety).
 */
export function decrypt(value: string | null | undefined): string | null {
  if (value == null) return null
  const key = getKey('ENCRYPTION_KEY')
  if (!key) return value // passthrough when key not configured

  // If value doesn't look like ciphertext (two colons), treat as plaintext (pre-migration row)
  const parts = value.split(':')
  if (parts.length !== 3) return value

  try {
    const [ivB64, encB64, tagB64] = parts
    const iv = Buffer.from(ivB64, 'base64')
    const enc = Buffer.from(encB64, 'base64')
    const tag = Buffer.from(tagB64, 'base64')
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return decipher.update(enc).toString('utf8') + decipher.final('utf8')
  } catch {
    return null
  }
}

/**
 * HMAC-SHA256 deterministic lookup token for filter fields.
 * Same plaintext always produces the same hex token — enables WHERE queries
 * on fields whose plaintext is encrypted (e.g. phone deduplication).
 * Returns null if value is null/undefined or HMAC_KEY is not configured.
 */
export function hmacToken(value: string | null | undefined): string | null {
  if (value == null) return null
  const hmacKey = process.env.HMAC_KEY
  if (!hmacKey) return null
  return createHmac('sha256', hmacKey).update(value).digest('hex')
}
