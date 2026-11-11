import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { auditEvent, businessTransaction, ledgerAccount, ledgerEntry } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const transactionSchema = z.object({
  type: z.enum(['sale', 'purchase', 'expense']),
  counterparty: z.string().trim().min(2).max(160),
  reference: z.string().trim().max(80).optional(),
  amount: z.number().int().positive().max(1_000_000_000),
  vatAmount: z.number().int().nonnegative().max(1_000_000_000).default(0),
  transactionDate: z.string().date(),
}).superRefine((transaction, context) => {
  if (transaction.vatAmount > transaction.amount) {
    context.addIssue({ code: 'custom', path: ['vatAmount'], message: 'Declared VAT cannot exceed the gross amount.' })
  }
  if (transaction.type !== 'sale' && transaction.vatAmount !== 0) {
    context.addIssue({ code: 'custom', path: ['vatAmount'], message: 'Only sales can include declared output VAT.' })
  }
})

const defaultAccounts = [
  { code: '1000', name: 'Cash and bank', type: 'asset' },
  { code: '1100', name: 'Accounts receivable', type: 'asset' },
  { code: '1200', name: 'Input VAT pending review', type: 'asset' },
  { code: '2000', name: 'Accounts payable', type: 'liability' },
  { code: '2100', name: 'VAT payable', type: 'liability' },
  { code: '4000', name: 'Sales revenue', type: 'income' },
  { code: '5000', name: 'Operating expenses', type: 'expense' },
]

async function getUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user ?? null
}

async function ensureAccounts(userId: string) {
  return db.transaction(async (tx) => {
    const existing = await tx.select().from(ledgerAccount).where(eq(ledgerAccount.userId, userId))
    const existingCodes = new Set(existing.map((account) => account.code))
    const missing = defaultAccounts.filter((account) => !existingCodes.has(account.code))

    if (missing.length) {
      await tx.insert(ledgerAccount).values(missing.map((account) => ({
        ...account,
        id: `ACC-${userId}-${account.code}`,
        userId,
      }))).onConflictDoNothing()
    }

    return tx.select().from(ledgerAccount).where(eq(ledgerAccount.userId, userId))
  })
}

export async function GET() {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const accounts = await ensureAccounts(user.id)
  const [transactions, entries] = await Promise.all([
    db.select().from(businessTransaction).where(eq(businessTransaction.userId, user.id)),
    db.select().from(ledgerEntry).where(eq(ledgerEntry.userId, user.id)),
  ])
  return NextResponse.json({ accounts, transactions, entries })
}

export async function POST(request: Request) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let input: unknown
  try {
    input = await request.json()
  } catch {
    return NextResponse.json({ error: 'Enter a valid transaction.' }, { status: 400 })
  }

  const parsed = transactionSchema.safeParse(input)
  if (!parsed.success) return NextResponse.json({ error: 'Enter a valid transaction.' }, { status: 400 })

  const accounts = await ensureAccounts(user.id)
  const accountByCode = new Map(accounts.map((account) => [account.code, account]))
  const cash = accountByCode.get('1000')
  const revenue = accountByCode.get('4000')
  const vatPayable = accountByCode.get('2100')
  const expense = accountByCode.get('5000')
  if (!cash || !revenue || !vatPayable || !expense) {
    return NextResponse.json({ error: 'The account chart is incomplete. Contact support before posting.' }, { status: 409 })
  }

  const { type, amount, vatAmount, ...details } = parsed.data
  const id = `TX-${crypto.randomUUID()}`
  const postings = type === 'sale'
    ? [
        { accountId: cash.id, debit: amount, credit: 0 },
        { accountId: revenue.id, debit: 0, credit: amount - vatAmount },
        ...(vatAmount > 0 ? [{ accountId: vatPayable.id, debit: 0, credit: vatAmount }] : []),
      ]
    : [
        { accountId: expense.id, debit: amount, credit: 0 },
        { accountId: cash.id, debit: 0, credit: amount },
      ]

  const transaction = await db.transaction(async (tx) => {
    const [saved] = await tx.insert(businessTransaction).values({
      id,
      userId: user.id,
      type,
      amount,
      ...details,
      status: 'unmatched',
      source: 'manual_v2',
    }).returning()

    await tx.insert(ledgerEntry).values(postings.map((posting, index) => ({
      id: `${id}-${index + 1}`,
      userId: user.id,
      accountId: posting.accountId,
      referenceType: type,
      referenceId: id,
      description: details.counterparty,
      debit: posting.debit,
      credit: posting.credit,
      entryDate: details.transactionDate,
    })))

    await tx.insert(auditEvent).values({
      id: `AUD-${crypto.randomUUID()}`,
      userId: user.id,
      action: 'transaction_posted',
      entityType: 'business_transaction',
      entityId: id,
      metadata: JSON.stringify({ grossAmountRwf: amount, declaredOutputVatRwf: type === 'sale' ? vatAmount : 0, postingVersion: 2 }),
    })

    return saved
  })

  return NextResponse.json({ transaction }, { status: 201 })
}
