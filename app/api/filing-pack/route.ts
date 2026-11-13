import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { invoiceRecord, fiscalSale, fiscalSubmission, profile } from '@/lib/db/schema'
import { and, eq, gte, lt } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const periodSchema = z.string().regex(/^\\d{4}-(0[1-9]|1[0-2])$/)

function parseExtractionNotes(value: string) {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((note): note is string => typeof note === 'string').slice(0, 8) : []
  } catch {
    return []
  }
}

function isValidIsoDate(value: string) {
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false
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

  const [allInvoices, storedFiscalizedSales, submissions, [business]] = await Promise.all([
    db.select().from(invoiceRecord).where(eq(invoiceRecord.userId, userId)),
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
  const submissionBySale = new Map(submissions.map((submission) => [submission.saleId, submission]))
  const fiscalizedSales = storedFiscalizedSales.filter((sale) => {
    const submission = submissionBySale.get(sale.id)
    return Boolean(submission?.fiscalReceiptNumber && submission.externalCorrelationId)
  })
  const taxpayerTin = business?.tin && business.tin !== 'PENDING' ? business.tin : null

  return NextResponse.json({
    period,
    invoices: {
      total: invoices.length,
      eligiblePurchases: eligiblePurchases.length,
      outstandingReview: outstandingReview.length,
      unsupported: unsupported.length,
      scanIssues: scanIssues.length,
      undatedInvoices: undatedInvoices.length,
    },
    fiscalSales: {
      total: storedFiscalizedSales.length,
      fiscalized: fiscalizedSales.length,
    },
    submissions: submissions.length,
    taxpayerTin,
  })
}