'use client'

import { useState } from 'react'
import { Check, ExternalLink, X } from 'lucide-react'

type ReviewStatus = 'supported' | 'unsupported'

type UpdatedInvoice = { id: string; status: ReviewStatus; supplier: string; tin: string; invoiceDate: string; amount: number; vat: number }

type Props = {
  invoiceId: string
  status: 'pending' | ReviewStatus
  supplier: string
  tin: string
  invoiceDate: string
  amount: number
  vat: number
  documentPathname?: string | null
  originalFilename?: string | null
  onReviewed: (invoice: UpdatedInvoice) => void
}

export function InvoiceReviewActions({ invoiceId, status, supplier: initialSupplier, tin: initialTin, invoiceDate: initialDate, amount: initialAmount, vat: initialVat, documentPathname, originalFilename, onReviewed }: Props) {
  const [supplier, setSupplier] = useState(initialSupplier)
  const [tin, setTin] = useState(initialTin)
  const [invoiceDate, setInvoiceDate] = useState(/^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? initialDate : '')
  const [amount, setAmount] = useState(String(initialAmount))
  const [vat, setVat] = useState(String(initialVat))
  const [reviewNote, setReviewNote] = useState('')
  const [saving, setSaving] = useState<ReviewStatus | null>(null)
  const [error, setError] = useState('')

  async function review(nextStatus: ReviewStatus) {
    if (reviewNote.trim().length < 10) {
      setError('Add a review note of at least 10 characters.')
      return
    }

    setSaving(nextStatus)
    setError('')
    try {
      const response = await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus, reviewNote: reviewNote.trim(), supplier, tin, invoiceDate: invoiceDate || 'UNKNOWN', amount: Number(amount), vat: Number(vat) }),
      })
      const data = await response.json()
      if (!response.ok) {
        setError(data.error || 'The review could not be saved.')
        return
      }
      onReviewed(data.invoice as UpdatedInvoice)
      setReviewNote('')
    } catch {
      setError('The review could not be saved. Check your connection and try again.')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="mx-5 mb-4 rounded-2xl border border-[#e5eee8] bg-[#f8fbf9] p-4 md:mx-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold">Human review required</p>
          <p className="mt-1 text-[11px] leading-5 text-[#678078]">AI extraction is advisory. Inspect the source and record why you approved or rejected it.</p>
        </div>
        {documentPathname && (
          <a
            href={`/api/files?pathname=${encodeURIComponent(documentPathname)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#c8ddd2] bg-white px-3 py-2 text-xs font-semibold text-[#0f5c49]"
          >
            <ExternalLink className="size-3.5" />
            {originalFilename || 'Open original'}
          </a>
        )}
      </div>
      {status !== 'pending' && <p className="mt-3 text-[11px] font-semibold text-[#678078]">Current decision: {status}. A new decision will be recorded in the audit history.</p>}
      <form className="mt-4 space-y-3" onSubmit={(event) => event.preventDefault()}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-semibold">Supplier<input required minLength={2} maxLength={160} value={supplier} onChange={(event) => setSupplier(event.target.value)} className="h-10 rounded-lg border border-[#c8ddd2] bg-white px-3 text-xs font-normal outline-none focus:border-[#0f8062]" /></label>
          <label className="grid gap-1.5 text-xs font-semibold">Supplier TIN<input required minLength={3} maxLength={40} value={tin} onChange={(event) => setTin(event.target.value)} className="h-10 rounded-lg border border-[#c8ddd2] bg-white px-3 text-xs font-normal outline-none focus:border-[#0f8062]" /></label>
          <label className="grid gap-1.5 text-xs font-semibold">Invoice date<input type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} className="h-10 rounded-lg border border-[#c8ddd2] bg-white px-3 text-xs font-normal outline-none focus:border-[#0f8062]" /></label>
          <div className="grid grid-cols-2 gap-2"><label className="grid gap-1.5 text-xs font-semibold">Total (RWF)<input required type="number" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} className="h-10 w-full rounded-lg border border-[#c8ddd2] bg-white px-2 text-xs font-normal outline-none focus:border-[#0f8062]" /></label><label className="grid gap-1.5 text-xs font-semibold">VAT (RWF)<input required type="number" min="0" step="1" value={vat} onChange={(event) => setVat(event.target.value)} className="h-10 w-full rounded-lg border border-[#c8ddd2] bg-white px-2 text-xs font-normal outline-none focus:border-[#0f8062]" /></label></div>
        </div>
        <label className="grid gap-1.5 text-xs font-semibold" htmlFor={`review-note-${invoiceId}`}>
          Review note
          <textarea
            id={`review-note-${invoiceId}`}
            value={reviewNote}
            onChange={(event) => setReviewNote(event.target.value)}
            minLength={10}
            maxLength={500}
            required
            rows={2}
            placeholder="What did you verify on the original invoice?"
            className="w-full resize-y rounded-xl border border-[#c8ddd2] bg-white px-3 py-2.5 text-xs font-normal outline-none focus:border-[#0f8062] focus:ring-2 focus:ring-[#0f8062]/10"
          />
        </label>
        {error && <p role="alert" className="text-xs font-medium text-[#b54739]">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={saving !== null || !documentPathname} onClick={() => void review('supported')} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0f5c49] px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
            <Check className="size-3.5" />
            {saving === 'supported' ? 'Saving…' : 'Approve as supported'}
          </button>
          <button type="button" disabled={saving !== null} onClick={() => void review('unsupported')} className="inline-flex items-center gap-1.5 rounded-lg border border-[#e4c7c2] bg-white px-3 py-2 text-xs font-bold text-[#9b3d32] disabled:cursor-not-allowed disabled:opacity-50">
            <X className="size-3.5" />
            {saving === 'unsupported' ? 'Saving…' : 'Mark unsupported'}
          </button>
        </div>
      </form>
    </div>
  )
}
