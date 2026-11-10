import { get } from '@vercel/blob'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const pathname = new URL(request.url).searchParams.get('pathname')
  if (!pathname || !pathname.startsWith(`invoices/${session.user.id}/`)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const result = await get(pathname, { access: 'private' })
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return new NextResponse(result.stream, { headers: { 'Content-Type': result.blob.contentType || 'application/octet-stream', 'Content-Disposition': `inline; filename="${result.blob.pathname.split('/').pop() || 'invoice'}"`, 'Cache-Control': 'private, no-cache', ETag: result.blob.etag } })
}
