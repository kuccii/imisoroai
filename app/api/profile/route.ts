import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { profile } from '@/lib/db/schema'
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

export async function PUT(request: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = profileSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Please provide valid business details.' }, { status: 400 })
  const [saved] = await db.insert(profile).values({ userId: user.id, ...parsed.data }).onConflictDoUpdate({ target: profile.userId, set: { ...parsed.data, updatedAt: new Date() } }).returning()
  return NextResponse.json({ profile: saved })
}
