import { auth } from '@/lib/auth'
import { getOcrSettings } from '@/lib/admin'
import { db } from '@/lib/db'
import { auditEvent, invoiceRecord } from '@/lib/db/schema'
import { classifyInvoiceOcrIssue, extractInvoiceDocument, type InvoiceMediaType } from '@/lib/invoice-ocr'
import { readStoredFile } from '@/lib/storage'
import { and, eq, lt, ne, or } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const updateSchema = z.object({
  status: z.enum(['supported', 'unsupported']),
  reviewNote: z.string().trim().min(10).max(500),
  invoiceNumber: z.string().trim().max(80),
  ebmEvidence: z.enum(['ebm_present', 'ebm_missing', 'unclear']),
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
    if (existing.extractionStatus === 'processing') return { kind: 'processing' as const }
    if (body.data.status === 'supported' && (!existing.blobPathname || body.data.tin.toUpperCase() === 'PENDING' || !body.data.invoiceNumber || body.data.invoiceNumber.toUpperCase() === 'UNKNOWN' || body.data.invoiceDate === 'UNKNOWN' || body.data.amount <= 0)) return { kind: 'incomplete' as const }

    const [invoice] = await tx.update(invoiceRecord).set({
      status: body.data.status,
      invoiceNumber: body.data.invoiceNumber,
      ebmEvidence: body.data.ebmEvidence,
      extractionStatus: existing.extractionStatus === 'extracted' ? 'extracted' : 'reviewed_manual',
      extractionNotes: existing.extractionStatus === 'extracted' ? existing.extractionNotes : '[]',
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
        before: { supplier: existing.supplier, tin: existing.tin, invoiceNumber: existing.invoiceNumber, invoiceDate: existing.invoiceDate, amount: existing.amount, vat: existing.vat, ebmEvidence: existing.ebmEvidence },
        after: { supplier: invoice.supplier, tin: invoice.tin, invoiceNumber: invoice.invoiceNumber, invoiceDate: invoice.invoiceDate, amount: invoice.amount, vat: invoice.vat, ebmEvidence: invoice.ebmEvidence, extractionStatus: invoice.extractionStatus },
      }),
    })

    return { kind: 'updated' as const, invoice }
  })

  if (result.kind === 'missing') return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 })
  if (result.kind === 'processing') return NextResponse.json({ error: 'The scan is still in progress. Wait for it to finish before reviewing these fields.' }, { status: 409 })
  if (result.kind === 'incomplete') return NextResponse.json({ error: 'Including an invoice in workpapers requires the original document, supplier TIN, invoice number, verified date, and positive RWF total.' }, { status: 409 })
  return NextResponse.json({ invoice: result.invoice })
}

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  const [existing] = await db.select().from(invoiceRecord).where(and(
    eq(invoiceRecord.id, id),
    eq(invoiceRecord.userId, session.user.id),
  )).limit(1)
  if (!existing) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 })
  if (!existing.blobPathname || !existing.contentType || !['application/pdf', 'image/jpeg', 'image/png'].includes(existing.contentType)) {
    return NextResponse.json({ error: 'The original invoice is not available for another scan.' }, { status: 409 })
  }
  const staleProcessingCutoff = new Date(Date.now() - 2 * 60 * 1000)
  if (existing.status !== 'pending') return NextResponse.json({ error: 'Only invoices awaiting review can be scanned again.' }, { status: 409 })
  if (existing.extractionStatus === 'extracted') return NextResponse.json({ error: 'This invoice has already been scanned.' }, { status: 409 })
  const ocrSettings = await getOcrSettings()
  if (!ocrSettings.enabled) return NextResponse.json({ error: 'Automatic extraction is turned off by the administrator.' }, { status: 409 })
  if (existing.extractionStatus === 'processing' && existing.updatedAt > staleProcessingCutoff) {
    return NextResponse.json({ error: 'A scan is still in progress. Wait two minutes after the upload before retrying.' }, { status: 409 })
  }

  const [claimed] = await db.update(invoiceRecord).set({ extractionStatus: 'processing', updatedAt: new Date() }).where(and(
    eq(invoiceRecord.id, id),
    eq(invoiceRecord.userId, session.user.id),
    eq(invoiceRecord.status, 'pending'),
    ne(invoiceRecord.extractionStatus, 'extracted'),
    or(ne(invoiceRecord.extractionStatus, 'processing'), lt(invoiceRecord.updatedAt, staleProcessingCutoff)),
  )).returning()
  if (!claimed) return NextResponse.json({ error: 'This invoice is already being scanned or has already been extracted.' }, { status: 409 })

  try {
    const stored = await readStoredFile(existing.blobPathname)
    if (!stored) throw new Error('Stored invoice is unavailable.')
    const bytes = Buffer.from(stored.bytes)
    if (bytes.length === 0 || bytes.length > 10 * 1024 * 1024) throw new Error('Stored invoice has an invalid size.')

    const extraction = await extractInvoiceDocument(bytes, existing.contentType as InvoiceMediaType, ocrSettings.model)
    const [invoice] = await db.transaction(async (tx) => {
      const [updated] = await tx.update(invoiceRecord).set({
        supplier: extraction.supplier || 'Unknown supplier',
        tin: extraction.tin || 'PENDING',
        invoiceDate: extraction.invoiceDate,
        invoiceNumber: extraction.invoiceNumber,
        amount: extraction.amount,
        vat: extraction.vat,
        currency: extraction.currency,
        extractionStatus: 'extracted',
        extractionConfidence: String(extraction.confidence),
        ebmEvidence: extraction.evidence,
        extractionNotes: JSON.stringify(extraction.notes),
        updatedAt: new Date(),
      }).where(and(eq(invoiceRecord.id, id), eq(invoiceRecord.userId, session.user.id), eq(invoiceRecord.status, 'pending'), eq(invoiceRecord.extractionStatus, 'processing'))).returning()
      if (!updated) throw new Error('Invoice scan state changed before extraction completed.')

      await tx.insert(auditEvent).values({
        id: `AUD-${crypto.randomUUID()}`,
        userId: session.user.id,
        action: 'invoice_extraction_retried',
        entityType: 'invoice',
        entityId: id,
        metadata: JSON.stringify({ extraction, ocrModel: ocrSettings.model, sourcePathname: existing.blobPathname, automatedEligibility: false }),
      })
      return [updated]
    })
    return NextResponse.json({ invoice, extractionFailed: false, requiresReview: true })
  } catch (error) {
    const issue = classifyInvoiceOcrIssue(error)
    console.error('[invoice-ocr] retry failed', { errorName: error instanceof Error ? error.name : 'UnknownError', issue, invoiceId: id })
    const note = issue === 'credits_required'
      ? 'AI Gateway paid credits are required to scan this file.'
      : issue === 'billing_required'
        ? 'AI Gateway needs a verified payment method before scanning.'
        : 'Automatic extraction could not read this file. Enter the details from the original.'
    const [invoice] = await db.update(invoiceRecord).set({
      extractionStatus: issue,
      extractionConfidence: null,
      extractionNotes: JSON.stringify([note]),
      updatedAt: new Date(),
    }).where(and(eq(invoiceRecord.id, id), eq(invoiceRecord.userId, session.user.id), eq(invoiceRecord.status, 'pending'), eq(invoiceRecord.extractionStatus, 'processing'))).returning()
    await db.insert(auditEvent).values({
      id: `AUD-${crypto.randomUUID()}`,
      userId: session.user.id,
      action: 'invoice_extraction_retry_failed',
      entityType: 'invoice',
      entityId: id,
      metadata: JSON.stringify({ issue, sourcePathname: existing.blobPathname }),
    })
    return NextResponse.json({ invoice, extractionFailed: true, ocrIssue: issue, requiresReview: true })
  }
}
