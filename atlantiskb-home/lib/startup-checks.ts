/**
 * Startup validation — logs warnings for missing required configuration.
 * Called once from instrumentation.ts (Next.js App Router startup hook).
 * Never throws — missing keys produce log output only.
 */

const REQUIRED_KEYS: Array<{ key: string; description: string; severity: 'required' | 'optional' }> = [
  { key: 'DATABASE_URL', description: 'Primary DB connection', severity: 'required' },
  { key: 'CLERK_SECRET_KEY', description: 'Clerk auth', severity: 'required' },
  { key: 'CRON_SECRET', description: 'Cron endpoint protection', severity: 'required' },
  { key: 'ANTHROPIC_API_KEY', description: 'AI enrichment', severity: 'optional' },
  { key: 'GOOGLE_PLACES_API_KEY', description: 'Google Places enrichment', severity: 'optional' },
  { key: 'UPSTASH_REDIS_REST_URL', description: 'Distributed rate limiting', severity: 'optional' },
  { key: 'UPSTASH_REDIS_REST_TOKEN', description: 'Distributed rate limiting', severity: 'optional' },
]

export function validateStartupConfig(): void {
  for (const { key, description, severity } of REQUIRED_KEYS) {
    if (!process.env[key]) {
      if (severity === 'required') {
        console.error(`[startup] MISSING required env var: ${key} (${description})`)
      } else {
        console.warn(`[startup] missing optional env var: ${key} (${description}) — feature disabled`)
      }
    }
  }
}
