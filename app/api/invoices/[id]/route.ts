import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { auditEvent, invoiceRecord } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const updateSchema = z.object({ status: z.enum(['pending', 'supported', 'unsupported']) })

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = updateSchema.safeParse(await request.json())
  if (!body.success) return NextResponse.json({ error: 'Invalid invoice update.' }, { status: 400 })
  const { id } = await context.params
  const [invoice] = await db.update(invoiceRecord).set({ status: body.data.status, updatedAt: new Date() }).where(and(eq(invoiceRecord.id, id), eq(invoiceRecord.userId, session.user.id))).returning()
  if (!invoice) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 })
  await db.insert(auditEvent).values({ id: `AUD-${Date.now().toString(36).toUpperCase()}`, userId: session.user.id, action: `invoice_status_${body.data.status}`, entityType: 'invoice', entityId: invoice.id })
  return NextResponse.json({ invoice })
}
