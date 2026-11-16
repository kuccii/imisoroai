import { auth } from '@/lib/auth'
import { getClientContext } from '@/lib/client-workspace'
import { ensureDatabaseSchema } from '@/lib/db/bootstrap'
import { db } from '@/lib/db'
import { auditEvent, invoiceRecord } from '@/lib/db/schema'
import { and, desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const createInvoiceSchema = z.object({
  clientId: z.string().trim().min(1),
  documentKind: z.enum(['purchase_invoice', 'expense_receipt']).default('purchase_invoice'),
  supplier: z.string().trim().min(2).max(160),
  tin: z.string().trim().min(3).max(32),
  invoiceDate: z.string().trim().min(4).max(40),
  amount: z.number().int().nonnegative().max(2_000_000_000),
  vat: z.number().int().nonnegative().max(2_000_000_000),
})

async function currentUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user ?? null
}

export async function GET(request: Request) {
  const actor = await currentUser()
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureDatabaseSchema()
  const client = await getClientContext(actor, new URL(request.url).searchParams.get('clientId') || `CL-PERSONAL-${actor.id}`)
  if (!client) return NextResponse.json({ error: 'Client not found or access not granted.' }, { status: 404 })
  if (!client.consentActive) return NextResponse.json({ invoices: [], needsConsent: true, activeClientId: client.id })
  const rows = await db.select().from(invoiceRecord).where(eq(invoiceRecord.clientId, client.id)).orderBy(desc(invoiceRecord.createdAt)).limit(1000)
  return NextResponse.json({ invoices: rows, activeClientId: client.id, needsConsent: false })
}

export async function POST(request: Request) {
  const actor = await currentUser()
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureDatabaseSchema()
  const parsed = createInvoiceSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Please provide valid invoice details and a client workspace.' }, { status: 400 })
  const { clientId, ...values } = parsed.data
  const client = await getClientContext(actor, clientId)
  if (!client) return NextResponse.json({ error: 'Client not found or access not granted.' }, { status: 404 })
  if (!client.consentActive) return NextResponse.json({ error: 'Record client consent before adding invoice evidence.' }, { status: 409 })

  const id = `INV-${crypto.randomUUID()}`
  const [invoice] = await db.transaction(async tx => {
    const [created] = await tx.insert(invoiceRecord).values({ id, userId: actor.id, clientId: client.id, ...values, status: 'pending' }).returning()
    await tx.insert(auditEvent).values({ id: `AUD-${crypto.randomUUID()}`, userId: actor.id, clientId: client.id, action: 'invoice_created', entityType: 'invoice', entityId: created.id })
    return [created]
  })
  return NextResponse.json({ invoice }, { status: 201 })
}
