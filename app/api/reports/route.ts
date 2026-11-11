import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { businessTransaction, ledgerAccount, ledgerEntry } from '@/lib/db/schema'
import { and, eq, gte, lt } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const period = new URL(request.url).searchParams.get('period') || new Date().toISOString().slice(0, 7)
  if (!periodSchema.safeParse(period).success) return NextResponse.json({ error: 'Use a valid reporting period in YYYY-MM format.' }, { status: 400 })

  const from = `${period}-01`
  const endDate = new Date(`${from}T00:00:00.000Z`)
  endDate.setUTCMonth(endDate.getUTCMonth() + 1)
  const until = endDate.toISOString().slice(0, 10)
  const userId = session.user.id
  const [transactions, entries, accounts] = await Promise.all([
    db.select().from(businessTransaction).where(and(eq(businessTransaction.userId, userId), gte(businessTransaction.transactionDate, from), lt(businessTransaction.transactionDate, until))),
    db.select().from(ledgerEntry).where(and(eq(ledgerEntry.userId, userId), gte(ledgerEntry.entryDate, from), lt(ledgerEntry.entryDate, until))),
    db.select().from(ledgerAccount).where(eq(ledgerAccount.userId, userId)),
  ])

  const accountById = new Map(accounts.map((account) => [account.id, account]))
  const income = entries.reduce((sum, entry) => accountById.get(entry.accountId)?.type === 'income' ? sum + entry.credit - entry.debit : sum, 0)
  const expenses = entries.reduce((sum, entry) => accountById.get(entry.accountId)?.type === 'expense' ? sum + entry.debit - entry.credit : sum, 0)
  const cashAccountIds = new Set(accounts.filter((account) => account.code === '1000').map((account) => account.id))
  const cashMovement = entries.reduce((sum, entry) => cashAccountIds.has(entry.accountId) ? sum + entry.debit - entry.credit : sum, 0)
  const legacyPostingReviewRequired = transactions.some((transaction) => ['purchase', 'expense'].includes(transaction.type) && transaction.source !== 'manual_v2')

  return NextResponse.json({
    period,
    metrics: { income, expenses, net: income - expenses, cash: cashMovement, transactionCount: transactions.length, ledgerEntryCount: entries.length },
    legacyPostingReviewRequired,
    transactions,
  })
}
