import { auth } from '@/lib/auth'
import { readStoredFile } from '@/lib/storage'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const pathname = new URL(request.url).searchParams.get('pathname')
  if (!pathname || !pathname.startsWith(`invoices/${session.user.id}/`)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const file = await readStoredFile(pathname).catch(() => null)
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const filename = pathname.split('/').pop() || 'invoice'
  return new NextResponse(Buffer.from(file.bytes), {
    headers: {
      'Content-Type': file.contentType,
      'Content-Disposition': `inline; filename="${filename.replaceAll('"', '')}"`,
      'Cache-Control': 'private, no-cache',
      ...(file.etag ? { ETag: file.etag } : {}),
    },
  })
}
