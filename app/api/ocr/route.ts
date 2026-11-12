import { auth } from '@/lib/auth'
import { getOcrSettings } from '@/lib/admin'
import { db } from '@/lib/db'
import { auditEvent, invoiceRecord } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { classifyInvoiceOcrIssue, extractInvoiceDocument, type InvoiceExtraction, type InvoiceMediaType } from '@/lib/invoice-ocr'
import { deleteStoredFile, storeFile } from '@/lib/storage'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

function hasExpectedSignature(bytes: Buffer, contentType: string) {
  if (contentType === 'application/pdf') return bytes.subarray(0, 5).toString() === '%PDF-'
  if (contentType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (contentType === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  return false
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Attach a PDF, JPG, or PNG invoice.' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Attach a PDF, JPG, or PNG invoice.' }, { status: 400 })
  if (file.size === 0 || file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'Files must be between 1 byte and 10MB.' }, { status: 400 })
  if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) return NextResponse.json({ error: 'Only PDF, JPG, and PNG invoices are supported.' }, { status: 415 })

  const bytes = Buffer.from(await file.arrayBuffer())
  if (!hasExpectedSignature(bytes, file.type)) return NextResponse.json({ error: 'The file content does not match its declared type.' }, { status: 415 })

  const id = `INV-${crypto.randomUUID()}`
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-120)
  let blobPathname: string | null = null
  let blobUrl: string | null = null
  let persisted = false
  let stage: 'storage' | 'database' | 'extraction' = 'storage'

  try {
    const blob = await storeFile(`invoices/${session.user.id}/${id}-${safeName}`, bytes, file.type)
    blobPathname = blob.pathname
    blobUrl = blob.url

    stage = 'database'
    await db.transaction(async (tx) => {
      const [saved] = await tx.insert(invoiceRecord).values({
        id,
        userId: session.user.id,
        supplier: 'Unknown supplier',
        tin: 'PENDING',
        invoiceDate: 'UNKNOWN',
        invoiceNumber: 'UNKNOWN',
        amount: 0,
        vat: 0,
        currency: 'RWF',
        status: 'pending',
        blobPathname,
        originalFilename: file.name,
        contentType: file.type,
        extractionStatus: 'processing',
        extractionConfidence: null,
        ebmEvidence: 'unclear',
        extractionNotes: JSON.stringify(['Scan is in progress.']),
      }).returning()

      await tx.insert(auditEvent).values({
        id: `AUD-${crypto.randomUUID()}`,
        userId: session.user.id,
        action: 'invoice_uploaded_for_human_review',
        entityType: 'invoice',
        entityId: id,
        metadata: JSON.stringify({ originalFilename: file.name, sourcePathname: blobPathname, extractionStatus: 'processing', automatedEligibility: false }),
      })
      return [saved]
    })
    persisted = true

    stage = 'extraction'
    const ocrSettings = await getOcrSettings()
    let extraction: InvoiceExtraction | null = null
    let ocrIssue: 'credits_required' | 'billing_required' | 'unavailable' | null = null
    if (ocrSettings.enabled) {
      try {
        extraction = await extractInvoiceDocument(bytes, file.type as InvoiceMediaType, ocrSettings.model)
      } catch (error) {
        ocrIssue = classifyInvoiceOcrIssue(error)
        console.error('[invoice-ocr] extraction failed', {
          errorName: error instanceof Error ? error.name : 'UnknownError',
          ocrIssue,
          model: ocrSettings.model,
          contentType: file.type,
          fileSize: file.size,
        })
      }
    }

    const extractionFailed = extraction === null
    const invoiceData = extraction ?? {
      supplier: 'Unknown supplier',
      tin: 'PENDING',
      invoiceDate: 'UNKNOWN',
      invoiceNumber: 'UNKNOWN',
      amount: 0,
      vat: 0,
      currency: 'RWF',
      confidence: 0,
      evidence: 'unclear' as const,
      notes: [!ocrSettings.enabled
        ? 'Automatic extraction is turned off by the administrator. Enter the values from the original document.'
        : ocrIssue === 'credits_required'
          ? 'AI Gateway paid credits are required to scan this file.'
          : ocrIssue === 'billing_required'
            ? 'AI Gateway needs a verified payment method before scanning.'
            : 'Automatic extraction could not read this file. Enter the values from the original document.'],
    }

    const [invoice] = await db.transaction(async (tx) => {
      const [updated] = await tx.update(invoiceRecord).set({
        supplier: invoiceData.supplier || 'Unknown supplier',
        tin: invoiceData.tin || 'PENDING',
        invoiceDate: invoiceData.invoiceDate,
        invoiceNumber: invoiceData.invoiceNumber,
        amount: invoiceData.amount,
        vat: invoiceData.vat,
        currency: invoiceData.currency,
        extractionStatus: extraction ? 'extracted' : ocrSettings.enabled ? ocrIssue || 'unavailable' : 'admin_disabled',
        extractionConfidence: extraction ? String(invoiceData.confidence) : null,
        ebmEvidence: invoiceData.evidence,
        extractionNotes: JSON.stringify(invoiceData.notes),
        updatedAt: new Date(),
      }).where(and(eq(invoiceRecord.id, id), eq(invoiceRecord.userId, session.user.id))).returning()

      await tx.insert(auditEvent).values({
        id: `AUD-${crypto.randomUUID()}`,
        userId: session.user.id,
        action: extraction ? 'invoice_extraction_completed' : 'invoice_extraction_failed',
        entityType: 'invoice',
        entityId: id,
        metadata: JSON.stringify({ extraction, extractionFailed, ocrIssue, ocrModel: ocrSettings.model, ocrEnabled: ocrSettings.enabled, sourcePathname: blobPathname, automatedEligibility: false }),
      })
      return [updated]
    })

    return NextResponse.json({ invoice, extraction: extractionFailed ? null : extraction, extractionFailed, ocrIssue, requiresReview: true }, { status: 201 })
  } catch (error) {
    console.error('[invoice-ocr] upload failed', {
      stage,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      contentType: file.type,
      fileSize: file.size,
    })
    if (blobPathname && !persisted) await deleteStoredFile({ pathname: blobPathname, url: blobUrl ?? undefined }).catch(() => undefined)
    const message = stage === 'storage'
      ? 'Private invoice storage is temporarily unavailable. Try again shortly.'
      : stage === 'database'
        ? 'The file could not be saved to your invoice records. Your upload was not completed; please try again.'
        : 'The invoice was saved, but its scan could not finish. Open the invoice inbox and retry from the saved original.'
    const status = stage === 'storage' || stage === 'extraction' ? 503 : 500
    return NextResponse.json({ error: message, saved: persisted, invoiceId: persisted ? id : undefined }, { status })
  }
}
