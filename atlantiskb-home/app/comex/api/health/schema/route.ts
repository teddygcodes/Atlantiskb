import { NextResponse } from 'next/server'
import { getComexSchemaReadiness } from '@/lib/comex/schema-readiness'

export async function GET(): Promise<Response> {
  const readiness = await getComexSchemaReadiness()
  const status = readiness.ready ? 200 : 503

  return NextResponse.json(readiness, { status })
}
