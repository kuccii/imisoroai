import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { businessTransaction, ledgerEntry } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() { const session = await auth.api.getSession({ headers: await headers() }); if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); const [transactions, entries] = await Promise.all([db.select().from(businessTransaction).where(eq(businessTransaction.userId, session.user.id)), db.select().from(ledgerEntry).where(eq(ledgerEntry.userId, session.user.id))]); const income = transactions.filter(item => item.type === 'sale').reduce((sum, item) => sum + item.amount, 0); const expenses = transactions.filter(item => item.type === 'purchase' || item.type === 'expense').reduce((sum, item) => sum + item.amount, 0); const cash = entries.reduce((sum, item) => sum + item.debit - item.credit, 0); return NextResponse.json({ metrics: { income, expenses, net: income - expenses, cash, transactionCount: transactions.length, ledgerEntryCount: entries.length }, transactions }) }
