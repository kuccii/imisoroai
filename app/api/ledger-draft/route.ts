import { auth } from '@/lib/auth'
import { getClientContext } from '@/lib/client-workspace'
import { ensureDatabaseSchema } from '@/lib/db/bootstrap'
import { db } from '@/lib/db'
import { auditEvent, importedEvidence, ledgerDraftEntry } from '@/lib/db/schema'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const entrySchema = z.object({
  clientId: z.string().min(1), sourceRecordId: z.string().min(1).optional(), expenseDate: z.iso.date(),
  supplier: z.string().trim().min(2).max(160), tin: z.string().trim().max(32).default(''),
  reference: z.string().trim().max(120).default(''), amountRwf: z.number().int().positive().max(2_000_000_000),
  reason: z.string().trim().min(8).max(600), evidenceDescription: z.string().trim().min(8).max(600),
}).strict()

async function currentUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user ?? null
}

export async function GET(request: Request) {
  const actor = await currentUser()
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureDatabaseSchema()
  const client = await getClientContext(actor, new URL(request.url).searchParams.get('clientId'))
  if (!client) return NextResponse.json({ error: 'Client not found or access not granted.' }, { status: 404 })
  if (!client.consentActive) return NextResponse.json({ entries: [], needsConsent: true, activeClientId: client.id })
  const entries = await db.select().from(ledgerDraftEntry).where(eq(ledgerDraftEntry.clientId, client.id)).orderBy(desc(ledgerDraftEntry.createdAt)).limit(1000)
  return NextResponse.json({ entries, needsConsent: false, activeClientId: client.id, exportReady: false, verify: 'VERIFY-02' })
}

export async function POST(request: Request) {
  const actor = await currentUser()
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureDatabaseSchema()
  const parsed = entrySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Provide a date, supplier, positive amount, reason, and evidence note.' }, { status: 400 })
  const input = parsed.data
  const client = await getClientContext(actor, input.clientId)
  if (!client) return NextResponse.json({ error: 'Client not found or access not granted.' }, { status: 404 })
  if (!client.consentActive) return NextResponse.json({ error: 'Record client consent before creating ledger drafts.' }, { status: 409 })
  let values = { expenseDate: input.expenseDate, supplier: input.supplier, tin: input.tin, reference: input.reference, amountRwf: input.amountRwf }
  if (input.sourceRecordId) {
    const [source] = await db.select().from(importedEvidence).where(and(eq(importedEvidence.id, input.sourceRecordId), eq(importedEvidence.clientId, client.id), eq(importedEvidence.kind, 'payments'))).limit(1)
    if (!source) return NextResponse.json({ error: 'Source payment was not found in this client workspace.' }, { status: 404 })
    values = { expenseDate: source.recordDate, supplier: source.supplier, tin: source.tin, reference: source.reference, amountRwf: source.amount }
  }
  const id = `LD-${crypto.randomUUID()}`
  const [entry] = await db.transaction(async tx => {
    const [created] = await tx.insert(ledgerDraftEntry).values({ id, clientId: client.id, createdByUserId: actor.id, sourceRecordId: input.sourceRecordId ?? null, ...values, reason: input.reason, evidenceDescription: input.evidenceDescription, reviewStatus: 'needs_review' }).returning()
    await tx.insert(auditEvent).values({ id: `AUD-${crypto.randomUUID()}`, userId: actor.id, clientId: client.id, action: 'ledger_draft_created', entityType: 'ledger_draft_entry', entityId: id })
    return [created]
  })
  return NextResponse.json({ entry }, { status: 201 })
}

export async function PATCH(request: Request) {
  const actor = await currentUser()
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureDatabaseSchema()
  const parsed = z.object({ clientId: z.string().min(1), entryIds: z.array(z.string().min(1)).min(1).max(100), confirmation: z.literal(true) }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Confirm the selected ledger draft entries.' }, { status: 400 })
  const client = await getClientContext(actor, parsed.data.clientId)
  if (!client) return NextResponse.json({ error: 'Client not found or access not granted.' }, { status: 404 })
  if (!client.consentActive) return NextResponse.json({ error: 'Client consent is not active.' }, { status: 409 })
  const existing = await db.select({ id: ledgerDraftEntry.id }).from(ledgerDraftEntry).where(and(eq(ledgerDraftEntry.clientId, client.id), inArray(ledgerDraftEntry.id, parsed.data.entryIds)))
  if (existing.length !== parsed.data.entryIds.length) return NextResponse.json({ error: 'One or more entries were not found for this client.' }, { status: 404 })
  await db.update(ledgerDraftEntry).set({ reviewStatus: 'human_reviewed' }).where(and(eq(ledgerDraftEntry.clientId, client.id), inArray(ledgerDraftEntry.id, parsed.data.entryIds)))
  await db.insert(auditEvent).values({ id: `AUD-${crypto.randomUUID()}`, userId: actor.id, clientId: client.id, action: 'ledger_draft_human_reviewed', entityType: 'ledger_draft_entry', entityId: parsed.data.entryIds.join(',') })
  return NextResponse.json({ ok: true })
}
