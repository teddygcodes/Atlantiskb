import { NextRequest, NextResponse } from 'next/server'

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade',
])

const CLERK_BASE = 'https://frontier-api.clerk.services'

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const { path = [] } = await params
  const targetUrl = new URL(`/${path.join('/')}`, CLERK_BASE)
  targetUrl.search = request.nextUrl.search

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
