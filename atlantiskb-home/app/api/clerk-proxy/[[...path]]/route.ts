import { NextRequest, NextResponse } from 'next/server'

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade',
  // Node fetch auto-decompresses responses, so strip these to avoid
  // the browser trying to decompress an already-decompressed body
  'content-encoding', 'content-length',
])

// Derive Clerk FAPI base URL from the publishable key.
// Format: pk_test_{base64(frontendApi + "$")} or pk_live_{...}
const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? ''
const b64 = pk.replace(/^pk_(test|live)_/, '')
const frontendApi = Buffer.from(b64, 'base64').toString('utf-8').replace(/\$$/, '')
const CLERK_BASE = `https://${frontendApi}`

console.log('[clerk-proxy] base URL:', CLERK_BASE)

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const { path = [] } = await params
  const targetUrl = new URL(`/${path.join('/')}`, CLERK_BASE)
  targetUrl.search = request.nextUrl.search

  console.log('[clerk-proxy] incoming:', request.method, `/${path.join('/')}`)
  console.log('[clerk-proxy] target:', targetUrl.toString())

  const headers = new Headers()
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value)
  })
  headers.set('Host', new URL(CLERK_BASE).host)

  const hasBody = ['POST', 'PUT', 'PATCH'].includes(request.method)
  const response = await fetch(targetUrl.toString(), {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    ...(hasBody && { duplex: 'half' }),
  } as RequestInit)

  console.log('[clerk-proxy] response status:', response.status)

  const responseHeaders = new Headers()
  response.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) responseHeaders.set(key, value)
  })

  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  })
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const DELETE = handler
export const PATCH = handler
