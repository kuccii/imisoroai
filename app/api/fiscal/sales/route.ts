import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { auditEvent, fiscalSale, fiscalSaleLine, fiscalSubmission } from '@/lib/db/schema'
import { rraAvailability } from '@/lib/rra/availability'
import { and, desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const saleSchema = z.object({
  saleDate: z.iso.date(),
  counterparty: z.string().trim().min(1).max(160),
  counterpartyTin: z.string().trim().max(32).optional().default(''),
  items: z.array(z.object({
    description: z.string().trim().min(1).max(200),
    quantity: z.string().regex(/^\d{1,12}(\.\d{1,4})?$/).refine(value => Number(value) > 0),
    unitPriceRwf: z.number().int().min(0).max(2_000_000_000),
    netRwf: z.number().int().min(0).max(2_000_000_000),
    declaredTaxRwf: z.number().int().min(0).max(2_000_000_000).default(0),
  }).strict()).min(1).max(50),
}).strict().superRefine((sale, context) => {
  const subtotal = sale.items.reduce((sum, item) => sum + item.netRwf, 0)
  const tax = sale.items.reduce((sum, item) => sum + item.declaredTaxRwf, 0)
  if (!Number.isSafeInteger(subtotal) || !Number.isSafeInteger(tax) || subtotal + tax > 2_000_000_000) {
    context.addIssue({ code: 'custom', message: 'Sale totals exceed the supported amount.' })
  }
})

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user?.id ?? null
}

export async function GET() {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sales = await db.select().from(fiscalSale).where(eq(fiscalSale.userId, userId)).orderBy(desc(fiscalSale.createdAt)).limit(50)
  const submissions = await db.select({
    id: fiscalSubmission.id,
    saleId: fiscalSubmission.saleId,
    environment: fiscalSubmission.environment,
    status: fiscalSubmission.status,
    externalCorrelationId: fiscalSubmission.externalCorrelationId,
    fiscalReceiptNumber: fiscalSubmission.fiscalReceiptNumber,
    responseCode: fiscalSubmission.responseCode,
    errorCode: fiscalSubmission.errorCode,
    attemptCount: fiscalSubmission.attemptCount,
    lastAttemptAt: fiscalSubmission.lastAttemptAt,
    createdAt: fiscalSubmission.createdAt,
  }).from(fiscalSubmission).where(eq(fiscalSubmission.userId, userId)).orderBy(desc(fiscalSubmission.createdAt)).limit(50)
  return NextResponse.json({ sales, submissions, submissionEnabled: rraAvailability.canTransmit, submissionBlockers: rraAvailability.blockers })
}

export async function POST(request: Request) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = saleSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Check the sales details and confirm total equals subtotal plus declared tax.' }, { status: 400 })
  const { items, ...details } = parsed.data
  const id = `FS-${crypto.randomUUID()}`
  const subtotalRwf = items.reduce((sum, item) => sum + item.netRwf, 0)
  const declaredTaxRwf = items.reduce((sum, item) => sum + item.declaredTaxRwf, 0)
  const totalRwf = subtotalRwf + declaredTaxRwf
  const sale = await db.transaction(async (tx) => {
    const [created] = await tx.insert(fiscalSale).values({ id, userId, ...details, subtotalRwf, declaredTaxRwf, totalRwf, status: 'draft' }).returning()
    const lines = await tx.insert(fiscalSaleLine).values(items.map(item => ({ ...item, id: `FSL-${crypto.randomUUID()}`, userId, saleId: id }))).returning()
    return { ...created, items: lines }
  })
  await db.insert(auditEvent).values({ id: `AUD-${crypto.randomUUID()}`, userId, action: 'fiscal_sale_draft_created', entityType: 'fiscal_sale', entityId: sale.id })
  return NextResponse.json({ sale }, { status: 201 })
}
