import assert from 'node:assert/strict'
import test from 'node:test'
import { getInvoiceReviewIssues } from '../lib/invoice-quality'

const completeInvoice = {
  supplier: 'Kigali Supplies Ltd',
  tin: '103456789',
  invoiceDate: '2026-06-18',
  invoiceNumber: 'EBM-2048',
  amount: 118000,
  vat: 18000,
  currency: 'RWF',
  ebmEvidence: 'ebm_present' as const,
}

test('complete RWF invoice with visible EBM evidence has no quality issues', () => {
  assert.deepEqual(getInvoiceReviewIssues(completeInvoice), [])
})

test('flags missing identifiers, invalid dates, inconsistent VAT, non-RWF amounts, and uncertain EBM evidence', () => {
  const issues = getInvoiceReviewIssues({
    ...completeInvoice,
    supplier: 'Unknown supplier',
    tin: 'PENDING',
    invoiceDate: '2026-02-31',
    invoiceNumber: 'UNKNOWN',
    amount: 0,
    vat: 0,
    currency: 'USD',
    ebmEvidence: 'unclear',
    confidence: 0.55,
  })
  assert.deepEqual(issues, [
    'Low OCR confidence — compare every field with the original',
    'Confirm supplier name',
    'Confirm supplier TIN',
    'Confirm invoice date',
    'Confirm invoice or EBM number',
    'Confirm invoice total',
    'Confirm zero VAT or no VAT is charged',
    'Verify currency conversion to RWF before workpapers',
    'Verify EBM evidence on the original',
  ])
})
