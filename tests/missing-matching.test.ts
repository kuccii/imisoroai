import test from 'node:test'
import assert from 'node:assert/strict'
import { matchPurchases, type PaymentRow, type PurchaseRow } from '../lib/missing-matching'

const purchase = (id: string, supplier: string, amount: number, vat = 0): PurchaseRow => ({ id, supplier, tin: '', date: '2026-10-15', amount, vat })
const payment = (id: string, supplier: string, amount: number, date = '2026-10-15'): PaymentRow => ({ id, supplier, date, amount })

test('does not guess between ambiguous supplier names; asks for human review', () => {
  const result = matchPurchases(
    [purchase('rra-1', 'Alpha Trading Ltd', 120_000)],
    [payment('bank-1', 'Alpha Traders', 120_000)],
  )
  assert.equal(result[0].group, 'missing_at_rra')
  assert.equal(result[1].group, 'in_rra_not_in_books')
})

test('surfaces multiple amount candidates as one needs-review group', () => {
  const result = matchPurchases(
    [purchase('rra-a', 'Alpha Trading', 100_000), purchase('rra-b', 'Alpha Trading', 100_050)],
    [payment('bank-1', 'Alpha Trading', 100_000)],
  )
  assert.equal(result.length, 1)
  assert.equal(result[0].group, 'needs_review')
  assert.deepEqual(result[0].purchaseIds.sort(), ['rra-a', 'rra-b'])
})

test('confirmed supplier mapping enables deterministic split-payment match', () => {
  const result = matchPurchases(
    [purchase('rra-1', 'Alpha Trading Ltd', 120_000)],
    [payment('bank-1', 'Alpha Traders', 50_000), payment('bank-2', 'Alpha Traders', 70_000)],
    { supplierMappings: { alphatradingltd: 'alpha', alphatraders: 'alpha' } },
  )
  assert.equal(result.length, 1)
  assert.equal(result[0].group, 'supported')
  assert.deepEqual(result[0].paymentIds, ['bank-1', 'bank-2'])
})

test('matches VAT-exclusive payment amount against VAT-inclusive receipt', () => {
  const result = matchPurchases(
    [purchase('rra-1', 'Kivu Supplies', 118_000, 18_000)],
    [payment('bank-1', 'Kivu Supplies', 100_000)],
  )
  assert.equal(result[0].group, 'supported')
  assert.match(result[0].reason, /VAT-exclusive/)
})

test('matches one payment to combined receipts and respects date window', () => {
  const result = matchPurchases(
    [purchase('rra-1', 'Kivu Supplies', 40_000), purchase('rra-2', 'Kivu Supplies', 60_000)],
    [payment('bank-1', 'Kivu Supplies', 100_000)],
  )
  assert.equal(result.length, 1)
  assert.deepEqual(result[0].purchaseIds, ['rra-1', 'rra-2'])
  assert.equal(result[0].group, 'supported')
})
