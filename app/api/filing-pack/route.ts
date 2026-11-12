import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { businessTransaction, fiscalSale, fiscalSubmission, invoiceRecord, profile } from '@/lib/db/schema'
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
  if (!periodSchema.safeParse(period).success) return NextResponse.json({ error: 'Use a valid filing period in YYYY-MM format.' }, { status: 400 })

  const from = `${period}-01`
  const endDate = new Date(`${from}T00:00:00.000Z`)
  endDate.setUTCMonth(endDate.getUTCMonth() + 1)
  const until = endDate.toISOString().slice(0, 10)
  const userId = session.user.id
  const [allInvoices, transactions, storedFiscalizedSales, submissions, [business]] = await Promise.all([
    db.select().from(invoiceRecord).where(eq(invoiceRecord.userId, userId)),
    db.select().from(businessTransaction).where(and(eq(businessTransaction.userId, userId), gte(businessTransaction.transactionDate, from), lt(businessTransaction.transactionDate, until))),
    db.select().from(fiscalSale).where(and(eq(fiscalSale.userId, userId), eq(fiscalSale.status, 'fiscalized'), gte(fiscalSale.saleDate, from), lt(fiscalSale.saleDate, until))),
    db.select().from(fiscalSubmission).where(and(eq(fiscalSubmission.userId, userId), eq(fiscalSubmission.status, 'fiscalized'))),
    db.select().from(profile).where(eq(profile.userId, userId)),
  ])

  const invoices = allInvoices.filter((invoice) => isValidIsoDate(invoice.invoiceDate) && invoice.invoiceDate >= from && invoice.invoiceDate < until)
  const undatedInvoices = allInvoices.filter((invoice) => !isValidIsoDate(invoice.invoiceDate))
  const eligiblePurchases = invoices.filter((invoice) => invoice.status === 'supported')
  const outstandingReview = invoices.filter((invoice) => invoice.status === 'pending')
  const unsupported = invoices.filter((invoice) => invoice.status === 'unsupported')
  const scanIssues = invoices.filter((invoice) => invoice.status !== 'unsupported' && ['credits_required', 'billing_required', 'unavailable', 'legacy'].includes(invoice.extractionStatus))
  const sales = transactions.filter((transaction) => transaction.type === 'sale')
  const submissionBySale = new Map(submissions.map((submission) => [submission.saleId, submission]))
  const fiscalizedSales = storedFiscalizedSales.filter((sale) => {
    const submission = submissionBySale.get(sale.id)
    return Boolean(submission?.fiscalReceiptNumber && submission.externalCorrelationId)
  })
  const taxpayerTin = business?.tin && business.tin !== 'PENDING' ? business.tin : null

  return NextResponse.json({
    preparationOnly: true,
    submissionSupported: false,
    period,
    generatedAt: new Date().toISOString(),
    taxpayer: { businessName: business?.businessName || null, tin: taxpayerTin },
    totals: {
      purchaseInvoiceCount: invoices.length,
      undatedPurchaseCount: undatedInvoices.length,
      supportedPurchaseCount: eligiblePurchases.length,
      pendingReviewCount: outstandingReview.length,
      scanIssueCount: scanIssues.length,
      unsupportedPurchaseCount: unsupported.length,
      reviewedPurchaseVatRwf: eligiblePurchases.reduce((sum, invoice) => sum + invoice.vat, 0),
      salesCount: sales.length,
      manualSalesGrossRwf: sales.reduce((sum, transaction) => sum + transaction.amount, 0),
      fiscalizedSalesCount: fiscalizedSales.length,
      fiscalizedSalesGrossRwf: fiscalizedSales.reduce((sum, sale) => sum + sale.totalRwf, 0),
      outputVatStatus: 'not_calculated',
    },
    checklist: [
      { id: 'taxpayer', label: 'Confirm taxpayer TIN and period in RRA eTax', status: taxpayerTin ? 'review' : 'blocked' },
      { id: 'invoice-scan', label: 'Resolve scan issues and verify invoice numbers, TINs, dates, and EBM evidence', status: scanIssues.length || outstandingReview.length ? 'review' : 'ready' },
      { id: 'purchases', label: 'Check reviewed purchase invoices against the current VAT annexure', status: outstandingReview.length || unsupported.length || undatedInvoices.length ? 'review' : 'ready' },
      { id: 'sales', label: 'Reconcile sales with EBM/EIS records and output VAT', status: 'required' },
      { id: 'fiscalized-sales', label: 'Verify fiscalized sales and RRA receipt numbers', status: fiscalizedSales.length ? 'review' : 'required' },
      { id: 'submit', label: 'Review and submit the return in RRA eTax', status: 'external' },
    ],
    purchaseInvoices: invoices.map(({ id, supplier, tin, invoiceNumber, currency, invoiceDate, amount, vat, status, ebmEvidence, extractionStatus, extractionConfidence, extractionNotes, originalFilename }) => ({ id, supplier, supplierTin: tin, invoiceNumber, currency, invoiceDate, amountRwf: amount, vatRwf: vat, ebmEvidence, extractionStatus, extractionConfidence: extractionConfidence === null ? null : Number(extractionConfidence), extractionNotes: parseExtractionNotes(extractionNotes), reviewStatus: status === 'supported' ? 'included_in_workpapers' : status === 'unsupported' ? 'excluded' : 'needs_human_review', originalFilename })),
    undatedPurchaseInvoices: undatedInvoices.map(({ id, supplier, tin, invoiceNumber, currency, invoiceDate, amount, vat, status, ebmEvidence, extractionStatus, extractionConfidence, extractionNotes, originalFilename }) => ({ id, supplier, supplierTin: tin, invoiceNumber, currency, invoiceDate, amountRwf: amount, vatRwf: vat, ebmEvidence, extractionStatus, extractionConfidence: extractionConfidence === null ? null : Number(extractionConfidence), extractionNotes: parseExtractionNotes(extractionNotes), reviewStatus: status === 'supported' ? 'included_in_workpapers' : status === 'unsupported' ? 'excluded' : 'needs_human_review', originalFilename })),
    recordedSales: sales.map(({ id, counterparty, reference, transactionDate, amount }) => ({ id, counterparty, reference, transactionDate, amountRwf: amount, fiscalizationStatus: 'not_fiscalized' })),
    fiscalizedSales: fiscalizedSales.map(({ id, counterparty, saleDate, totalRwf }) => {
      const submission = submissionBySale.get(id)!
      return { id, counterparty, saleDate, totalRwf, fiscalReceiptNumber: submission.fiscalReceiptNumber, externalCorrelationId: submission.externalCorrelationId }
    }),
    notice: 'This internal workpaper is not the official RRA VAT annexure, an RRA-approved return, or proof of filing. Human review organizes purchase evidence only; it does not establish tax eligibility. Output VAT and statutory form fields are not calculated. Undated invoices are listed separately and excluded from period totals. Download and validate the current annexure in RRA eTax, reconcile figures there, then submit through the official portal.',
  })
}
