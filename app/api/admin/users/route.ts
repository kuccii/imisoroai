import { getAdminAccess, superadminEmails } from '@/lib/admin'
import { db } from '@/lib/db'
import { auditEvent, invoiceRecord, user } from '@/lib/db/schema'
import { desc, eq, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const updateSchema = z.object({
  userId: z.string().trim().min(1).max(128),
  role: z.enum(['user', 'superadmin']),
})

export async function GET() {
  const access = await getAdminAccess()
  if (!access.ok) {
    return NextResponse.json(
      { error: access.reason === 'unauthenticated' ? 'Unauthorized' : 'Forbidden' },
      { status: access.reason === 'unauthenticated' ? 401 : 403 },
    )
  }

  try {
    const rows = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        invoices: sql<number>`count(${invoiceRecord.id})::int`,
      })
      .from(user)
      .leftJoin(invoiceRecord, eq(invoiceRecord.userId, user.id))
      .groupBy(user.id)
      .orderBy(desc(user.createdAt))
      .limit(200)

    return NextResponse.json({ users: rows, selfEmail: access.email, protectedEmails: superadminEmails() })
  } catch (error) {
    console.error('[admin] user list failed', error)
    return NextResponse.json({ error: 'Could not load user accounts.' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const access = await getAdminAccess()
  if (!access.ok) {
    return NextResponse.json(
      { error: access.reason === 'unauthenticated' ? 'Unauthorized' : 'Forbidden' },
      { status: access.reason === 'unauthenticated' ? 401 : 403 },
    )
  }

  const parsed = updateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Choose a valid account and role.' }, { status: 400 })

  try {
    const [target] = await db.select({ id: user.id, email: user.email, role: user.role }).from(user).where(eq(user.id, parsed.data.userId)).limit(1)
    if (!target) return NextResponse.json({ error: 'That account no longer exists.' }, { status: 404 })
    if (target.id === access.userId) return NextResponse.json({ error: 'You cannot change your own superadmin role.' }, { status: 400 })

    const targetEmail = (target.email ?? '').toLowerCase()
    if (superadminEmails().includes(targetEmail) && parsed.data.role !== 'superadmin') {
      return NextResponse.json({ error: 'That account is pinned as superadmin by SUPERADMIN_EMAILS.' }, { status: 400 })
    }

    const [updated] = await db
      .update(user)
      .set({ role: parsed.data.role, updatedAt: new Date() })
      .where(eq(user.id, target.id))
      .returning({ id: user.id, email: user.email, role: user.role })

    await db.insert(auditEvent).values({
      id: `AUD-${crypto.randomUUID()}`,
      userId: access.userId,
      action: 'admin_user_role_updated',
      entityType: 'user',
      entityId: target.id,
      metadata: JSON.stringify({ email: targetEmail, from: target.role, to: parsed.data.role }),
    })

    return NextResponse.json({ user: updated })
  } catch (error) {
    console.error('[admin] role update failed', error)
    return NextResponse.json({ error: 'Could not update that account.' }, { status: 500 })
  }
}
