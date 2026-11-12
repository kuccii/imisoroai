import { getAdminAccess, getOcrSettings } from '@/lib/admin'
import { db } from '@/lib/db'
import { auditEvent, invoiceRecord, user } from '@/lib/db/schema'
import { desc, eq, sql } from 'drizzle-orm'
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
    const [userCount, invoiceStats, activity, ocr] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(user),
      db
        .select({
          invoices: sql<number>`count(*)::int`,
          pendingReview: sql<number>`count(*) FILTER (WHERE ${invoiceRecord.status} = 'pending')::int`,
          extractionIssues: sql<number>`count(*) FILTER (WHERE ${invoiceRecord.extractionStatus} <> 'extracted' AND ${invoiceRecord.extractionStatus} <> 'reviewed_manual')::int`,
          documents: sql<number>`count(*) FILTER (WHERE ${invoiceRecord.blobPathname} IS NOT NULL)::int`,
        })
        .from(invoiceRecord),
      db
        .select({
          id: auditEvent.id,
          action: auditEvent.action,
          entityType: auditEvent.entityType,
          entityId: auditEvent.entityId,
          createdAt: auditEvent.createdAt,
          email: user.email,
        })
        .from(auditEvent)
        .leftJoin(user, eq(auditEvent.userId, user.id))
        .orderBy(desc(auditEvent.createdAt))
        .limit(25),
      getOcrSettings(),
    ])

    return NextResponse.json({
      stats: {
        users: userCount[0]?.count ?? 0,
        invoices: invoiceStats[0]?.invoices ?? 0,
        pendingReview: invoiceStats[0]?.pendingReview ?? 0,
        extractionIssues: invoiceStats[0]?.extractionIssues ?? 0,
        documents: invoiceStats[0]?.documents ?? 0,
      },
      ocr,
      activity,
    })
  } catch (error) {
    console.error('[admin] overview failed', error)
    return NextResponse.json({ error: 'Could not load the platform overview.' }, { status: 500 })
  }
}
