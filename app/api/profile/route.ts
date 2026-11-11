import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { auditEvent, profile } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const profileSchema = z.object({
  businessName: z.string().trim().min(2).max(160),
  tin: z.string().trim().min(3).max(32),
  phone: z.string().trim().max(32).optional(),
  language: z.enum(['en', 'rw', 'fr']),
})

async function currentUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user ?? null
}

export async function GET() {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const [existing] = await db.select().from(profile).where(eq(profile.userId, user.id)).limit(1)
  return NextResponse.json({ profile: existing ?? { userId: user.id, businessName: user.name || 'My business', tin: 'PENDING', language: 'en' } })
}

export async function PATCH(request: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let input: unknown
  try {
    input = await request.json()
  } catch {
    return NextResponse.json({ error: 'Choose a supported language.' }, { status: 400 })
  }
  const parsed = z.object({ language: z.enum(['en', 'rw', 'fr']) }).safeParse(input)
  if (!parsed.success) return NextResponse.json({ error: 'Choose a supported language.' }, { status: 400 })

  const saved = await db.transaction(async (tx) => {
    const [profileRecord] = await tx.insert(profile).values({ userId: user.id, businessName: user.name || 'My business', tin: 'PENDING', language: parsed.data.language }).onConflictDoUpdate({ target: profile.userId, set: { language: parsed.data.language, updatedAt: new Date() } }).returning()
    await tx.insert(auditEvent).values({ id: `AUD-${crypto.randomUUID()}`, userId: user.id, action: 'language_updated', entityType: 'profile', entityId: user.id })
    return profileRecord
  })
  return NextResponse.json({ profile: saved })
}

export async function PUT(request: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let input: unknown
  try {
    input = await request.json()
  } catch {
    return NextResponse.json({ error: 'Please provide valid business details.' }, { status: 400 })
  }
  const parsed = profileSchema.safeParse(input)
  if (!parsed.success) return NextResponse.json({ error: 'Please provide valid business details.' }, { status: 400 })

  const saved = await db.transaction(async (tx) => {
    const [profileRecord] = await tx.insert(profile).values({ userId: user.id, ...parsed.data }).onConflictDoUpdate({ target: profile.userId, set: { ...parsed.data, updatedAt: new Date() } }).returning()
    await tx.insert(auditEvent).values({ id: `AUD-${crypto.randomUUID()}`, userId: user.id, action: 'profile_updated', entityType: 'profile', entityId: user.id })
    return profileRecord
  })
  return NextResponse.json({ profile: saved })
}
