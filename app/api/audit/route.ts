import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { auditEvent } from '@/lib/db/schema'
import { desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const events = await db.select().from(auditEvent).where(eq(auditEvent.userId, session.user.id)).orderBy(desc(auditEvent.createdAt)).limit(100)
  return NextResponse.json({ events })
}
