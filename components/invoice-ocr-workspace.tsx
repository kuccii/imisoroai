'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { AlertTriangle, Check, FileText, LoaderCircle, ScanLine, Upload } from 'lucide-react'
import { InvoiceReviewActions } from '@/components/invoice-review-actions'

type DocumentKind = 'purchase_invoice' | 'expense_receipt'
type InvoiceRow = {
  id: string
  clientId: string | null
  documentKind: DocumentKind
  supplier: string
  tin: string
  invoiceDate: string
  amount: number
  vat: number
  status: 'pending' | 'supported' | 'unsupported'
  blobPathname: string | null
  originalFilename: string | null
  invoiceNumber: string
  currency: string
  extractionStatus: string
  extractionConfidence: string | number | null
  ebmEvidence: 'ebm_present' | 'ebm_missing' | 'unclear'
  extractionNotes: string
}

type InvoiceResponse = { invoices: InvoiceRow[]; needsConsent?: boolean }
const fetcher = async (url: string): Promise<InvoiceResponse> => {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Could not load the invoice inbox.')
  return response.json()
}

const money = (value: number) => new Intl.NumberFormat('en-RW', { style: 'currency', currency: 'RWF', maximumFractionDigits: 0 }).format(value)

export function InvoiceOcrWorkspace({ clientId, canProcess }: { clientId?: string; canProcess: boolean }) {
  const endpoint = clientId ? `/api/invoices?clientId=${encodeURIComponent(clientId)}` : null
  const { data, error, mutate } = useSWR<InvoiceResponse>(endpoint, fetcher)
  const [documentKind, setDocumentKind] = useState<DocumentKind>('purchase_invoice')
  const [files, setFiles] = useState<File[]>([])
  const [processing, setProcessing] = useState(false)
  const [currentFile, setCurrentFile] = useState('')
  const [message, setMessage] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'needs_review' | 'all'>('needs_review')
  const invoices = data?.invoices ?? []
  const pending = invoices.filter(invoice => invoice.status === 'pending')
  const visibleInvoices = filter === 'needs_review' ? pending : invoices

  const chooseFiles = (list: FileList | null) => {
    const selected = Array.from(list ?? [])
    const oversized = selected.find(file => file.size === 0 || file.size > 10 * 1024 * 1024)
    if (oversized) {
      setFiles([])
      setMessage(`${oversized.name} is empty or larger than 10 MB. Choose smaller files.`)
      return
    }
    const unsupported = selected.find(file => !['application/pdf', 'image/jpeg', 'image/png'].includes(file.type))
    if (unsupported) {
      setFiles([])
      setMessage(`${unsupported.name} is not a supported PDF, JPG, or PNG.`)
      return
    }
    setFiles(selected)
    setMessage('')
  }

  const uploadSelected = async () => {
    if (!canProcess || !clientId || !files.length || processing) return
    setProcessing(true)
    setMessage('')
    let savedCount = 0
    const issues: string[] = []
    for (const file of files) {
      setCurrentFile(file.name)
      const body = new FormData()
      body.set('file', file)
      body.set('clientId', clientId)
      body.set('documentKind', documentKind)
      try {
        const response = await fetch('/api/ocr', { method: 'POST', body })
        const result = await response.json().catch(() => ({}))
        if (!response.ok) {
          if (result.saved) savedCount += 1
          issues.push(`${file.name}: ${result.error || 'could not be processed'}`)
        } else {
          savedCount += 1
        }
        if (savedCount) await mutate()
      } catch {
        issues.push(`${file.name}: connection failed`)
      }
    }
    setFiles([])
    setCurrentFile('')
    setProcessing(false)
    setMessage(issues.length ? `${savedCount} of ${files.length} saved. ${issues.join(' ')}` : `${savedCount} ${savedCount === 1 ? 'document' : 'documents'} saved as AI drafts. Review every field against the original.`)
    if (savedCount) await mutate()
  }

  return <div className="mt-7 flex flex-col gap-5">
    <section className="overflow-hidden rounded-2xl border border-[#c8ddd2] bg-white">
      <div className="grid gap-5 p-5 md:grid-cols-[1fr_1.1fr] md:p-6">
        <div>
          <div className="flex size-11 items-center justify-center rounded-xl bg-[#e4f5ec] text-[#0f8062]"><ScanLine className="size-5" /></div>
          <h2 className="mt-4 text-lg font-bold">Capture once. Review before filing.</h2>
          <p className="mt-2 max-w-lg text-sm leading-6 text-[#678078]">Add purchase invoices or expense receipts. Imisoro keeps each original private, drafts the visible fields, and queues every document for a person to verify.</p>
          <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-semibold text-[#587069]"><span className="rounded-full bg-[#f4f8f5] px-3 py-1.5">PDF, JPG, PNG</span><span className="rounded-full bg-[#f4f8f5] px-3 py-1.5">10 MB max each</span><span className="rounded-full bg-[#f4f8f5] px-3 py-1.5">Batch upload</span></div>
        </div>
        <div className="rounded-xl bg-[#f6faf7] p-4 md:p-5">
          <fieldset disabled={!canProcess || processing} className="flex flex-col gap-4 disabled:opacity-60">
            <legend className="text-xs font-bold uppercase tracking-[0.12em] text-[#678078]">1 · Choose document type</legend>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" aria-pressed={documentKind === 'purchase_invoice'} onClick={() => setDocumentKind('purchase_invoice')} className={`min-h-12 rounded-lg border px-3 text-left text-xs font-bold ${documentKind === 'purchase_invoice' ? 'border-[#0f8062] bg-white text-[#0f5c49] ring-1 ring-[#0f8062]' : 'border-[#dce9e1] bg-transparent text-[#587069]'}`}>Purchase invoice</button>
              <button type="button" aria-pressed={documentKind === 'expense_receipt'} onClick={() => setDocumentKind('expense_receipt')} className={`min-h-12 rounded-lg border px-3 text-left text-xs font-bold ${documentKind === 'expense_receipt' ? 'border-[#0f8062] bg-white text-[#0f5c49] ring-1 ring-[#0f8062]' : 'border-[#dce9e1] bg-transparent text-[#587069]'}`}>Expense receipt</button>
            </div>
            <label className="grid gap-2 text-xs font-bold" htmlFor="invoice-evidence-files">2 · Add your files
              <span onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); chooseFiles(event.dataTransfer.files) }} className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#9fcdb9] bg-white px-3 py-4 text-center text-[#587069] hover:border-[#0f8062]">
                <Upload className="size-4 text-[#0f8062]" />
                <span>{files.length ? `${files.length} file${files.length === 1 ? '' : 's'} selected` : 'Choose or drop multiple documents'}</span>
                <span className="text-[10px] font-normal">Each file is scanned separately and saved to this client workspace.</span>
              </span>
              <input id="invoice-evidence-files" type="file" multiple accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" onChange={event => chooseFiles(event.currentTarget.files)} className="sr-only" />
            </label>
            {files.length > 0 && <ul className="max-h-24 overflow-auto rounded-lg bg-white p-2 text-[11px] text-[#587069]">{files.map((file, index) => <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 py-1"><span className="truncate">{file.name}</span><span className="shrink-0">{(file.size / 1024 / 1024).toFixed(1)} MB</span></li>)}</ul>}
            <button type="button" onClick={() => void uploadSelected()} disabled={!files.length || processing || !canProcess} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#0f5c49] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
              {processing ? <><LoaderCircle className="size-4 animate-spin" />Scanning {currentFile}</> : <><ScanLine className="size-4" />Upload and scan {files.length ? `${files.length} ${files.length === 1 ? 'document' : 'documents'}` : ''}</>}
            </button>
          </fieldset>
          {!canProcess && <p className="mt-4 rounded-lg border border-[#ead9b8] bg-[#fff9ec] p-3 text-xs leading-5 text-[#765821]">Client consent is required before uploading or scanning documents. Select a client with active owner authorization.</p>}
          {message && <p role="status" className="mt-3 rounded-lg bg-white p-3 text-xs leading-5 text-[#31564a]">{message}</p>}
        </div>
      </div>
      <div className="border-t border-[#e5eee8] bg-[#f8fbf9] px-5 py-3 text-[11px] leading-5 text-[#678078] md:px-6"><AlertTriangle className="mr-1.5 inline size-3.5 align-text-bottom text-[#a56b16]" />AI extraction is a draft, not RRA verification or a tax determination. An authorized person must inspect the original before marking evidence reviewed.</div>
    </section>

    <section className="rounded-2xl border border-[#dce9e1] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5eee8] p-4 md:px-5">
        <div><h2 className="text-lg font-bold">Evidence inbox</h2><p className="mt-1 text-xs text-[#678078]">{pending.length} awaiting review · {invoices.length} total documents</p></div>
        <div className="flex gap-1 rounded-lg bg-[#f4f8f5] p-1" aria-label="Filter evidence">
          <button type="button" aria-pressed={filter === 'needs_review'} onClick={() => setFilter('needs_review')} className={`rounded-md px-3 py-2 text-xs font-bold ${filter === 'needs_review' ? 'bg-white text-[#0f5c49] shadow-sm' : 'text-[#678078]'}`}>Needs review</button>
          <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')} className={`rounded-md px-3 py-2 text-xs font-bold ${filter === 'all' ? 'bg-white text-[#0f5c49] shadow-sm' : 'text-[#678078]'}`}>All</button>
        </div>
      </div>
      {error ? <p role="alert" className="p-5 text-sm text-[#923f34]">Could not load the invoice inbox. Refresh and try again.</p> : !data ? <p className="p-5 text-sm text-[#678078]">Loading client documents…</p> : visibleInvoices.length === 0 ? <div className="p-8 text-center"><span className="mx-auto flex size-11 items-center justify-center rounded-full bg-[#e4f5ec] text-[#0f8062]"><Check className="size-5" /></span><h3 className="mt-3 text-sm font-bold">{filter === 'needs_review' ? 'You’re all caught up' : 'No documents yet'}</h3><p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-[#678078]">{filter === 'needs_review' ? 'Reviewed documents appear in All. Upload an invoice or receipt to start the next review.' : 'Upload a purchase invoice or expense receipt to build this client’s evidence trail.'}</p></div> : <div className="divide-y divide-[#edf3ee]">{visibleInvoices.map(invoice => {
        let extractionNotes: string[] = []
        try { const parsed: unknown = JSON.parse(invoice.extractionNotes || '[]'); if (Array.isArray(parsed)) extractionNotes = parsed.filter((note): note is string => typeof note === 'string') } catch { extractionNotes = [] }
        const confidence = invoice.extractionConfidence === null ? null : Number(invoice.extractionConfidence)
        const kindLabel = invoice.documentKind === 'expense_receipt' ? 'Expense receipt' : 'Purchase invoice'
        return <article key={invoice.id} className="py-1">
          <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between md:px-5">
            <div className="flex min-w-0 items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#f4f8f5] text-[#0f8062]"><FileText className="size-4" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-bold">{invoice.supplier || invoice.originalFilename || 'New document'}</h3><span className="rounded-full bg-[#eef5f0] px-2 py-1 text-[10px] font-bold text-[#31564a]">{kindLabel}</span><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${invoice.status === 'pending' ? 'bg-[#fff5dc] text-[#765821]' : invoice.status === 'supported' ? 'bg-[#e4f5ec] text-[#0f8062]' : 'bg-[#fcebe7] text-[#923f34]'}`}>{invoice.status === 'pending' ? 'Needs review' : invoice.status === 'supported' ? 'Included in workpapers' : 'Excluded from workpapers'}</span></div><p className="mt-1 truncate text-xs text-[#678078]">{invoice.originalFilename || invoice.id} · {invoice.invoiceDate === 'UNKNOWN' ? 'Date not read' : invoice.invoiceDate} · {invoice.amount > 0 ? money(invoice.amount) : 'Amount not read'}</p><p className="mt-1 text-[10px] text-[#789087]">{invoice.extractionStatus === 'extracted' ? `AI draft · ${confidence === null || !Number.isFinite(confidence) ? 'confidence unavailable' : `${Math.round(confidence * 100)}% confidence`}` : invoice.extractionStatus === 'processing' ? 'Scan in progress' : 'Manual review needed'}</p></div></div>
            <button type="button" aria-expanded={expandedId === invoice.id} onClick={() => setExpandedId(current => current === invoice.id ? null : invoice.id)} className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#c8ddd2] px-3 text-xs font-bold text-[#0f5c49]">{expandedId === invoice.id ? 'Close review' : 'Open review'}</button>
          </div>
          {expandedId === invoice.id && <InvoiceReviewActions clientId={clientId} invoiceId={invoice.id} status={invoice.status} supplier={invoice.supplier} tin={invoice.tin} invoiceNumber={invoice.invoiceNumber} invoiceDate={invoice.invoiceDate} amount={invoice.amount} vat={invoice.vat} currency={invoice.currency} extractionStatus={invoice.extractionStatus} extractionConfidence={confidence !== null && Number.isFinite(confidence) ? confidence : null} ebmEvidence={invoice.ebmEvidence} extractionNotes={extractionNotes} documentPathname={invoice.blobPathname} originalFilename={invoice.originalFilename} expanded onToggle={() => setExpandedId(null)} onUpdated={() => void mutate()} />}
        </article>
      })}</div>}
    </section>
  </div>
}
