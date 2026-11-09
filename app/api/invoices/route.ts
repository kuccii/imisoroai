import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { invoiceRecord } from '@/lib/db/schema'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const createInvoiceSchema = z.object({
  supplier: z.string().trim().min(2).max(160),
  tin: z.string().trim().min(3).max(32),
  invoiceDate: z.string().trim().min(4).max(40),
  amount: z.number().int().nonnegative().max(2_000_000_000),
  vat: z.number().int().nonnegative().max(2_000_000_000),
})

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user?.id ?? null
}

export async function GET() {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const rows = await db.select().from(invoiceRecord).where(eq(invoiceRecord.userId, userId))
  return NextResponse.json({ invoices: rows })
}

export async function POST(request: Request) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = createInvoiceSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Please provide valid invoice details.' }, { status: 400 })

  const id = `INV-${Date.now().toString(36).toUpperCase()}`
  const [invoice] = await db.insert(invoiceRecord).values({ id, userId, ...parsed.data, status: 'pending' }).returning()
  return NextResponse.json({ invoice }, { status: 201 })
}
