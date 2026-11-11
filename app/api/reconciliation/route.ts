import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { auditEvent, businessTransaction } from '@/lib/db/schema'
import { and, eq, or } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const reconciliationSchema = z.object({
  transactionId: z.string().min(1).max(200),
  statementReference: z.string().trim().min(3).max(120),
  statementDate: z.string().date(),
  statementAmount: z.number().int().positive().max(1_000_000_000),
  confirmation: z.literal(true),
})

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const storedItems = await db.select().from(businessTransaction).where(and(
    eq(businessTransaction.userId, session.user.id),
    or(
      eq(businessTransaction.status, 'unmatched'),
      and(eq(businessTransaction.status, 'matched'), eq(businessTransaction.source, 'manual')),
    ),
  ))
  const items = storedItems.map((item) => ({ ...item, needsEvidence: true }))
  return NextResponse.json({ items, matchMethod: 'manual_evidence' })
}

export async function PATCH(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let input: unknown
  try {
    input = await request.json()
  } catch {
    return NextResponse.json({ error: 'Enter the bank or Mobile Money statement details.' }, { status: 400 })
  }

  const parsed = reconciliationSchema.safeParse(input)
  if (!parsed.success) return NextResponse.json({ error: 'Enter a statement reference, date, amount, and confirmation.' }, { status: 400 })

  const result = await db.transaction(async (tx) => {
    const [transaction] = await tx.select().from(businessTransaction).where(and(
      eq(businessTransaction.id, parsed.data.transactionId),
      eq(businessTransaction.userId, session.user.id),
      or(
        eq(businessTransaction.status, 'unmatched'),
        and(eq(businessTransaction.status, 'matched'), eq(businessTransaction.source, 'manual')),
      ),
    )).limit(1)
    if (!transaction) return { kind: 'missing' as const }
    if (transaction.amount !== parsed.data.statementAmount) return { kind: 'amount_mismatch' as const }

    const [item] = await tx.update(businessTransaction).set({ status: 'matched_with_evidence' }).where(and(
      eq(businessTransaction.id, transaction.id),
      eq(businessTransaction.userId, session.user.id),
      or(
        eq(businessTransaction.status, 'unmatched'),
        and(eq(businessTransaction.status, 'matched'), eq(businessTransaction.source, 'manual')),
      ),
    )).returning()
    if (!item) return { kind: 'missing' as const }

    await tx.insert(auditEvent).values({
      id: `AUD-${crypto.randomUUID()}`,
      userId: session.user.id,
      action: 'transaction_manually_reconciled',
      entityType: 'business_transaction',
      entityId: item.id,
      metadata: JSON.stringify({
        statementReference: parsed.data.statementReference,
        statementDate: parsed.data.statementDate,
        statementAmountRwf: parsed.data.statementAmount,
        verificationMethod: 'user_attested',
      }),
    })

    return { kind: 'matched' as const, item }
  })

  if (result.kind === 'missing') return NextResponse.json({ error: 'Unmatched transaction not found.' }, { status: 404 })
  if (result.kind === 'amount_mismatch') return NextResponse.json({ error: 'The statement amount must exactly match the transaction amount.' }, { status: 409 })
  return NextResponse.json({ item: result.item, verificationMethod: 'user_attested' })
}
