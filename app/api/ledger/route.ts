import { auth } from '@/lib/auth'
import { fiscalDraftsEnabled } from '@/lib/feature-flags'
import { db } from '@/lib/db'
import { auditEvent, businessTransaction } from '@/lib/db/schema'
import { and, desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const createSaleSchema = z.object({
  type: z.literal('sale'),
  counterparty: z.string().trim().min(2).max(160),
  amount: z.number().int().positive().max(2_000_000_000),
  reference: z.string().trim().max(120).optional().transform((value) => value || null),
  transactionDate: z.string().date(),
})

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user?.id ?? null
}

export async function GET() {
  if (!fiscalDraftsEnabled) return NextResponse.json({ error: 'This feature is unavailable.' }, { status: 404 })
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const transactions = await db
    .select()
    .from(businessTransaction)
    .where(and(eq(businessTransaction.userId, userId), eq(businessTransaction.type, 'sale')))
    .orderBy(desc(businessTransaction.transactionDate), desc(businessTransaction.createdAt))
    .limit(100)

  return NextResponse.json({ transactions })
}

export async function POST(request: Request) {
  if (!fiscalDraftsEnabled) return NextResponse.json({ error: 'This feature is unavailable.' }, { status: 404 })
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = createSaleSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a customer, positive gross amount, and valid sale date.' }, { status: 400 })
  }

  const id = `TXN-${crypto.randomUUID()}`
  const [transaction] = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(businessTransaction)
      .values({ ...parsed.data, id, userId, source: 'manual', status: 'unmatched' })
      .returning()

    await tx.insert(auditEvent).values({
      id: `AUD-${crypto.randomUUID()}`,
      userId,
      action: 'manual_sale_recorded',
      entityType: 'business_transaction',
      entityId: id,
      metadata: JSON.stringify({ amountRwf: created.amount, transactionDate: created.transactionDate }),
    })

    return [created]
  })

  return NextResponse.json({ transaction }, { status: 201 })
}
