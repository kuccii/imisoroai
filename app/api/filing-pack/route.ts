import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { businessTransaction, invoiceRecord, profile } from '@/lib/db/schema'
import { and, eq, gte, lt } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const period = new URL(request.url).searchParams.get('period') || new Date().toISOString().slice(0, 7)
  if (!periodSchema.safeParse(period).success) return NextResponse.json({ error: 'Use a valid filing period in YYYY-MM format.' }, { status: 400 })
  const from = `${period}-01`
  const endDate = new Date(`${period}-01T00:00:00.000Z`)
  endDate.setUTCMonth(endDate.getUTCMonth() + 1)
  const until = endDate.toISOString().slice(0, 10)
  const [invoices, transactions, [business]] = await Promise.all([
    db.select().from(invoiceRecord).where(and(eq(invoiceRecord.userId, session.user.id), gte(invoiceRecord.invoiceDate, from), lt(invoiceRecord.invoiceDate, until))),
    db.select().from(businessTransaction).where(and(eq(businessTransaction.userId, session.user.id), gte(businessTransaction.transactionDate, from), lt(businessTransaction.transactionDate, until))),
    db.select().from(profile).where(eq(profile.userId, session.user.id)),
  ])
  const eligiblePurchases = invoices.filter(invoice => invoice.status === 'supported')
  const outstandingReview = invoices.filter(invoice => invoice.status === 'pending')
  const unsupported = invoices.filter(invoice => invoice.status === 'unsupported')
  const sales = transactions.filter(transaction => transaction.type === 'sale')
  return NextResponse.json({
    preparationOnly: true,
    submissionSupported: false,
    period,
    generatedAt: new Date().toISOString(),
    taxpayer: { businessName: business?.businessName || null, tin: business?.tin || null },
    totals: {
      purchaseInvoiceCount: invoices.length,
      supportedPurchaseCount: eligiblePurchases.length,
      pendingReviewCount: outstandingReview.length,
      unsupportedPurchaseCount: unsupported.length,
      supportedInputVatRwf: eligiblePurchases.reduce((sum, invoice) => sum + invoice.vat, 0),
      salesCount: sales.length,
      recordedSalesGrossRwf: sales.reduce((sum, transaction) => sum + transaction.amount, 0),
      outputVatStatus: 'not_calculated',
    },
    checklist: [
      { id: 'taxpayer', label: 'Confirm taxpayer TIN and period in RRA eTax', status: business?.tin ? 'review' : 'blocked' },
      { id: 'purchases', label: 'Review supported purchase invoices and input VAT', status: outstandingReview.length ? 'review' : 'ready' },
      { id: 'sales', label: 'Reconcile sales with EBM/EIS records and output VAT', status: 'required' },
      { id: 'submit', label: 'Review and submit the return in RRA eTax', status: 'external' },
    ],
    purchaseInvoices: invoices.map(({ id, supplier, tin, invoiceDate, amount, vat, status, originalFilename }) => ({ id, supplier, supplierTin: tin, invoiceDate, amountRwf: amount, vatRwf: vat, reviewStatus: status, originalFilename })),
    recordedSales: sales.map(({ id, counterparty, reference, transactionDate, amount }) => ({ id, counterparty, reference, transactionDate, amountRwf: amount })),
    notice: 'This preparation pack is a review aid, not an RRA-approved return or proof of filing. Output VAT and statutory form fields are not calculated here. Verify all figures against current RRA eTax guidance before filing.',
  })
}
