export type PurchaseRow = {
  id: string
  supplier: string
  tin?: string
  receiptNumber?: string
  date: string
  amount: number
  vat?: number
  possibleNoEbM?: boolean
}

export type PaymentRow = {
  id: string
  supplier: string
  date: string
  amount: number
  possibleNoEbM?: boolean
}

export type MatchGroup = 'supported' | 'missing_at_rra' | 'likely_no_ebm_possible' | 'in_rra_not_in_books' | 'needs_review'

export type MatchResult = {
  group: MatchGroup
  purchaseIds: string[]
  paymentIds: string[]
  reason: string
  confidence: number
  amountDifference: number | null
}

export type MatchOptions = {
  supplierMappings?: Record<string, string>
  amountToleranceRwf?: number
  dateWindowDays?: number
}

const normalize = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
const daysBetween = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000
const toleranceFor = (amount: number, fixed: number) => Math.max(fixed, Math.round(Math.abs(amount) * 0.01))

function supplierKey(name: string, mappings: Record<string, string>) {
  const normalized = normalize(name)
  return mappings[normalized] || normalized
}

function amountVariants(purchase: PurchaseRow) {
  const variants = [purchase.amount]
  if (purchase.vat !== undefined && purchase.vat >= 0 && purchase.vat <= purchase.amount) variants.push(purchase.amount - purchase.vat)
  return [...new Set(variants)]
}

