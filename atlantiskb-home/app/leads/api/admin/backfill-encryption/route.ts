/**
 * POST /leads/api/admin/backfill-encryption
 *
 * One-time backfill: encrypts plaintext PII fields in Company and Contact rows.
 * Safe to run multiple times — skips rows that are already encrypted.
 * Restricted to admin user IDs defined in ADMIN_USER_IDS env var (comma-separated).
 *
 * Usage:
 *   curl -X POST https://your-domain.com/leads/api/admin/backfill-encryption \
 *     -H "Authorization: Bearer <clerk-session-token>"
 *
 * Deploy sequence:
 *   1. Deploy PR 3 (write paths encrypt new rows)
 *   2. Hit this route once to encrypt existing rows
 *   3. Confirm via DB: SELECT phone FROM "Company" LIMIT 1 — should be ciphertext
 *   4. Deploy PR 4 (read paths decrypt)
 */

import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { encrypt, hmacToken } from '@/lib/crypto'

const BATCH_SIZE = 100

// Detect whether a value is already encrypted (iv:cipher:tag format)
function isEncrypted(value: string | null | undefined): boolean {
  if (!value) return false
  return value.split(':').length === 3
}

export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminIds = (process.env.ADMIN_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (adminIds.length > 0 && !adminIds.includes(userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let companyRows = 0
  let contactRows = 0
  let companySkipped = 0
  let contactSkipped = 0

  // --- Backfill Company rows ---
  let cursor: string | undefined
  for (;;) {
    const batch = await db.company.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: { id: true, phone: true, email: true, street: true },
    })
    if (batch.length === 0) break
    cursor = batch[batch.length - 1].id

    for (const row of batch) {
      const needsEncrypt = [row.phone, row.email, row.street].some(
        (v) => v != null && !isEncrypted(v),
      )
      if (!needsEncrypt) { companySkipped++; continue }

      await db.company.update({
        where: { id: row.id },
        data: {
          phone: row.phone && !isEncrypted(row.phone) ? encrypt(row.phone) : undefined,
          phoneHmac: row.phone && !isEncrypted(row.phone) ? hmacToken(row.phone) : undefined,
          email: row.email && !isEncrypted(row.email) ? encrypt(row.email) : undefined,
          street: row.street && !isEncrypted(row.street) ? encrypt(row.street) : undefined,
        },
      })
      companyRows++
    }
  }

  // --- Backfill Contact rows ---
  let contactCursor: string | undefined
  for (;;) {
    const batch = await db.contact.findMany({
      take: BATCH_SIZE,
      ...(contactCursor ? { skip: 1, cursor: { id: contactCursor } } : {}),
      orderBy: { id: 'asc' },
      select: { id: true, name: true, phone: true, email: true },
    })
    if (batch.length === 0) break
    contactCursor = batch[batch.length - 1].id

    for (const row of batch) {
      const needsEncrypt = [row.name, row.phone, row.email].some(
        (v) => v != null && !isEncrypted(v),
      )
      if (!needsEncrypt) { contactSkipped++; continue }

      await db.contact.update({
        where: { id: row.id },
        data: {
          name: row.name && !isEncrypted(row.name) ? encrypt(row.name) : undefined,
          phone: row.phone && !isEncrypted(row.phone) ? encrypt(row.phone) : undefined,
          email: row.email && !isEncrypted(row.email) ? encrypt(row.email) : undefined,
        },
      })
      contactRows++
    }
  }

  return NextResponse.json({
    success: true,
    companies: { encrypted: companyRows, skipped: companySkipped },
    contacts: { encrypted: contactRows, skipped: contactSkipped },
  })
}
