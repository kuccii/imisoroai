import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { invoiceRecord, profile } from '@/lib/db/schema'
import { desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'

export type WorkspaceInvoice = {
  id: string
  supplier: string
  tin: string
  date: string
  amount: number
  vat: number
  status: 'pending' | 'supported' | 'unsupported'
  type: 'purchase' | 'sale'
  initials: string
  reason?: string
}

export async function getWorkspaceData() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null

  const userId = session.user.id
  const [userProfile, rows] = await Promise.all([
    db.select().from(profile).where(eq(profile.userId, userId)).limit(1),
    db.select().from(invoiceRecord).where(eq(invoiceRecord.userId, userId)).orderBy(desc(invoiceRecord.createdAt)),
  ])

  return {
    session,
    profile: userProfile[0] ?? null,
    invoices: rows.map((row) => ({
      id: row.id,
      supplier: row.supplier,
      tin: row.tin,
      date: row.invoiceDate,
      amount: row.amount,
      vat: row.vat,
      status: (row.status === 'supported' || row.status === 'unsupported' ? row.status : 'pending') as WorkspaceInvoice['status'],
      type: 'purchase' as const,
      initials: row.supplier.slice(0, 2).toUpperCase(),
      reason: row.status === 'supported' ? 'EBM_VALID' : row.status === 'unsupported' ? 'NO_EBM' : undefined,
    })),
  }
}
