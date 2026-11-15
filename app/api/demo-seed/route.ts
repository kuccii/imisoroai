import { auth } from '@/lib/auth'
import { ensureDatabaseSchema } from '@/lib/db/bootstrap'
import { db } from '@/lib/db'
import { auditEvent, importedEvidence } from '@/lib/db/schema'
import { getClientContext } from '@/lib/client-workspace'
import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await ensureDatabaseSchema()
  const body = await request.json().catch(() => null) as { clientId?: unknown } | null
  const clientId = typeof body?.clientId === 'string' ? body.clientId : ''
  const client = await getClientContext(session.user, clientId)
  if (!client) return NextResponse.json({ error: 'Client not found or access not granted.' }, { status: 404 })
  if (!client.consentActive) return NextResponse.json({ error: 'Record client consent before loading demo data.' }, { status: 409 })

  const [existing] = await db.select({ id: importedEvidence.id }).from(importedEvidence).where(and(
    eq(importedEvidence.userId, session.user.id),
    eq(importedEvidence.clientId, client.id),
    eq(importedEvidence.isDemo, true),
  )).limit(1)
  if (existing) return NextResponse.json({ loaded: 0, alreadyLoaded: true, clientId: client.id })

  const batchId = `DEMO-${crypto.randomUUID()}`
  const records = [
    { kind: 'rra_purchases', supplier: 'Kivu Office Supplies (demo)', tin: 'DEMO-TIN-001', reference: 'DEMO-EBM-1001', recordDate: '2026-10-15', amount: 118_000, vat: 18_000 },
    { kind: 'payments', supplier: 'Kivu Office Supplies (demo)', tin: '', reference: 'DEMO-BANK-001', recordDate: '2026-10-16', amount: 100_000, vat: null },
    { kind: 'payments', supplier: 'Isimbi Stationery (demo)', tin: '', reference: 'DEMO-BANK-002', recordDate: '2026-10-20', amount: 45_000, vat: null },
  ] as const

  await db.transaction(async tx => {
    await tx.insert(importedEvidence).values(records.map(record => ({
      ...record,
      id: `IMP-${crypto.randomUUID()}`,
      userId: session.user.id,
      clientId: client.id,
      isDemo: true,
      currency: 'RWF',
      chaseStatus: 'not_chased',
      confirmed: false,
      importBatchId: batchId,
      rawData: JSON.stringify({ scenario: 'fictional demo data' }),
    })))
    await tx.insert(auditEvent).values({
      id: `AUD-${crypto.randomUUID()}`,
      userId: session.user.id,
      clientId: client.id,
      action: 'demo_scenario_loaded',
      entityType: 'imported_evidence',
      entityId: batchId,
      metadata: JSON.stringify({ rows: records.length }),
    })
  })

  return NextResponse.json({ loaded: records.length, clientId: client.id }, { status: 201 })
}
