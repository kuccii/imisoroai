import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { ensureDatabaseSchema } from '@/lib/db/bootstrap'
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
  invoiceNumber: string
  currency: string
  extractionStatus: string
  extractionConfidence: number | null
  ebmEvidence: 'ebm_present' | 'ebm_missing' | 'unclear'
  extractionNotes: string[]
}

function parseExtractionNotes(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((note): note is string => typeof note === 'string').slice(0, 8) : []
  } catch {
    return []
  }
}

export async function getWorkspaceData() {
  await ensureDatabaseSchema().catch((error) => console.error('[db] schema bootstrap failed', error))
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
      documentPathname: row.blobPathname,
      originalFilename: row.originalFilename,
      invoiceNumber: row.invoiceNumber,
      currency: row.currency,
      extractionStatus: row.extractionStatus,
      extractionConfidence: row.extractionConfidence === null ? null : Number(row.extractionConfidence),
      ebmEvidence: row.ebmEvidence === 'ebm_present' || row.ebmEvidence === 'ebm_missing' ? row.ebmEvidence as WorkspaceInvoice['ebmEvidence'] : 'unclear',
      extractionNotes: parseExtractionNotes(row.extractionNotes),
    })),
  }
}
