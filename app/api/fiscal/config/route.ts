import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { auditEvent, businessFiscalProfile } from '@/lib/db/schema'
import { rraAvailability } from '@/lib/rra/availability'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const setupSchema = z.object({
  taxpayerTin: z.string().trim().max(32).optional().default(''),
  legalName: z.string().trim().max(160).optional().default(''),
  branchCode: z.string().trim().max(80).optional().default(''),
  deviceSerial: z.string().trim().max(120).optional().default(''),
  environment: z.literal('sandbox').default('sandbox'),
})

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user?.id ?? null
}

export async function GET() {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const [config] = await db.select().from(businessFiscalProfile).where(eq(businessFiscalProfile.userId, userId)).limit(1)
  return NextResponse.json({ config: config ?? null, productionAvailable: false, transmissionAvailable: rraAvailability.canTransmit, blockers: rraAvailability.blockers })
}

export async function PUT(request: Request) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = setupSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Provide valid taxpayer and registered branch/device details. Only sandbox setup is currently available.' }, { status: 400 })
  const [config] = await db.insert(businessFiscalProfile).values({
    id: `FP-${crypto.randomUUID()}`,
    userId,
    ...parsed.data,
    certificationStatus: 'not_started',
    productionEnabled: false,
  }).onConflictDoUpdate({
    target: businessFiscalProfile.userId,
    set: { ...parsed.data, updatedAt: new Date() },
  }).returning()
  await db.insert(auditEvent).values({ id: `AUD-${crypto.randomUUID()}`, userId, action: 'fiscal_profile_updated', entityType: 'business_fiscal_profile', entityId: config.id })
  return NextResponse.json({ config, productionAvailable: false, transmissionAvailable: rraAvailability.canTransmit, blockers: rraAvailability.blockers })
}
