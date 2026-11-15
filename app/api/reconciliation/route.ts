import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { auditEvent, businessTransaction, invoiceRecord } from '@/lib/db/schema'
import { and, desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const reconciliationSchema = z.object({
  recordId: z.string().min(1).max(200),
  recordType: z.enum(['invoice', 'business_transaction']),
  statementReference: z.string().trim().min(3).max(120),
  statementDate: z.string().date(),
  statementAmount: z.number().int().positive().max(1_000_000_000),
  confirmation: z.literal(true),
})

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id
  const [invoices, transactions] = await Promise.all([
    db.select().from(invoiceRecord).where(eq(invoiceRecord.userId, userId)),
    db.select().from(businessTransaction).where(and(
      eq(businessTransaction.userId, userId),
      eq(businessTransaction.status, 'unmatched'),
    )).orderBy(desc(businessTransaction.transactionDate)),
  ])

  const invoiceItems = invoices
    .filter((invoice) => invoice.status === 'pending' || invoice.extractionStatus === 'manual entry needed')
    .map((invoice) => ({
      id: invoice.id,
      recordType: 'invoice' as const,
      counterparty: invoice.supplier,
      amount: invoice.amount,
      transactionDate: invoice.invoiceDate,
      needsEvidence: true,
    }))

  const transactionItems = transactions.map((transaction) => ({
    id: transaction.id,
    recordType: 'business_transaction' as const,
    counterparty: transaction.counterparty,
    amount: transaction.amount,
    transactionDate: transaction.transactionDate,
    needsEvidence: true,
  }))

  return NextResponse.json({ items: [...invoiceItems, ...transactionItems], matchMethod: 'user_attested_statement_evidence' })
}

export async function PATCH(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = reconciliationSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter the record, statement reference, date, amount, and confirmation.' }, { status: 400 })
  }

  const { recordId, recordType, statementReference, statementDate, statementAmount } = parsed.data
  const userId = session.user.id

  if (recordType === 'invoice') {
    const [invoice] = await db.select().from(invoiceRecord).where(and(
      eq(invoiceRecord.id, recordId),
      eq(invoiceRecord.userId, userId),
    )).limit(1)

    if (!invoice) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 })
    if (invoice.amount !== statementAmount) {
      return NextResponse.json({ error: 'The statement amount must exactly match the invoice amount.' }, { status: 409 })
    }

    const [updated] = await db.update(invoiceRecord).set({
      status: 'supported',
      extractionStatus: 'reviewed_manual',
    }).where(and(eq(invoiceRecord.id, recordId), eq(invoiceRecord.userId, userId))).returning({ id: invoiceRecord.id })

    if (!updated) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 })
  } else {
    const [transaction] = await db.select().from(businessTransaction).where(and(
      eq(businessTransaction.id, recordId),
      eq(businessTransaction.userId, userId),
    )).limit(1)

    if (!transaction) return NextResponse.json({ error: 'Transaction not found.' }, { status: 404 })
    if (transaction.amount !== statementAmount) {
      return NextResponse.json({ error: 'The statement amount must exactly match the recorded sale amount.' }, { status: 409 })
    }
    if (transaction.status !== 'unmatched') {
      return NextResponse.json({ error: 'This transaction already has statement evidence.' }, { status: 409 })
    }

    const [updated] = await db.update(businessTransaction).set({ status: 'matched' }).where(and(
      eq(businessTransaction.id, recordId),
      eq(businessTransaction.userId, userId),
      eq(businessTransaction.status, 'unmatched'),
    )).returning({ id: businessTransaction.id })

    if (!updated) return NextResponse.json({ error: 'This transaction already has statement evidence.' }, { status: 409 })
  }

  await db.insert(auditEvent).values({
    id: `AUD-${crypto.randomUUID()}`,
    userId,
    action: 'statement_evidence_recorded',
    entityType: recordType,
    entityId: recordId,
    metadata: JSON.stringify({
      statementReference,
      statementDate,
      statementAmountRwf: statementAmount,
      verificationMethod: 'user_attested',
    }),
  })

  return NextResponse.json({ item: { id: recordId, recordType, status: recordType === 'invoice' ? 'supported' : 'matched' }, verificationMethod: 'user_attested' })
}
