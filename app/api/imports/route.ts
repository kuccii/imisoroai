import { auth } from '@/lib/auth'
import { ensureDatabaseSchema } from '@/lib/db/bootstrap'
import { db } from '@/lib/db'
import { auditEvent, importedEvidence, supplierMapping } from '@/lib/db/schema'
import { matchPurchases } from '@/lib/missing-matching'
import { getClientContext } from '@/lib/client-workspace'
import { parsePastedTable, parseTabularFile, type TabularData } from '@/lib/tabular-import'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const normalizedName = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
const recordMappingSchema = z.object({
  supplier: z.number().int().nonnegative(),
  date: z.number().int().nonnegative(),
  amount: z.number().int().nonnegative(),
  tin: z.number().int().nonnegative().optional(),
  receiptNumber: z.number().int().nonnegative().optional(),
  vat: z.number().int().nonnegative().optional(),
  phone: z.number().int().nonnegative().optional(),
})
const patchSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('confirm_supplier'), clientId: z.string().min(1), demoOnly: z.boolean().default(false), supplier: z.string().trim().min(2).max(160), alias: z.string().trim().min(2).max(160), tin: z.string().trim().max(32).optional(), phone: z.string().trim().max(40).optional() }),
  z.object({ action: z.literal('tag_possible'), clientId: z.string().min(1), demoOnly: z.boolean().default(false), recordId: z.string().min(1), enabled: z.boolean() }),
  z.object({ action: z.literal('chase_status'), clientId: z.string().min(1), demoOnly: z.boolean().default(false), recordId: z.string().min(1), status: z.enum(['not_chased', 'chased', 'complied', 'no_response']) }),
  z.object({ action: z.literal('confirm_match'), clientId: z.string().min(1), demoOnly: z.boolean().default(false), recordIds: z.array(z.string().min(1)).min(1).max(10) }),
])

async function currentUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user ?? null
}

function parseDate(value: string) {
  const input = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [year, month, day] = input.split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) return input
  }
  const dmy = input.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (dmy) {
    const day = Number(dmy[1]); const month = Number(dmy[2]); const year = Number(dmy[3])
    const date = new Date(Date.UTC(year, month - 1, day))
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  return null
}

function parseMoney(value: string) {
  const normalized = value.trim().replace(/[\s,]/g, '').replace(/^(RWF|FRW)/i, '')
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null
  const amount = Number(normalized)
  return Number.isSafeInteger(Math.round(amount)) && amount >= 0 && amount <= 2_000_000_000 ? Math.round(amount) : null
}

export async function GET(request: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureDatabaseSchema()
  const searchParams = new URL(request.url).searchParams
  const requestedClientId = searchParams.get('clientId')
  const demoOnly = searchParams.get('demo') === 'true'
  const view = searchParams.get('view')
  const client = await getClientContext(user, requestedClientId)
  if (!client) return NextResponse.json({ error: 'Client not found or access not granted.' }, { status: 404 })
  if (!client.consentActive) return NextResponse.json({ records: [], mappings: [], matches: [], metrics: { unsupportedRwf: 0, chasedRwf: 0, recoveredRwf: 0, inputVatRwf: 0 }, needsConsent: true, activeClientId: client.id })
  const [records, mappings] = await Promise.all([
    db.select().from(importedEvidence).where(and(eq(importedEvidence.clientId, client.id), eq(importedEvidence.isDemo, demoOnly))).orderBy(desc(importedEvidence.createdAt)).limit(2000),
    db.select().from(supplierMapping).where(eq(supplierMapping.clientId, client.id)),
  ])
  if (view === 'Missing') {
    const batchTimes = new Map<string, Date>()
    for (const record of records) {
      const importedAt = batchTimes.get(record.importBatchId)
      if (!importedAt || record.createdAt < importedAt) batchTimes.set(record.importBatchId, record.createdAt)
    }
    const batches = [...batchTimes.entries()]
    const batchIds = batches.map(([batchId]) => batchId)
    if (batchIds.length) {
      const viewed = await db.select({ entityId: auditEvent.entityId }).from(auditEvent).where(and(
        eq(auditEvent.userId, user.id),
        eq(auditEvent.clientId, client.id),
        eq(auditEvent.action, 'import_to_missing_viewed'),
        inArray(auditEvent.entityId, batchIds),
      ))
      const alreadyViewed = new Set(viewed.map(event => event.entityId))
      const now = new Date()
      const events = batches.filter(([batchId]) => !alreadyViewed.has(batchId)).map(([batchId, importedAt]) => ({
        id: `AUD-${crypto.randomUUID()}`,
        userId: user.id,
        clientId: client.id,
        action: 'import_to_missing_viewed',
        entityType: 'import_batch',
        entityId: batchId,
        metadata: JSON.stringify({ elapsedMs: Math.max(0, now.getTime() - importedAt.getTime()), demoOnly }),
      }))
      if (events.length) await db.insert(auditEvent).values(events)
    }
  }
  const rra = records.filter(record => record.kind === 'rra_purchases')
  const paymentRecords = records.filter(record => record.kind === 'payments')
  const matches = matchPurchases(
    rra.map(row => ({ id: row.id, supplier: row.supplier, tin: row.tin, receiptNumber: row.reference, date: row.recordDate, amount: row.amount, vat: row.vat ?? undefined })),
    paymentRecords.map(row => ({ id: row.id, supplier: row.supplier, date: row.recordDate, amount: row.amount, possibleNoEbM: row.userTag === 'likely_no_ebm_possible' })),
    { supplierMappings: Object.fromEntries(mappings.filter(row => row.confirmed).map(row => [row.normalizedName.startsWith(`${client.id}::`) ? row.normalizedName.slice(client.id.length + 2) : row.normalizedName, normalizedName(row.canonicalName)])) },
  )
  const enrichedMatches = matches.map(match => ({ ...match, confirmed: [...match.purchaseIds, ...match.paymentIds].every(id => records.find(row => row.id === id)?.confirmed) }))
  const chased = paymentRecords.filter(row => row.chaseStatus === 'chased').reduce((sum, row) => sum + row.amount, 0)
  const recoveredIds = new Set(enrichedMatches.filter(match => match.group === 'supported' && match.confirmed).flatMap(match => match.paymentIds))
  const unsupported = matches.filter(match => match.group === 'missing_at_rra').reduce((sum, match) => sum + match.paymentIds.reduce((partial, id) => partial + (paymentRecords.find(row => row.id === id)?.amount ?? 0), 0), 0)
  const inputVatRwf = enrichedMatches.filter(match => match.group === 'supported' && match.confirmed).reduce((sum, match) => sum + match.purchaseIds.reduce((partial, id) => partial + (rra.find(row => row.id === id)?.vat ?? 0), 0), 0)
  return NextResponse.json({ records, mappings: mappings.map(row => ({ ...row, normalizedName: row.normalizedName.startsWith(`${client.id}::`) ? row.normalizedName.slice(client.id.length + 2) : row.normalizedName })), matches: enrichedMatches, needsConsent: false, activeClientId: client.id, demoMode: demoOnly, metrics: { unsupportedRwf: unsupported, chasedRwf: chased, recoveredRwf: [...recoveredIds].reduce((sum, id) => sum + (paymentRecords.find(row => row.id === id)?.amount ?? 0), 0), inputVatRwf } })
}

