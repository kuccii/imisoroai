import { getAdminAccess } from '@/lib/admin'
import { db } from '@/lib/db'
import { invoiceRecord, user } from '@/lib/db/schema'
import { desc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const access = await getAdminAccess()
  if (!access.ok) {
    return NextResponse.json(
      { error: access.reason === 'unauthenticated' ? 'Unauthorized' : 'Forbidden' },
      { status: access.reason === 'unauthenticated' ? 401 : 403 },
    )
  }

  try {
    const rows = await db
      .select({
        id: invoiceRecord.id,
        supplier: invoiceRecord.supplier,
        invoiceNumber: invoiceRecord.invoiceNumber,
        invoiceDate: invoiceRecord.invoiceDate,
        amount: invoiceRecord.amount,
        vat: invoiceRecord.vat,
        currency: invoiceRecord.currency,
        status: invoiceRecord.status,
        extractionStatus: invoiceRecord.extractionStatus,
        originalFilename: invoiceRecord.originalFilename,
        createdAt: invoiceRecord.createdAt,
        ownerEmail: user.email,
      })
      .from(invoiceRecord)
      .leftJoin(user, eq(invoiceRecord.userId, user.id))
      .orderBy(desc(invoiceRecord.createdAt))
      .limit(200)

    return NextResponse.json({ invoices: rows })
  } catch (error) {
    console.error('[admin] invoice list failed', error)
    return NextResponse.json({ error: 'Could not load invoice records.' }, { status: 500 })
  }
}
