import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { auditEvent, invoiceRecord } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const updateSchema = z.object({
  status: z.enum(['supported', 'unsupported']),
  reviewNote: z.string().trim().min(10).max(500),
})

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let input: unknown
  try {
    input = await request.json()
  } catch {
    return NextResponse.json({ error: 'Enter a review decision and note.' }, { status: 400 })
  }
  const body = updateSchema.safeParse(input)
  if (!body.success) return NextResponse.json({ error: 'Choose a decision and provide a review note of at least 10 characters.' }, { status: 400 })

  const { id } = await context.params
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(invoiceRecord).where(and(
      eq(invoiceRecord.id, id),
      eq(invoiceRecord.userId, session.user.id),
    )).limit(1)
    if (!existing) return { kind: 'missing' as const }
    if (body.data.status === 'supported' && !existing.blobPathname) return { kind: 'no_source' as const }

    const [invoice] = await tx.update(invoiceRecord).set({ status: body.data.status, updatedAt: new Date() }).where(and(
      eq(invoiceRecord.id, id),
      eq(invoiceRecord.userId, session.user.id),
    )).returning()
    if (!invoice) return { kind: 'missing' as const }

    await tx.insert(auditEvent).values({
      id: `AUD-${crypto.randomUUID()}`,
      userId: session.user.id,
      action: `invoice_review_${body.data.status}`,
      entityType: 'invoice',
      entityId: invoice.id,
      metadata: JSON.stringify({
        reviewNote: body.data.reviewNote,
        originalFilename: existing.originalFilename,
        sourcePathname: existing.blobPathname,
        decisionMethod: 'human_review',
      }),
    })

    return { kind: 'updated' as const, invoice }
  })

  if (result.kind === 'missing') return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 })
  if (result.kind === 'no_source') return NextResponse.json({ error: 'Attach and inspect the original invoice before approving it.' }, { status: 409 })
  return NextResponse.json({ invoice: result.invoice })
}
