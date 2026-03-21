import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { syncPermits, VALID_COUNTIES } from '@/lib/jobs/sync-permits'
import { estimatePermitValues } from '@/lib/jobs/estimate-permit-value'
import { db } from '@/lib/db'
import { checkRateLimit } from '@/lib/rate-limit'

// Cherokee and Cobb syncs launch headless Chrome browsers.
// Cherokee takes ~30 s; Cobb takes ~90–130 s (50 pages + 40+ detail pages).
// Set limit high enough for both to complete.
export const maxDuration = 300

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const county = typeof body.county === 'string' ? body.county : undefined

  // Validate county if provided
  if (county && !VALID_COUNTIES.includes(county)) {
    return NextResponse.json({ error: 'Invalid county' }, { status: 400 })
  }

  const rl = await checkRateLimit('permitSync', userId)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit: wait before running another permit sync' },
      {
        status: 429,
        headers: rl.reset ? { 'Retry-After': String(Math.ceil((rl.reset - Date.now()) / 1000)) } : {},
      },
    )
  }

  // Create a CrawlJob so the UI can track last-sync-per-county
  const job = await db.crawlJob.create({
    data: {
      sourceType: 'PERMIT',
      status: 'RUNNING',
      startedAt: new Date(),
      metadata: county ? { county } : { county: 'ALL' },
    },
  })

  try {
    // Step 1: Run the permit sync job (filtered by county when provided)
    const syncSummary = await syncPermits(county)

    // Step 2: Run AI value estimation on any newly created permits with no value
    const estimateResult = await estimatePermitValues()

    await db.crawlJob.update({
      where: { id: job.id },
      data: {
        status: 'COMPLETED',
        finishedAt: new Date(),
        recordsFound: syncSummary.totalFetched,
        recordsCreated: syncSummary.newPermits,
        recordsUpdated: syncSummary.updatedPermits,
      },
    })

    return NextResponse.json({
      ...syncSummary,
      estimation: estimateResult,
    })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    console.error('[permits/sync] failed:', err)

    await db.crawlJob.update({
      where: { id: job.id },
      data: { status: 'FAILED', finishedAt: new Date(), errorMessage },
    })

    return NextResponse.json({ error: 'Permit sync failed — please try again' }, { status: 500 })
  }
}
