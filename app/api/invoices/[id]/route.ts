import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { auditEvent, invoiceRecord } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const updateSchema = z.object({
  status: z.enum(['supported', 'unsupported']),
  reviewNote: z.string().trim().min(10).max(500),
  supplier: z.string().trim().min(2).max(160),
  tin: z.string().trim().min(3).max(40),
  invoiceDate: z.union([z.string().date(), z.literal('UNKNOWN')]),
  amount: z.number().int().nonnegative().max(1_000_000_000),
  vat: z.number().int().nonnegative().max(1_000_000_000),
}).superRefine((input, context) => {
  if (input.vat > input.amount) context.addIssue({ code: 'custom', path: ['vat'], message: 'VAT cannot exceed the invoice total.' })
})

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let input: unknown
  try {
    input = await request.json()
  } catch {
    return NextResponse.json({ error: 'Enter a review decision and note.' }, { status: 400 })
  }
  const body = updateSchema.safeParse(input)
  if (!body.success) return NextResponse.json({ error: 'Choose a decision and provide a review note of at least 10 characters.' }, { status: 400 })

  const { id } = await context.params
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(invoiceRecord).where(and(
      eq(invoiceRecord.id, id),
      eq(invoiceRecord.userId, session.user.id),
    )).limit(1)
    if (!existing) return { kind: 'missing' as const }
    if (body.data.status === 'supported' && (!existing.blobPathname || body.data.tin.toUpperCase() === 'PENDING' || body.data.invoiceDate === 'UNKNOWN' || body.data.amount <= 0)) return { kind: 'incomplete' as const }

    const [invoice] = await tx.update(invoiceRecord).set({
      status: body.data.status,
      supplier: body.data.supplier,
      tin: body.data.tin,
      invoiceDate: body.data.invoiceDate,
      amount: body.data.amount,
      vat: body.data.vat,
      updatedAt: new Date(),
    }).where(and(
      eq(invoiceRecord.id, id),
      eq(invoiceRecord.userId, session.user.id),
    )).returning()
    if (!invoice) return { kind: 'missing' as const }

    await tx.insert(auditEvent).values({
      id: `AUD-${crypto.randomUUID()}`,
      userId: session.user.id,
      action: `invoice_review_${body.data.status}`,
      entityType: 'invoice',
      entityId: invoice.id,
      metadata: JSON.stringify({
        reviewNote: body.data.reviewNote,
        originalFilename: existing.originalFilename,
        sourcePathname: existing.blobPathname,
        decisionMethod: 'human_review',
        before: { supplier: existing.supplier, tin: existing.tin, invoiceDate: existing.invoiceDate, amount: existing.amount, vat: existing.vat },
        after: { supplier: invoice.supplier, tin: invoice.tin, invoiceDate: invoice.invoiceDate, amount: invoice.amount, vat: invoice.vat },
      }),
    })

    return { kind: 'updated' as const, invoice }
  })

  if (result.kind === 'missing') return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 })
  if (result.kind === 'incomplete') return NextResponse.json({ error: 'A supported decision requires the original document, a non-placeholder supplier TIN, a verified invoice date, and a positive invoice total.' }, { status: 409 })
  return NextResponse.json({ invoice: result.invoice })
}
