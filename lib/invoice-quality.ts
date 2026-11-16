export type InvoiceReviewFields = {
  supplier: string
  tin: string
  invoiceDate: string
  invoiceNumber: string
  amount: number
  vat: number
  currency: string
  ebmEvidence: string
  confidence?: number | null
}

export function getInvoiceReviewIssues(invoice: InvoiceReviewFields): string[] {
  const issues: string[] = []
  if (invoice.confidence !== undefined && invoice.confidence !== null && invoice.confidence < 0.7) issues.push('Low OCR confidence — compare every field with the original')
  if (!invoice.supplier.trim() || /^(unknown supplier|unknown|pending)$/i.test(invoice.supplier.trim())) issues.push('Confirm supplier name')
  if (!invoice.tin.trim() || /^(pending|unknown|n\/a)$/i.test(invoice.tin.trim())) issues.push('Confirm supplier TIN')
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(invoice.invoiceDate)
  const date = dateMatch ? new Date(Date.UTC(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]))) : null
  if (!date || date.toISOString().slice(0, 10) !== invoice.invoiceDate) issues.push('Confirm invoice date')
  if (!invoice.invoiceNumber.trim() || /^unknown$/i.test(invoice.invoiceNumber.trim())) issues.push('Confirm invoice or EBM number')
  if (!Number.isFinite(invoice.amount) || invoice.amount <= 0) issues.push('Confirm invoice total')
  if (!Number.isFinite(invoice.vat) || invoice.vat < 0 || invoice.vat > invoice.amount) issues.push('Check VAT against the invoice total')
  else if (invoice.vat === 0) issues.push('Confirm zero VAT or no VAT is charged')
  if (invoice.currency.trim().toUpperCase() !== 'RWF') issues.push('Verify currency conversion to RWF before workpapers')
  if (invoice.ebmEvidence !== 'ebm_present') issues.push(invoice.ebmEvidence === 'ebm_missing' ? 'Check missing EBM evidence' : 'Verify EBM evidence on the original')
  return issues
}
