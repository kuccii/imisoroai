import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { businessTransaction, invoiceRecord, fiscalSale, fiscalSubmission, profile } from '@/lib/db/schema'
import { and, eq, gte, lt } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)

function parseExtractionNotes(value: string) {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((note): note is string => typeof note === 'string').slice(0, 8) : []
  } catch {
    return []
  }
}

function isValidIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const period = new URL(request.url).searchParams.get('period') || new Date().toISOString().slice(0, 7)
  if (!periodSchema.safeParse(period).success) return NextResponse.json({ error: 'Use a valid reporting period in YYYY-MM format.' }, { status: 400 })

  const from = `${period}-01`
  const endDate = new Date(`${from}T00:00:00.000Z`)
  endDate.setUTCMonth(endDate.getUTCMonth() + 1)
  const until = endDate.toISOString().slice(0, 10)
  const userId = session.user.id

  const [allInvoices, storedFiscalizedSales, submissions, [business], storedManualSales] = await Promise.all([
    db.select().from(invoiceRecord).where(eq(invoiceRecord.userId, userId)),
    db.select().from(fiscalSale).where(and(eq(fiscalSale.userId, userId), eq(fiscalSale.status, 'fiscalized'), gte(fiscalSale.saleDate, from), lt(fiscalSale.saleDate, until))),
    db.select().from(fiscalSubmission).where(and(eq(fiscalSubmission.userId, userId), eq(fiscalSubmission.status, 'fiscalized'))),
    db.select().from(profile).where(eq(profile.userId, userId)),
    db.select().from(businessTransaction).where(and(
      eq(businessTransaction.userId, userId),
      eq(businessTransaction.type, 'sale'),
      gte(businessTransaction.transactionDate, from),
      lt(businessTransaction.transactionDate, until),
    )),
  ])


  const invoices = allInvoices.filter((invoice) => isValidIsoDate(invoice.invoiceDate) && invoice.invoiceDate >= from && invoice.invoiceDate < until)
  const undatedInvoices = allInvoices.filter((invoice) => !isValidIsoDate(invoice.invoiceDate))
  const eligiblePurchases = invoices.filter((invoice) => invoice.status === 'supported')
  const outstandingReview = invoices.filter((invoice) => invoice.status === 'pending')
  const unsupported = invoices.filter((invoice) => invoice.status === 'unsupported')
  const scanIssues = invoices.filter((invoice) => invoice.status !== 'unsupported' && ['credits_required', 'billing_required', 'unavailable', 'legacy'].includes(invoice.extractionStatus))
  const submissionBySale = new Map(submissions.map((submission) => [submission.saleId, submission]))
  const fiscalizedSales = storedFiscalizedSales.filter((sale) => {
    const submission = submissionBySale.get(sale.id)
    return Boolean(submission?.fiscalReceiptNumber && submission.externalCorrelationId)
  })
  const taxpayerTin = business?.tin && business.tin !== 'PENDING' ? business.tin : ''
  const recordedSales = storedManualSales.map((sale) => ({
    id: sale.id,
    transactionDate: sale.transactionDate,
    counterparty: sale.counterparty,
    reference: sale.reference,
    amountRwf: sale.amount,
  }))
  const workpaperInvoices = (rows: typeof allInvoices) => rows.map((invoice) => ({
    id: invoice.id,
    invoiceDate: invoice.invoiceDate,
    supplier: invoice.supplier,
    supplierTin: invoice.tin,
    invoiceNumber: invoice.invoiceNumber,
    currency: invoice.currency,
    amountRwf: invoice.amount,
    vatRwf: invoice.vat,
    ebmEvidence: invoice.ebmEvidence,
    reviewStatus: invoice.status,
    extractionStatus: invoice.extractionStatus,
    extractionConfidence: invoice.extractionConfidence === null ? null : Number(invoice.extractionConfidence),
    extractionNotes: parseExtractionNotes(invoice.extractionNotes),
    originalFilename: invoice.originalFilename,
  }))
  const verifiedFiscalizedSales = fiscalizedSales.map((sale) => ({
    id: sale.id,
    saleDate: sale.saleDate,
    counterparty: sale.counterparty,
    totalRwf: sale.totalRwf,
    fiscalReceiptNumber: submissionBySale.get(sale.id)?.fiscalReceiptNumber ?? '',
  }))
  const reviewedPurchaseVatRwf = eligiblePurchases.reduce((total, invoice) => total + invoice.vat, 0)
  const fiscalizedSalesGrossRwf = verifiedFiscalizedSales.reduce((total, sale) => total + sale.totalRwf, 0)
  const manualSalesGrossRwf = recordedSales.reduce((total, sale) => total + sale.amountRwf, 0)
  const scanIssueCount = scanIssues.length + undatedInvoices.length

  return NextResponse.json({
    period,
    generatedAt: new Date().toISOString(),
    notice: 'Preparation workpaper only. Verify figures and complete filing in RRA eTax.',
    taxpayer: { businessName: business?.businessName ?? '', tin: taxpayerTin },
    purchaseInvoices: workpaperInvoices(invoices),
    undatedPurchaseInvoices: workpaperInvoices(undatedInvoices),
    recordedSales,
    fiscalizedSales: verifiedFiscalizedSales,
    totals: {
      purchaseInvoiceCount: invoices.length,
      undatedPurchaseCount: undatedInvoices.length,
      pendingReviewCount: outstandingReview.length,
      reviewedPurchaseVatRwf,
      fiscalizedSalesGrossRwf,
      manualSalesGrossRwf,
    },
    checklist: [
      { id: 'period', label: 'Choose the filing period and prepare a pack', status: 'ready' },
      { id: 'invoice-scan', label: 'Resolve scan issues and verify invoice numbers, TINs, dates, and EBM evidence', status: scanIssueCount ? 'blocked' : 'ready' },
      { id: 'review', label: 'Review purchase invoices and VAT evidence', status: outstandingReview.length ? 'blocked' : 'ready' },
      { id: 'sales', label: 'Reconcile sales with EBM/EIS records', status: recordedSales.length ? 'blocked' : verifiedFiscalizedSales.length ? 'ready' : 'required' },
      { id: 'submit', label: 'Complete and submit the return in RRA eTax', status: 'external' },
    ],
  })

}
