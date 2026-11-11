import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { fiscalSale } from '@/lib/db/schema'
import { rraAvailability } from '@/lib/rra/availability'
import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const [sale] = await db.select({ id: fiscalSale.id }).from(fiscalSale).where(and(eq(fiscalSale.id, id), eq(fiscalSale.userId, session.user.id))).limit(1)
  if (!sale) return NextResponse.json({ error: 'Fiscal sale not found.' }, { status: 404 })
  if (!rraAvailability.canTransmit) {
    return NextResponse.json({ error: 'RRA transmission is disabled until all compliance gates are complete.', blockers: rraAvailability.blockers }, { status: 409 })
  }

  return NextResponse.json({ error: 'No verified RRA protocol adapter is installed.' }, { status: 503 })
}
