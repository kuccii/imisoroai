import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { auditEvent, businessTransaction, ledgerAccount, ledgerEntry } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const transactionSchema = z.object({ type: z.enum(['sale', 'purchase', 'payment', 'expense']), counterparty: z.string().trim().min(2).max(160), reference: z.string().trim().max(80).optional(), amount: z.number().int().positive().max(1_000_000_000), transactionDate: z.string().date() })

async function getUser() { const session = await auth.api.getSession({ headers: await headers() }); return session?.user ?? null }

async function ensureAccounts(userId: string) {
  const defaults = [{ code: '1000', name: 'Cash and bank', type: 'asset' }, { code: '1100', name: 'Accounts receivable', type: 'asset' }, { code: '4000', name: 'Sales revenue', type: 'income' }, { code: '5000', name: 'Operating expenses', type: 'expense' }, { code: '2100', name: 'VAT payable', type: 'liability' }]
  const existing = await db.select().from(ledgerAccount).where(eq(ledgerAccount.userId, userId))
  if (existing.length) return existing
  return db.insert(ledgerAccount).values(defaults.map(account => ({ ...account, id: `ACC-${userId.slice(0, 8)}-${account.code}`, userId }))).returning()
}

export async function GET() { const user = await getUser(); if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); const accounts = await ensureAccounts(user.id); const transactions = await db.select().from(businessTransaction).where(eq(businessTransaction.userId, user.id)); const entries = await db.select().from(ledgerEntry).where(eq(ledgerEntry.userId, user.id)); return NextResponse.json({ accounts, transactions, entries }) }

export async function POST(request: Request) { const user = await getUser(); if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); const parsed = transactionSchema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: 'Enter a valid transaction.' }, { status: 400 }); const accounts = await ensureAccounts(user.id); const cash = accounts.find(account => account.code === '1000')!; const revenue = accounts.find(account => account.code === (parsed.data.type === 'sale' ? '4000' : '5000'))!; const id = `TX-${Date.now().toString(36).toUpperCase()}`; const [transaction] = await db.insert(businessTransaction).values({ id, userId: user.id, ...parsed.data, status: 'matched', source: 'manual' }).returning(); await db.insert(ledgerEntry).values([{ id: `${id}-D`, userId: user.id, accountId: cash.id, referenceType: parsed.data.type, referenceId: id, description: parsed.data.counterparty, debit: parsed.data.amount, credit: 0, entryDate: parsed.data.transactionDate }, { id: `${id}-C`, userId: user.id, accountId: revenue.id, referenceType: parsed.data.type, referenceId: id, description: parsed.data.counterparty, debit: 0, credit: parsed.data.amount, entryDate: parsed.data.transactionDate }]); await db.insert(auditEvent).values({ id: `AUD-${Date.now().toString(36).toUpperCase()}`, userId: user.id, action: 'transaction_posted', entityType: 'business_transaction', entityId: id }); return NextResponse.json({ transaction }, { status: 201 }) }
