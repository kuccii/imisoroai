'use client'

import { useState } from 'react'
import { AlertTriangle, Check, ExternalLink, FileText, RefreshCw, X } from 'lucide-react'

type ReviewStatus = 'supported' | 'unsupported'

type UpdatedInvoice = {
  id: string
  status: 'pending' | ReviewStatus
  supplier: string
  tin: string
  invoiceNumber: string
  invoiceDate: string
  amount: number
  vat: number
  currency: string
  extractionStatus: string
  extractionConfidence: string | number | null
  ebmEvidence: 'ebm_present' | 'ebm_missing' | 'unclear'
  extractionNotes: string
}

type Props = {
  invoiceId: string
  status: 'pending' | ReviewStatus
  supplier: string
  tin: string
  invoiceNumber: string
  invoiceDate: string
  amount: number
  vat: number
  currency: string
  extractionStatus: string
  extractionConfidence: number | null
  ebmEvidence: 'ebm_present' | 'ebm_missing' | 'unclear'
  extractionNotes: string[]
  documentPathname?: string | null
  originalFilename?: string | null
  expanded: boolean
  onToggle: () => void
  onUpdated: (invoice: UpdatedInvoice) => void
}

export function InvoiceReviewActions({
  invoiceId, status, supplier: initialSupplier, tin: initialTin, invoiceNumber: initialInvoiceNumber,
  invoiceDate: initialDate, amount: initialAmount, vat: initialVat, currency, extractionStatus,
  extractionConfidence, ebmEvidence: initialEvidence, extractionNotes, documentPathname,
  originalFilename, expanded, onToggle, onUpdated,
}: Props) {
  const [supplier, setSupplier] = useState(initialSupplier)
  const [tin, setTin] = useState(initialTin)
  const [invoiceNumber, setInvoiceNumber] = useState(initialInvoiceNumber)
  const [invoiceDate, setInvoiceDate] = useState(/^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? initialDate : '')
  const [amount, setAmount] = useState(String(initialAmount))
  const [vat, setVat] = useState(String(initialVat))
  const [ebmEvidence, setEbmEvidence] = useState(initialEvidence)
  const [reviewNote, setReviewNote] = useState('')
  const [saving, setSaving] = useState<ReviewStatus | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [error, setError] = useState('')

  function syncInvoice(invoice: UpdatedInvoice) {
    setSupplier(invoice.supplier)
    setTin(invoice.tin)
    setInvoiceNumber(invoice.invoiceNumber)
    setInvoiceDate(/^\d{4}-\d{2}-\d{2}$/.test(invoice.invoiceDate) ? invoice.invoiceDate : '')
    setAmount(String(invoice.amount))
    setVat(String(invoice.vat))
    setEbmEvidence(invoice.ebmEvidence)
    onUpdated(invoice)
  }

  async function retryExtraction() {
    if (!window.confirm('Run a new scan against the stored original? Any unsubmitted edits in this review form will be replaced.')) return
    setRetrying(true)
    setError('')
    try {
      const response = await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}`, { method: 'POST' })
      const data = await response.json()
      if (data.invoice) syncInvoice(data.invoice as UpdatedInvoice)
      if (!response.ok) setError(data.error || 'The invoice could not be scanned again.')
      else if (data.extractionFailed) setError('The original is safe, but extraction is still unavailable. Check the status above before retrying.')
    } catch {
      setError('The scan could not be retried. Check your connection and try again.')
    } finally {
      setRetrying(false)
    }
  }

  async function review(nextStatus: ReviewStatus) {
    if (reviewNote.trim().length < 10) {
      setError('Add a short note describing what you checked on the source.')
      return
    }

    setSaving(nextStatus)
    setError('')
    try {
      const response = await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus, reviewNote: reviewNote.trim(), supplier, tin, invoiceNumber, ebmEvidence, invoiceDate: invoiceDate || 'UNKNOWN', amount: Number(amount), vat: Number(vat) }),
      })
      const data = await response.json()
      if (!response.ok) {
        setError(data.error || 'The review could not be saved.')
        return
      }
      syncInvoice(data.invoice as UpdatedInvoice)
      setReviewNote('')
    } catch {
      setError('The review could not be saved. Check your connection and try again.')
    } finally {
      setSaving(null)
    }
  }

  const extractionBlocked = extractionStatus === 'credits_required' || extractionStatus === 'billing_required'
  const extractionUnavailable = extractionStatus === 'unavailable' || extractionStatus === 'legacy'

  return (
    <div className="mx-5 mb-4 rounded-2xl border border-[#e5eee8] bg-[#f8fbf9] p-4 md:mx-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${extractionStatus === 'extracted' ? 'bg-[#dff3e9] text-[#0f8062]' : 'bg-[#fff3dc] text-[#a56b16]'}`}>
            {extractionStatus === 'extracted' ? <FileText className="size-4" /> : <AlertTriangle className="size-4" />}
          </span>
          <div>
            <p className="text-xs font-bold">{status === 'pending' ? 'Review this invoice' : status === 'supported' ? 'Included in workpapers' : 'Excluded from workpapers'}</p>
            <p className="mt-1 text-[11px] text-[#678078]">{extractionStatus === 'extracted' ? `AI draft · ${Math.round((extractionConfidence ?? 0) * 100)}% confidence · verify every value` : extractionBlocked ? 'Source saved · paid AI Gateway credits required to scan' : 'Source saved · enter or correct the details manually'}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {documentPathname && <a href={`/api/files?pathname=${encodeURIComponent(documentPathname)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-[#c8ddd2] bg-white px-3 py-2 text-xs font-semibold text-[#0f5c49"><ExternalLink className="size-3.5" />{originalFilename || 'Open original'}</a>}
          <button type="button" onClick={onToggle} aria-expanded={expanded} aria-controls={`invoice-review-${invoiceId}`} className="rounded-lg bg-[#10251f] px-3 py-2 text-xs font-bold text-white">{expanded ? 'Close review' : 'Review details'}</button>
        </div>
      </div>

      {expanded && <div id={`invoice-review-${invoiceId}`} className="mt-4 border-t border-[#e5eee8] pt-4">
        {extractionBlocked && <div role="status" className="mb-4 flex flex-col gap-3 rounded-xl border border-[#ead9b8] bg-[#fff9ec] p-4 text-xs leading-5 text-[#735725] sm:flex-row sm:items-center sm:justify-between"><p><strong>Automatic scan is blocked.</strong> {extractionStatus === 'credits_required' ? 'This model needs AI Gateway paid credits; adding a card alone does not unlock it.' : 'AI Gateway requires a verified payment method.'} Your original is preserved, and you can still enter the fields manually.</p><div className="flex shrink-0 items-center gap-3">{extractionStatus === 'credits_required' && <a href="https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dtop-up" target="_blank" rel="noopener noreferrer" className="font-bold underline">Add AI credits</a>}{extractionStatus === 'billing_required' && <a href="https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dadd-credit-card" target="_blank" rel="noopener noreferrer" className="font-bold underline">Verify billing</a>}<button type="button" onClick={() => void retryExtraction()} disabled={retrying} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 font-bold disabled:opacity-50"><RefreshCw className={`size-3.5 ${retrying ? 'animate-spin' : ''}`} />{retrying ? 'Scanning…' : 'Retry scan'}</button></div></div>}
        {extractionUnavailable && <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#ead9b8] bg-[#fff9ec] p-4 text-xs leading-5 text-[#735725]"><p><strong>Extraction needs attention.</strong> {extractionNotes[0] || 'The source is saved; check the values manually or retry the scan.'}</p><button type="button" onClick={() => void retryExtraction()} disabled={retrying || !documentPathname} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-2 font-bold text-[#735725] disabled:opacity-50"><RefreshCw className={`size-3.5 ${retrying ? 'animate-spin' : ''}`} />{retrying ? 'Scanning…' : 'Try scan again'}</button></div>}
        {extractionStatus === 'processing' && <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#eef5f0] p-3 text-xs text-[#31564a]"><p>A scan is in progress. If it has been stuck for more than two minutes, retry from the saved original.</p><button type="button" onClick={() => void retryExtraction()} disabled={retrying} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 font-bold disabled:opacity-50"><RefreshCw className={`size-3.5 ${retrying ? 'animate-spin' : ''}`} />{retrying ? 'Scanning…' : 'Retry scan'}</button></div>}
        {extractionNotes.length > 0 && extractionStatus === 'extracted' && <ul className="mb-4 list-disc space-y-1 rounded-xl bg-[#eef5f0] p-4 pl-8 text-xs leading-5 text-[#31564a]">{extractionNotes.map((note, index) => <li key={`${index}-${note}`}>{note}</li>)}</ul>}
        <form className="space-y-3" onSubmit={(event) => event.preventDefault()}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-semibold">Supplier<input required minLength={2} maxLength={160} value={supplier} onChange={(event) => setSupplier(event.target.value)} className="h-10 rounded-lg border border-[#c8ddd2] bg-white px-3 text-xs font-normal outline-none focus:border-[#0f8062]" /></label>
            <label className="grid gap-1.5 text-xs font-semibold">Supplier TIN<input required minLength={3} maxLength={40} value={tin} onChange={(event) => setTin(event.target.value)} className="h-10 rounded-lg border border-[#c8ddd2] bg-white px-3 text-xs font-normal outline-none focus:border-[#0f8062]" /></label>
            <label className="grid gap-1.5 text-xs font-semibold">Invoice / EBM number<input maxLength={80} value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} className="h-10 rounded-lg border border-[#c8ddd2] bg-white px-3 text-xs font-normal outline-none focus:border-[#0f8062]" /></label>
            <label className="grid gap-1.5 text-xs font-semibold">Invoice date<input type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} className="h-10 rounded-lg border border-[#c8ddd2] bg-white px-3 text-xs font-normal outline-none focus:border-[#0f8062]" /></label>
            <div className="grid grid-cols-2 gap-2"><label className="grid gap-1.5 text-xs font-semibold">Total (RWF)<input required type="number" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} className="h-10 w-full rounded-lg border border-[#c8ddd2] bg-white px-2 text-xs font-normal outline-none focus:border-[#0f8062]" /></label><label className="grid gap-1.5 text-xs font-semibold">VAT (RWF)<input required type="number" min="0" step="1" value={vat} onChange={(event) => setVat(event.target.value)} className="h-10 w-full rounded-lg border border-[#c8ddd2] bg-white px-2 text-xs font-normal outline-none focus:border-[#0f8062]" /></label></div>
            <label className="grid gap-1.5 text-xs font-semibold">EBM evidence on original<select value={ebmEvidence} onChange={(event) => setEbmEvidence(event.target.value as Props['ebmEvidence'])} className="h-10 rounded-lg border border-[#c8ddd2] bg-white px-3 text-xs font-normal outline-none focus:border-[#0f8062]"><option value="ebm_present">Visible</option><option value="ebm_missing">Not visible</option><option value="unclear">Unclear — verify</option></select></label>
          </div>
          <p className="text-[11px] leading-5 text-[#678078]">Detected currency: {currency || 'not detected'}. Review the EBM indicator on the original; AI evidence is not RRA verification.</p>
          <label className="grid gap-1.5 text-xs font-semibold" htmlFor={`review-note-${invoiceId}`}>Review note<textarea id={`review-note-${invoiceId}`} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} minLength={10} maxLength={500} required rows={2} placeholder="What did you verify on the original invoice?" className="w-full resize-y rounded-xl border border-[#c8ddd2] bg-white px-3 py-2.5 text-xs font-normal outline-none focus:border-[#0f8062] focus:ring-2 focus:ring-[#0f8062]/10" /></label>
          {error && <p role="alert" className="text-xs font-medium text-[#b54739]">{error}</p>}
          <p className="text-[11px] leading-5 text-[#678078]">This decision only organizes internal filing workpapers. It does not certify the invoice or submit a tax claim to RRA.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={saving !== null || !documentPathname} onClick={() => void review('supported')} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0f5c49] px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"><Check className="size-3.5" />{saving === 'supported' ? 'Saving…' : 'Include in workpapers'}</button>
            <button type="button" disabled={saving !== null} onClick={() => void review('unsupported')} className="inline-flex items-center gap-1.5 rounded-lg border border-[#e4c7c2] bg-white px-3 py-2 text-xs font-bold text-[#9b3d32] disabled:cursor-not-allowed disabled:opacity-50"><X className="size-3.5" />{saving === 'unsupported' ? 'Saving…' : 'Exclude from workpapers'}</button>
          </div>
        </form>
      </div>}
    </div>
  )
}