export async function POST(request: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureDatabaseSchema()
  let form: FormData
  try { form = await request.formData() } catch { return NextResponse.json({ error: 'Provide an import file or pasted table.' }, { status: 400 }) }
  const kind = form.get('kind')
  if (kind !== 'rra_purchases' && kind !== 'payments') return NextResponse.json({ error: 'Choose a purchase list or payment statement.' }, { status: 400 })
  const demoOnly = form.get('demoOnly') === 'true'
  const client = await getClientContext(user, String(form.get('clientId') ?? ''))
  if (!client) return NextResponse.json({ error: 'Client not found or access not granted.' }, { status: 404 })
  if (!client.consentActive) return NextResponse.json({ error: 'Record client consent before importing data.' }, { status: 409 })
  let tabular: TabularData
  try {
    const file = form.get('file')
    const pasted = form.get('pasted')
    if (file instanceof File && file.size > 0) {
      if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'Choose a file under 10 MB.' }, { status: 413 })
      tabular = await parseTabularFile(file)
    } else if (typeof pasted === 'string' && pasted.trim()) {
      tabular = parsePastedTable(pasted)
    } else return NextResponse.json({ error: 'Choose a CSV/XLSX file or paste a table.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The table could not be read.' }, { status: 400 })
  }
  if (tabular.rows.length > 5000) return NextResponse.json({ error: 'An import can contain at most 5,000 rows.' }, { status: 413 })
  const preview = form.get('preview') === 'true'
  if (preview) return NextResponse.json({ headers: tabular.headers, rows: tabular.rows.slice(0, 8), rowCount: tabular.rows.length })

  let rawMapping: unknown
  try { rawMapping = JSON.parse(String(form.get('mapping') ?? '')) } catch { rawMapping = null }
  const parsedMapping = recordMappingSchema.safeParse(rawMapping)
  if (!parsedMapping.success) return NextResponse.json({ error: 'Map supplier, date, and amount columns before importing.' }, { status: 400 })
  const mapping = parsedMapping.data
  const required = [mapping.supplier, mapping.date, mapping.amount]
  if (required.some(index => index >= tabular.headers.length) || Object.values(mapping).some(index => index !== undefined && index >= tabular.headers.length)) return NextResponse.json({ error: 'Choose columns from the uploaded table.' }, { status: 400 })
  const entries: (typeof importedEvidence.$inferInsert)[] = []
  const errors: string[] = []
  const importBatchId = `BATCH-${crypto.randomUUID()}`
  tabular.rows.forEach((row, index) => {
    const supplier = row[mapping.supplier]?.trim()
    const date = parseDate(row[mapping.date] ?? '')
    const amount = parseMoney(row[mapping.amount] ?? '')
    const vatInput = mapping.vat === undefined ? '' : row[mapping.vat] ?? ''
    const vat = !vatInput.trim() ? null : parseMoney(vatInput)
    if (!supplier || supplier.length > 160 || !date || amount === null || (vatInput.trim() && vat === null)) {
      errors.push(`Row ${index + 2}: supplier, date, or amount is missing/invalid.`)
      return
    }
    entries.push({
      id: `IMP-${crypto.randomUUID()}`, userId: user.id, clientId: client.id, isDemo: demoOnly, kind, supplier,
      tin: mapping.tin === undefined ? '' : (row[mapping.tin] ?? '').trim().slice(0, 32),
      reference: mapping.receiptNumber === undefined ? '' : (row[mapping.receiptNumber] ?? '').trim().slice(0, 120),
      recordDate: date, amount, vat, currency: 'RWF', phone: mapping.phone === undefined ? null : (row[mapping.phone] ?? '').trim().slice(0, 40) || null,
      importBatchId, rawData: JSON.stringify(Object.fromEntries(tabular.headers.map((header, column) => [header, row[column] ?? '']))),
    })
  })
  if (errors.length) return NextResponse.json({ error: `${errors.length} row(s) need correction. Nothing was imported.`, rowErrors: errors.slice(0, 20) }, { status: 400 })
  if (!entries.length) return NextResponse.json({ error: 'No import rows were found.' }, { status: 400 })

  await db.transaction(async tx => {
    for (let start = 0; start < entries.length; start += 100) await tx.insert(importedEvidence).values(entries.slice(start, start + 100))
    await tx.insert(auditEvent).values({ id: `AUD-${crypto.randomUUID()}`, userId: user.id, clientId: client.id, action: 'evidence_batch_imported', entityType: 'imported_evidence', entityId: entries[0].importBatchId, metadata: JSON.stringify({ kind, rows: entries.length, source: form.get('file') instanceof File ? 'file' : 'paste' }) })
  })
  return NextResponse.json({ imported: entries.length, kind }, { status: 201 })
}

