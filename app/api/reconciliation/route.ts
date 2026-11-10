import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { auditEvent, businessTransaction } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() { const session = await auth.api.getSession({ headers: await headers() }); if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); const items = await db.select().from(businessTransaction).where(and(eq(businessTransaction.userId, session.user.id), eq(businessTransaction.status, 'unmatched'))); return NextResponse.json({ items }) }

export async function PATCH(request: Request) { const session = await auth.api.getSession({ headers: await headers() }); if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); const body = await request.json() as { transactionId?: string }; if (!body.transactionId) return NextResponse.json({ error: 'Transaction is required.' }, { status: 400 }); const [item] = await db.update(businessTransaction).set({ status: 'matched' }).where(and(eq(businessTransaction.id, body.transactionId), eq(businessTransaction.userId, session.user.id))).returning(); if (!item) return NextResponse.json({ error: 'Transaction not found.' }, { status: 404 }); await db.insert(auditEvent).values({ id: `AUD-${Date.now().toString(36).toUpperCase()}`, userId: session.user.id, action: 'transaction_reconciled', entityType: 'business_transaction', entityId: item.id }); return NextResponse.json({ item }) }
