/**
 * Distributed rate limiting using Upstash Redis.
 * Falls back to a no-op (allow all) when Upstash env vars are not set,
 * preserving the existing local-dev behavior with no enforcement.
 */

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

function createRateLimiter(requests: number, window: `${number} s` | `${number} m`): Ratelimit | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  const redis = new Redis({ url, token })
  return new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(requests, window) })
}

const limiters = {
  jobRun: createRateLimiter(1, '60 s'),
  csvImport: createRateLimiter(5, '60 s'),
  enrichBatch: createRateLimiter(2, '60 s'),
  permitSync: createRateLimiter(2, '60 s'),
}

export type RateLimitProfile = keyof typeof limiters

export async function checkRateLimit(
  profile: RateLimitProfile,
  identifier: string,
): Promise<{ allowed: boolean; remaining?: number; reset?: number }> {
  const limiter = limiters[profile]
  if (!limiter) return { allowed: true }

  const result = await limiter.limit(identifier)
  return { allowed: result.success, remaining: result.remaining, reset: result.reset }
}
