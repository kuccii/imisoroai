import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { invoiceRecord } from '@/lib/db/schema'
import { and, eq, gte, lt } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)

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

  const [invoices] = await Promise.all([
    db.select().from(invoiceRecord).where(and(eq(invoiceRecord.userId, userId), gte(invoiceRecord.invoiceDate, from), lt(invoiceRecord.invoiceDate, until)))
  ])

  const totalInvoices = invoices.length
  const supportedCount = invoices.filter((i) => i.status === 'supported').length
  const pendingCount = invoices.filter((i) => i.status === 'pending').length
  const unsupportedCount = invoices.filter((i) => i.status === 'unsupported').length
  totalVat = invoices.reduce((sum, i) => sum + i.vat, 0)

  const byExtractionStatus = {
    extracted: invoices.filter((i) => i.extractionStatus === 'extracted').length,
    reviewed_manual: invoices.filter((i) => i.extractionStatus === 'reviewed_manual').length,
    credits_required: invoices.filter((i) => i.extractionStatus === 'credits_required').length,
    processing: invoices.filter((i) => i.extractionStatus === 'processing').length,
    'manual entry needed': invoices.filter((i) => i.extractionStatus === 'manual entry needed').length,
  }

  return NextResponse.json({
    period,
    metrics: {
      totalInvoices,
      supportedCount,
      pendingCount,
      unsupportedCount,
      totalVat,
      byExtractionStatus,
    },
  })
}