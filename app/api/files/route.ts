import { auth } from '@/lib/auth'
import { getClientContext } from '@/lib/client-workspace'
import { db } from '@/lib/db'
import { invoiceRecord } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { readStoredFile } from '@/lib/storage'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const params = new URL(request.url).searchParams
  const pathname = params.get('pathname')
  const requestedClientId = params.get('clientId') || `CL-PERSONAL-${session.user.id}`
  if (!pathname) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const client = await getClientContext(session.user, requestedClientId)
  if (!client || !client.consentActive) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const [document] = await db.select({ pathname: invoiceRecord.blobPathname }).from(invoiceRecord).where(and(
    eq(invoiceRecord.clientId, client.id),
    eq(invoiceRecord.blobPathname, pathname),
  )).limit(1)
  if (!document?.pathname) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const file = await readStoredFile(document.pathname).catch(() => null)
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const filename = document.pathname.split('/').pop() || 'invoice'
  return new NextResponse(Buffer.from(file.bytes), {
    headers: {
      'Content-Type': file.contentType,
      'Content-Disposition': `inline; filename="${filename.replaceAll('"', '')}"`,
      'Cache-Control': 'private, no-cache',
      ...(file.etag ? { ETag: file.etag } : {}),
    },
  })
}