/** Deterministic suggestions only. A human must confirm every result and first-time supplier mapping. */
export function matchPurchases(purchases: PurchaseRow[], payments: PaymentRow[], options: MatchOptions = {}): MatchResult[] {
  const mappings = options.supplierMappings ?? {}
  const dateWindow = options.dateWindowDays ?? 30
  const fixedTolerance = options.amountToleranceRwf ?? 100
  const usedPurchases = new Set<string>()
  const usedPayments = new Set<string>()
  const results: MatchResult[] = []
  const pairings: { purchase: PurchaseRow; payment: PaymentRow; diff: number; variant: 'gross' | 'net' }[] = []

  for (const purchase of purchases) {
    for (const payment of payments) {
      if (supplierKey(purchase.supplier, mappings) !== supplierKey(payment.supplier, mappings)) continue
      if (daysBetween(purchase.date, payment.date) > dateWindow) continue
      const variants = amountVariants(purchase).map((amount, index) => ({ diff: Math.abs(amount - payment.amount), variant: index === 0 ? 'gross' as const : 'net' as const }))
      const best = variants.sort((a, b) => a.diff - b.diff)[0]
      if (best.diff <= toleranceFor(payment.amount, fixedTolerance)) pairings.push({ purchase, payment, ...best })
    }
  }

  pairings.sort((a, b) => a.diff - b.diff || a.purchase.id.localeCompare(b.purchase.id) || a.payment.id.localeCompare(b.payment.id))
  const byPurchase = new Map<string, number>()
  const byPayment = new Map<string, number>()
  for (const pair of pairings) {
    byPurchase.set(pair.purchase.id, (byPurchase.get(pair.purchase.id) ?? 0) + 1)
    byPayment.set(pair.payment.id, (byPayment.get(pair.payment.id) ?? 0) + 1)
  }

  for (const pair of pairings) {
    if (usedPurchases.has(pair.purchase.id) || usedPayments.has(pair.payment.id)) continue
    const ambiguous = (byPurchase.get(pair.purchase.id) ?? 0) > 1 || (byPayment.get(pair.payment.id) ?? 0) > 1
    if (ambiguous) {
      usedPurchases.add(pair.purchase.id)
      usedPayments.add(pair.payment.id)
      results.push({ group: 'needs_review', purchaseIds: [pair.purchase.id], paymentIds: [pair.payment.id], reason: 'Multiple deterministic candidates; confirm the supplier/payment mapping before matching.', confidence: 0.45, amountDifference: pair.diff })
      continue
    }
    usedPurchases.add(pair.purchase.id)
    usedPayments.add(pair.payment.id)
    const nameExact = normalize(pair.purchase.supplier) === normalize(pair.payment.supplier)
    const confidence = Math.max(0.7, Math.min(0.99, 0.96 - pair.diff / Math.max(pair.payment.amount, 1) - (nameExact ? 0 : 0.12)))
    results.push({
      group: pair.purchase.possibleNoEbM || pair.payment.possibleNoEbM ? 'likely_no_ebm_possible' : 'supported',
      purchaseIds: [pair.purchase.id],
      paymentIds: [pair.payment.id],
      reason: `Supplier and date are within ${dateWindow} days; ${pair.variant === 'gross' ? 'gross' : 'VAT-exclusive'} amount difference is RWF ${pair.diff}. Human confirmation required.`,
      confidence,
      amountDifference: pair.diff,
    })
  }

  const unmatchedPurchases = purchases.filter(row => !usedPurchases.has(row.id))
  const unmatchedPayments = payments.filter(row => !usedPayments.has(row.id))
  const groupedPurchases = groupBySupplier(unmatchedPurchases, mappings)
  const groupedPayments = groupBySupplier(unmatchedPayments, mappings)

  for (const [key, rows] of groupedPayments) {
    const candidates = groupedPurchases.get(key) ?? []
    const combo = findCombination(candidates, rows.reduce((sum, row) => sum + row.amount, 0), fixedTolerance)
    if (combo && rows.length > 1 && combo.length === 1) {
      const dateOk = rows.every(payment => daysBetween(payment.date, combo[0].date) <= dateWindow)
      if (dateOk) {
        rows.forEach(row => usedPayments.add(row.id))
        usedPurchases.add(combo[0].id)
        results.push({ group: combo[0].possibleNoEbM ? 'likely_no_ebm_possible' : 'supported', purchaseIds: [combo[0].id], paymentIds: rows.map(row => row.id), reason: `Combined ${rows.length} payments match one receipt within RWF ${toleranceFor(combo[0].amount, fixedTolerance)}; human confirmation required.`, confidence: 0.78, amountDifference: Math.abs(combo[0].amount - rows.reduce((sum, row) => sum + row.amount, 0)) })
      }
    }
  }

  for (const [key, rows] of groupedPurchases) {
    const candidates = groupedPayments.get(key) ?? []
    const combo = findCombination(candidates, rows.reduce((sum, row) => sum + row.amount, 0), fixedTolerance)
    if (combo && rows.length > 1 && combo.length === 1 && rows.every(row => daysBetween(row.date, combo[0].date) <= dateWindow)) {
      rows.forEach(row => usedPurchases.add(row.id))
      usedPayments.add(combo[0].id)
      results.push({ group: rows.some(row => row.possibleNoEbM) ? 'likely_no_ebm_possible' : 'supported', purchaseIds: rows.map(row => row.id), paymentIds: [combo[0].id], reason: `One payment matches ${rows.length} receipts combined; human confirmation required.`, confidence: 0.76, amountDifference: Math.abs(combo[0].amount - rows.reduce((sum, row) => sum + row.amount, 0)) })
    }
  }

  for (const row of payments.filter(item => !usedPayments.has(item.id))) {
    results.push({ group: row.possibleNoEbM ? 'likely_no_ebm_possible' : 'missing_at_rra', purchaseIds: [], paymentIds: [row.id], reason: row.possibleNoEbM ? 'User-tagged as likely no-EBM-possible; this is not a tax classification.' : 'Business payment has no matching purchase in the imported RRA list.', confidence: row.possibleNoEbM ? 1 : 0.5, amountDifference: null })
  }
  for (const row of purchases.filter(item => !usedPurchases.has(item.id))) {
    results.push({ group: 'in_rra_not_in_books', purchaseIds: [row.id], paymentIds: [], reason: 'Purchase appears in the imported RRA list but no matching business payment was found.', confidence: 0.5, amountDifference: null })
  }

  return results
}

function groupBySupplier<T extends { supplier: string }>(rows: T[], mappings: Record<string, string>) {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const key = supplierKey(row.supplier, mappings)
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  return groups
}

function findCombination<T extends { amount: number }>(rows: T[], target: number, fixedTolerance: number): T[] | null {
  const eligible = rows.slice(0, 12)
  const max = Math.min(eligible.length, 3)
  const tolerance = toleranceFor(target, fixedTolerance)
  for (let size = 1; size <= max; size++) {
    const search = (start: number, picked: T[], total: number): T[] | null => {
      if (picked.length === size) return Math.abs(total - target) <= tolerance ? picked : null
      for (let index = start; index <= eligible.length - (size - picked.length); index++) {
        const result = search(index + 1, [...picked, eligible[index]], total + eligible[index].amount)
        if (result) return result
      }
      return null
    }
    const found = search(0, [], 0)
    if (found) return found
  }
  return null
}