export async function PATCH(request: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureDatabaseSchema()
  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'The requested workflow update is invalid.' }, { status: 400 })
  const data = parsed.data
  const client = await getClientContext(user, data.clientId)
  if (!client) return NextResponse.json({ error: 'Client not found or access not granted.' }, { status: 404 })
  if (!client.consentActive) return NextResponse.json({ error: 'Record client consent before changing evidence.' }, { status: 409 })
  const actionName = data.action
  let entityId: string | null = null
  if (data.action === 'confirm_supplier') {
    const alias = normalizedName(data.alias)
    if (!alias) return NextResponse.json({ error: 'Enter a valid supplier name.' }, { status: 400 })
    const storedAlias = `${client.id}::${alias}`
    const values = { canonicalName: data.supplier, supplierTin: data.tin ?? '', phone: data.phone ?? null, confirmed: true, updatedAt: new Date() }
    await db.insert(supplierMapping).values({ id: `SUP-${crypto.randomUUID()}`, userId: user.id, clientId: client.id, normalizedName: storedAlias, ...values }).onConflictDoUpdate({ target: [supplierMapping.userId, supplierMapping.normalizedName], set: values })
    entityId = alias
  } else if (data.action === 'tag_possible') {
    const [record] = await db.update(importedEvidence).set({ userTag: data.enabled ? 'likely_no_ebm_possible' : null }).where(and(eq(importedEvidence.id, data.recordId), eq(importedEvidence.clientId, client.id), eq(importedEvidence.kind, 'payments'), eq(importedEvidence.isDemo, data.demoOnly))).returning({ id: importedEvidence.id })
    if (!record) return NextResponse.json({ error: 'Payment record not found.' }, { status: 404 })
    entityId = record.id
  } else if (data.action === 'chase_status') {
    const [record] = await db.update(importedEvidence).set({ chaseStatus: data.status }).where(and(eq(importedEvidence.id, data.recordId), eq(importedEvidence.clientId, client.id), eq(importedEvidence.kind, 'payments'), eq(importedEvidence.isDemo, data.demoOnly))).returning({ id: importedEvidence.id })
    if (!record) return NextResponse.json({ error: 'Payment record not found.' }, { status: 404 })
    entityId = record.id
  } else {
    const records = await db.select({ id: importedEvidence.id }).from(importedEvidence).where(and(eq(importedEvidence.clientId, client.id), eq(importedEvidence.isDemo, data.demoOnly), inArray(importedEvidence.id, data.recordIds)))
    if (records.length !== data.recordIds.length) return NextResponse.json({ error: 'One or more records were not found.' }, { status: 404 })
    await db.update(importedEvidence).set({ confirmed: true }).where(and(eq(importedEvidence.clientId, client.id), eq(importedEvidence.isDemo, data.demoOnly), inArray(importedEvidence.id, data.recordIds)))
    entityId = data.recordIds.join(',')
  }
  await db.insert(auditEvent).values({ id: `AUD-${crypto.randomUUID()}`, userId: user.id, clientId: client.id, action: `missing_workflow_${actionName}`, entityType: actionName === 'confirm_supplier' ? 'supplier_mapping' : 'imported_evidence', entityId, metadata: JSON.stringify({ action: actionName }) })
  return NextResponse.json({ ok: true })
}
