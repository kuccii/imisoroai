import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { invoiceRecord, fiscalSale, auditEvent } from '@/lib/db/schema'
import { and, eq, or } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const reconciliationSchema = z.object({
  invoiceId: z.string().min(1).max(200),
  statementReference: z.string().trim().min(3).max(120),
  statementDate: z.string().date(),
  statementAmount: z.number().int().positive().max(1_000_000_000),
  confirmation: z.literal(true),
})

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [invoices] = await Promise.all([
    db.select().from(invoiceRecord).where(eq(invoiceRecord.userId, session.user.id)),
  ])

  const unmatched = invoices.filter(
    (invoice) => invoice.status === 'pending' || invoice.extractionStatus === 'manual entry needed'
  )

  const items = unmatched.map((invoice) => ({
    id: invoice.id,
    supplier: invoice.supplier,
    amount: invoice.amount,
    vat: invoice.vat,
    status: invoice.status,
    extractionStatus: invoice.extractionStatus,
    needsEvidence: true,
  }))

  return NextResponse.json({ items, matchMethod: 'invoice_evidence' })
}

export async function PATCH(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let input: unknown
  try {
    input = await request.json()
  } catch {
    return NextResponse.json({ error: 'Enter invoice ID, statement reference, date, amount, and confirmation.' }, { status: 400 })
  }

  const parsed = reconciliationSchema.safeParse(input)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter invoice ID, statement reference, date, amount, and confirmation.' }, { status: 400 })
  }

  const [invoice] = await db.select().from(invoiceRecord).where(and(
    eq(invoiceRecord.id, parsed.data.invoiceId),
    eq(invoiceRecord.userId, session.user.id),
  )).limit(1)

  if (!invoice) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 })

  if (invoice.amount !== parsed.data.statementAmount) {
    return NextResponse.json({ error: 'The statement amount must exactly match the invoice amount.' }, { status: 409 })
  }

  // Upsert: mark invoice as reviewed/ supported if confirmed
  await db.update(invoiceRecord).set({
    status: 'supported',
    extractionStatus: 'reviewed_manual',
  }).where(eq(invoiceRecord.id, parsed.data.invoiceId))

  // Log audit event
  await db.insert(auditEvent).values({
    id: `AUD-${crypto.randomUUID()}`,
    userId: session.user.id,
    action: 'invoice_reconciled',
    entityType: 'invoice_record',
    entityId: invoice.id,
    metadata: JSON.stringify({
      statementReference: parsed.data.statementReference,
      statementDate: parsed.data.statementDate,
      statementAmountRwf: parsed.data.statementAmount,
      verificationMethod: 'user_attested',
    }),
  })

  return NextResponse.json({ item: { id: invoice.id, supplier: invoice.supplier, status: 'supported' }, verificationMethod: 'user_attested' })
}