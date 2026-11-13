'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { translate, type Language } from '@/lib/i18n'
import { FiscalizationWorkspace } from '@/components/fiscalization-workspace'
import { InvoiceReviewActions } from '@/components/invoice-review-actions'
import { AlertTriangle, ArrowDownToLine, ArrowLeftRight, ArrowUpRight, Bell, CalendarClock, ChartNoAxesCombined, Check, CheckCircle2, ChevronRight, ExternalLink, FileCheck2, FileText, LayoutDashboard, Menu, Plus, ReceiptText, Search, Settings2, ShieldCheck, Upload, UserRound, WalletCards, X, XCircle } from 'lucide-react'
import { signOut } from '@/lib/auth-client'
import { formatRwf, formatRwandaDate, kigaliPeriod, kigaliToday } from '@/lib/rwanda-locale'
import { AIChatbot } from '@/components/ai-chatbot'

type View = 'Overview' | 'Filing preparation' | 'Fiscalization' | 'Invoices' | 'Sales' | 'Reconciliation' | 'Reports' | 'VAT summary' | 'Exports' | 'Deadlines' | 'Profile'
type Invoice = { id: string; supplier: string; tin: string; date: string; amount: number; vat: number; status: 'pending' | 'supported' | 'unsupported'; type: 'purchase' | 'sale'; initials: string; reason?: string; documentPathname?: string | null; originalFilename?: string | null; invoiceNumber: string; currency: string; extractionStatus: string; extractionConfidence: number | null; ebmEvidence: 'ebm_present' | 'ebm_missing' | 'unclear'; extractionNotes: string[] }
type Task = { id: string; title: string; description: string; dueDate: string; status: string }
type Props = { initialView: View; initialSession?: { user: { name?: string | null; email?: string | null } }; initialInvoices?: Invoice[]; initialLanguage?: Language }
const tr = (language: Language, text: string) => translate(language, text)
const fetchJson = async (url: string) => { const response = await fetch(url); if (!response.ok) throw new Error('Request failed.'); return response.json() }

const nav: { label: View; icon: typeof LayoutDashboard }[] = [{ label: 'Overview', icon: LayoutDashboard }, { label: 'Filing preparation', icon: FileCheck2 }, { label: 'Fiscalization', icon: ReceiptText }, { label: 'Invoices', icon: FileText }, { label: 'Sales', icon: ReceiptText }, { label: 'Reconciliation', icon: ArrowLeftRight }, { label: 'Reports', icon: ChartNoAxesCombined }, { label: 'VAT summary', icon: WalletCards }, { label: 'Exports', icon: ArrowDownToLine }, { label: 'Deadlines', icon: CalendarClock }, { label: 'Profile', icon: UserRound }]
const money = (value: number) => formatRwf(value)
const formatDate = (value: string) => formatRwandaDate(value)

export default function ImisoroApp({ initialView, initialSession, initialInvoices = [], initialLanguage = 'en' }: Props) {
  const [language, setLanguage] = useState<Language>(initialLanguage)
  const [active, setActive] = useState<View>(initialView); const [invoices, setInvoices] = useState(initialInvoices); const [tasks, setTasks] = useState<Task[]>([]); const [mobileOpen, setMobileOpen] = useState(false); const [uploadOpen, setUploadOpen] = useState(false); const [isUploading, setIsUploading] = useState(false); const [focusedInvoiceId, setFocusedInvoiceId] = useState<string | null>(null); const [query, setQuery] = useState(''); const [notice, setNotice] = useState('')
  const { data: adminAccess } = useSWR<{ superadmin: boolean }>('/api/admin/access', fetchJson)
  const userName = initialSession?.user.name || initialSession?.user.email?.split('@')[0] || 'there'
  // The overview reflects everything in the workspace so a new upload or a
  // manual correction is always visible. Month scoping lives in VAT summary,
  // exports, and reports, where the period is explicit.
  const pending = invoices.filter(invoice => invoice.status === 'pending'); const supported = invoices.filter(invoice => invoice.status === 'supported'); const inputVat = supported.reduce((sum, invoice) => sum + invoice.vat, 0)
  const filtered = useMemo(() => invoices.filter(invoice => `${invoice.supplier} ${invoice.id} ${invoice.tin} ${invoice.invoiceNumber}`.toLowerCase().includes(query.toLowerCase())), [invoices, query])
  const notify = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 3500) }
  const selectView = (view: View) => { setActive(view); setMobileOpen(false); if (view === 'Deadlines' && tasks.length === 0) fetch('/api/compliance').then(response => response.ok ? response.json() : null).then(data => setTasks(data?.tasks || [])) }
  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      notify(tr(language, 'Choose a document under 10 MB.'))
      event.target.value = ''
      return
    }

    const body = new FormData()
    body.append('file', file)
    setIsUploading(true)
    notify(tr(language, 'Uploading and reading your invoice…'))
    try {
      const response = await fetch('/api/ocr', { method: 'POST', body })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (data.saved && data.invoiceId) {
          const listResponse = await fetch('/api/invoices')
          const listData = await listResponse.json().catch(() => ({}))
          const savedInvoice = listData.invoices?.find((invoice: { id: string }) => invoice.id === data.invoiceId)
          if (savedInvoice) {
            const persisted: Invoice = {
              id: savedInvoice.id,
              supplier: savedInvoice.supplier,
              tin: savedInvoice.tin,
              date: savedInvoice.invoiceDate,
              amount: savedInvoice.amount,
              vat: savedInvoice.vat,
              status: savedInvoice.status,
              type: 'purchase',
              initials: savedInvoice.supplier.slice(0, 2).toUpperCase(),
              documentPathname: savedInvoice.blobPathname,
              originalFilename: savedInvoice.originalFilename,
              invoiceNumber: savedInvoice.invoiceNumber,
              currency: savedInvoice.currency,
              extractionStatus: savedInvoice.extractionStatus,
              extractionConfidence: savedInvoice.extractionConfidence === null ? null : Number(savedInvoice.extractionConfidence),
              ebmEvidence: savedInvoice.ebmEvidence,
              extractionNotes: (() => { try { const value: unknown = JSON.parse(savedInvoice.extractionNotes || '[]'); return Array.isArray(value) ? value.filter((note): note is string => typeof note === 'string') : [] } catch { return [] } })(),
            }
            setInvoices(current => current.some(invoice => invoice.id === persisted.id) ? current : [persisted, ...current])
            setActive('Invoices')
            setFocusedInvoiceId(persisted.id)
          }
          setUploadOpen(false)
        }
        notify(tr(language, data.error || 'We could not process that document.'))
        return
      }
      if (!data.invoice) return

      let extractionNotes: string[] = []
      try { const parsed: unknown = JSON.parse(data.invoice.extractionNotes || '[]'); if (Array.isArray(parsed)) extractionNotes = parsed.filter((note): note is string => typeof note === 'string') } catch { extractionNotes = [] }
      const uploaded: Invoice = {
        id: data.invoice.id,
        supplier: data.invoice.supplier,
        tin: data.invoice.tin,
        date: data.invoice.invoiceDate,
        amount: data.invoice.amount,
        vat: data.invoice.vat,
        status: data.invoice.status,
        type: 'purchase',
        initials: data.invoice.supplier.slice(0, 2).toUpperCase(),
        documentPathname: data.invoice.blobPathname,
        originalFilename: data.invoice.originalFilename,
        invoiceNumber: data.invoice.invoiceNumber,
        currency: data.invoice.currency,
        extractionStatus: data.invoice.extractionStatus,
        extractionConfidence: data.invoice.extractionConfidence === null ? null : Number(data.invoice.extractionConfidence),
        ebmEvidence: data.invoice.ebmEvidence,
        extractionNotes,
      }
      setInvoices(current => [uploaded, ...current])
      setActive('Invoices')
      setFocusedInvoiceId(uploaded.id)
      setUploadOpen(false)
      if (data.extractionFailed && data.ocrIssue === 'credits_required') {
        notify(tr(language, 'Invoice saved. AI Gateway paid credits are required to scan it; you can retry without uploading again.'))
      } else if (data.extractionFailed) {
        notify(tr(language, 'Invoice saved. Extraction needs attention; correct the fields below or retry the scan.'))
      } else {
        notify(tr(language, 'Invoice read. Check the extracted details against the original before including it in workpapers.'))
      }
    } catch {
      notify(tr(language, 'We could not process that document. Check your connection and try again.'))
    } finally {
      event.target.value = ''
      setIsUploading(false)
    }
  }
  const download = (kind: 'csv' | 'summary', period: string) => {
    const periodInvoices = invoices.filter(invoice => invoice.date.startsWith(period))
    const periodVat = periodInvoices.filter(invoice => invoice.status === 'supported').reduce((sum, invoice) => sum + invoice.vat, 0)
    const periodPending = periodInvoices.filter(invoice => invoice.status === 'pending').length
    const rows = [['Date', 'Supplier', 'Supplier TIN', 'Invoice / EBM number', 'Currency', 'Amount RWF', 'VAT RWF', 'EBM evidence', 'Extraction status', 'Confidence', 'Workpaper review'], ...periodInvoices.map(invoice => [invoice.date, invoice.supplier, invoice.tin, invoice.invoiceNumber, invoice.currency, invoice.amount, invoice.vat, invoice.ebmEvidence, invoice.extractionStatus, invoice.extractionConfidence ?? '', invoice.status])]
    const content = kind === 'csv' ? rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n') : [`Internal evidence summary — ${period}`, `Invoice records,${periodInvoices.length}`, `Reviewed purchase VAT RWF (internal),${periodVat}`, `Needs human review,${periodPending}`, 'Output VAT,Not calculated', 'eTax submission,Not performed'].join('\n')
    const link = document.createElement('a')
    const objectUrl = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
    link.href = objectUrl
    link.download = `imisoro-${kind}-${period}.csv`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    notify(tr(language, 'Export downloaded.'))
  }
  const onInvoiceReviewed = (updated: { id: string; status: 'pending' | 'supported' | 'unsupported'; supplier: string; tin: string; invoiceNumber: string; invoiceDate: string; amount: number; vat: number; currency: string; extractionStatus: string; extractionConfidence: string | number | null; ebmEvidence: Invoice['ebmEvidence']; extractionNotes: string }) => {
    let extractionNotes: string[] = []
    try { const parsed: unknown = JSON.parse(updated.extractionNotes); if (Array.isArray(parsed)) extractionNotes = parsed.filter((note): note is string => typeof note === 'string') } catch { extractionNotes = [] }
    setInvoices(current => current.map(invoice => invoice.id === updated.id ? { ...invoice, status: updated.status, supplier: updated.supplier, tin: updated.tin, invoiceNumber: updated.invoiceNumber, date: updated.invoiceDate, amount: updated.amount, vat: updated.vat, currency: updated.currency, extractionStatus: updated.extractionStatus, extractionConfidence: updated.extractionConfidence === null ? null : Number(updated.extractionConfidence), ebmEvidence: updated.ebmEvidence, extractionNotes } : invoice))
    if (updated.status !== 'pending') notify('Review decision and corrected evidence saved. This remains a preparation record, not an RRA approval.')
  }
  const changeLanguage = async (next: Language) => { const previous = language; setLanguage(next); try { const response = await fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ language: next }) }); if (!response.ok) throw new Error('Language preference could not be saved.'); } catch { setLanguage(previous); notify('Could not save profile. Check your connection and try again.') } }
  return <div className="min-h-screen bg-[#f4f7f3] text-[#10251f]" lang={language}>
    {mobileOpen && <button type="button" aria-label={tr(language, 'Close navigation')} onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-[#10251f]/35 lg:hidden" />}
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[278px] flex-col border-r border-[#dce9e1] bg-[#f9fcfa] px-5 py-6 shadow-[10px_0_40px_-35px_rgba(15,92,73,0.4)] ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform lg:translate-x-0`}><div className="flex items-center justify-between"><a href="/" className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-[14px] bg-[#0f5c49] text-white"><ShieldCheck className="size-5" /></span><span><strong className="block text-sm tracking-tight">Imisoro <span className="text-[#0f8062]">AI</span></strong><small className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#789087]">{tr(language, 'Tax operations')}</small></span></a><button className="rounded-lg p-2 text-[#789087] lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X className="size-4" /></button></div><div className="mt-10 rounded-2xl border border-[#dce9e1] bg-white p-3"><p className="px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#789087]">{tr(language, 'Workspace')}</p><div className="mt-3 flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-xl bg-[#dff3e9] text-xs font-bold text-[#0f8062]">{userName.slice(0, 2).toUpperCase()}</span><div className="min-w-0"><p className="truncate text-xs font-bold">{userName}</p><p className="truncate text-[10px] text-[#789087]">{tr(language, 'Business workspace')}</p></div></div></div><nav className="mt-8 space-y-1">{nav.map(({ label, icon: Icon }) => <button key={label} onClick={() => selectView(label)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition ${active === label ? 'bg-[#dff3e9] text-[#0f8062]' : 'text-[#678078] hover:bg-white hover:text-[#10251f]'}`}><Icon className="size-[18px]" />{tr(language, label)}{active === label && <ChevronRight className="ml-auto size-4" />}</button>)}{adminAccess?.superadmin && <a href="/admin" className="mt-2 flex w-full items-center gap-3 rounded-xl border border-[#c8ddd2] bg-white px-3 py-3 text-left text-sm font-semibold text-[#0f5c49] transition hover:bg-[#f2f8f4]"><ShieldCheck className="size-[18px]" />{tr(language, 'Superadmin console')}<ChevronRight className="ml-auto size-4" /></a>}</nav>
  <button key="chat" onClick={() => setMobileOpen(!mobileOpen)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition hover:bg-white hover:text-[#10251f]" aria-label="Open AI chat"><Search className="size-[18px]" /> AI Chat</button>
<div className="mt-auto rounded-2xl bg-[#10251f] p-4 text-white"><p className="text-xs font-bold">Monthly close</p><p className="mt-1 text-[11px] leading-5 text-white/60">Review your captured invoices before handing them to your accountant.</p><button onClick={() => setUploadOpen(true)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[#9ee5c7] px-3 py-2 text-xs font-bold text-[#10251f]"><Plus className="size-3.5" /> Add evidence</button>
  <div className="mt-4 rounded-2xl bg-[#10251f] p-4 text-white"><button onClick={() => signOut()} className="w-full rounded-lg bg-[#b83b43] px-4 py-2 text-xs font-bold text-white hover:bg-[#9a2c35] transition" aria-label="Sign out"><XCircle className="size-4" /> Logout</button></div></div></aside>
    <div className="lg:pl-[278px]"><header className="sticky top-0 z-30 flex h-[76px] items-center gap-4 border-b border-[#dce9e1] bg-[#f4f7f3]/90 px-5 backdrop-blur md:px-8"><button onClick={() => setMobileOpen(true)} className="rounded-xl border border-[#c8ddd2] bg-white p-2.5 lg:hidden" aria-label="Open navigation"><Menu className="size-4" /></button><div className="relative hidden max-w-sm flex-1 md:block"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#91a69d]" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={tr(language, 'Search invoices, suppliers, TINs')} className="h-10 w-full rounded-xl border border-[#dce9e1] bg-white pl-10 pr-4 text-xs outline-none transition placeholder:text-[#a0b3aa] focus:border-[#0f8062] focus:ring-4 focus:ring-[#0f8062]/10" /></div><div className="ml-auto flex items-center gap-2"><label className="sr-only" htmlFor="language-select">{tr(language, 'Choose language')}</label><select id="language-select" aria-label={tr(language, 'Language')} value={language} onChange={event => changeLanguage(event.target.value as Language)} className="h-10 rounded-xl border border-[#dce9e1] bg-white px-2 text-xs font-semibold text-[#31564a] outline-none focus:border-[#0f8062]"><option value="en">English</option><option value="rw">Kinyarwanda</option><option value="fr">Français</option></select><button onClick={() => selectView('Deadlines')} className="relative rounded-xl border border-[#dce9e1] bg-white p-2.5 text-[#678078]" aria-label="Open deadlines"><Bell className="size-4" />{tasks.some(task => task.status !== 'completed') && <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-[#d89b32]" />}</button><button onClick={() => selectView('Profile')} className="flex items-center gap-2 rounded-xl border border-[#dce9e1] bg-white px-2.5 py-2 text-xs font-bold"><span className="flex size-6 items-center justify-center rounded-lg bg-[#dff3e9] text-[10px] text-[#0f8062]">{userName.slice(0, 1).toUpperCase()}</span><span className="hidden sm:block">{userName}</span></button></div></header><main className="mx-auto max-w-[1380px] p-5 md:p-8 lg:p-10"><div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end"><div><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#0f8062]">{new Intl.DateTimeFormat('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}</p><h1 className="text-3xl font-bold tracking-[-0.05em] md:text-4xl">{active === 'Overview' ? `${tr(language, 'Good morning,')} ${userName.split(' ')[0]}.` : tr(language, active)}</h1><p className="mt-2 text-sm text-[#678078]">{tr(language, 'A clear view of your Rwanda tax evidence and monthly close.')}</p></div><button onClick={() => setUploadOpen(true)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0f5c49] px-4 text-sm font-bold text-white shadow-lg shadow-[#0f5c49]/15 transition hover:-translate-y-0.5 hover:bg-[#0a493a]"><Plus className="size-4" /> {tr(language, 'Upload invoice')}</button></div>{active === 'Overview' && <Overview language={language} invoices={invoices} pending={pending} supported={supported} inputVat={inputVat} onUpload={() => setUploadOpen(true)} onInvoices={() => selectView('Invoices')} />} {active === 'Filing preparation' && <FilingPreparation language={language} />} {active === 'Fiscalization' && <FiscalizationWorkspace language={language} />} {active === 'Invoices' && <Invoices invoices={filtered} query={query} onQuery={setQuery} onUpload={() => setUploadOpen(true)} onReviewed={onInvoiceReviewed} focusedInvoiceId={focusedInvoiceId} onFocusInvoice={setFocusedInvoiceId} />} {active === 'Sales' && <Sales />} {active === 'Reconciliation' && <Reconciliation notify={notify} />} {active === 'Reports' && <Reports />} {active === 'VAT summary' && <VatSummary invoices={invoices} />} {active === 'Exports' && <Exports onDownload={download} invoices={invoices} />} {active === 'Deadlines' && <Deadlines tasks={tasks} onTasks={setTasks} notify={notify} />} {active === 'Profile' && <Profile notify={notify} language={language} />}
{active === 'AI Chatbot' && <AIChatbot />}  </main></div>{notice && <div role="status" className="fixed bottom-5 right-5 z-50 flex max-w-sm items-center gap-3 rounded-2xl border border-[#bfe0cf] bg-[#10251f] px-4 py-3 text-sm font-semibold text-white shadow-2xl"><CheckCircle2 className="size-4 text-[#9ee5c7]" />{notice}</div>}{uploadOpen && <UploadDialog onClose={() => setUploadOpen(false)} onUpload={upload} uploading={isUploading} />}</div>
}

function Overview({ language, invoices, pending, supported, inputVat, onUpload, onInvoices }: { language: Language; invoices: Invoice[]; pending: Invoice[]; supported: Invoice[]; inputVat: number; onUpload: () => void; onInvoices: () => void }) { return <section className="mt-10 space-y-6"><div className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]"><div className="rounded-[24px] bg-[#10251f] p-6 text-white shadow-xl shadow-[#10251f]/10 md:p-8"><div className="flex items-start justify-between gap-6"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9ee5c7]">{tr(language, 'Workspace overview')}</p><h2 className="mt-3 max-w-xl text-2xl font-bold tracking-[-0.04em] md:text-3xl">{pending.length ? `${pending.length} ${tr(language, pending.length === 1 ? 'invoice need your review.' : 'invoices need your review.')}` : tr(language, 'Your evidence inbox is clear.')}</h2><p className="mt-3 max-w-lg text-sm leading-6 text-white/60">{tr(language, 'Review purchase invoices, resolve exceptions, and keep the original evidence attached to every decision.')}</p></div><span className="hidden size-12 items-center justify-center rounded-2xl bg-white/10 text-[#9ee5c7] sm:flex"><FileCheck2 className="size-6" /></span></div><div className="mt-8 flex flex-wrap gap-3"><button onClick={pending.length ? onInvoices : onUpload} className="rounded-xl bg-[#9ee5c7] px-4 py-3 text-sm font-bold text-[#10251f]">{tr(language, pending.length ? 'Review invoices' : 'Upload first invoice')}</button><span className="flex items-center gap-2 px-1 text-xs text-white/50"><ShieldCheck className="size-4 text-[#9ee5c7]" /> {tr(language, 'Human approval stays in control')}</span></div></div><div className="rounded-[24px] border border-[#dce9e1] bg-white p-6"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#789087]">{tr(language, 'Reviewed purchase VAT')}</p><p className="mt-5 text-3xl font-bold tracking-[-0.05em]">{money(inputVat)}</p><p className="mt-2 text-xs text-[#789087]">From {supported.length} supported purchase invoice{supported.length === 1 ? '' : 's'}</p><div className="mt-7 h-2 overflow-hidden rounded-full bg-[#e8f1eb]"><div className="h-full rounded-full bg-[#0f8062]" style={{ width: `${invoices.length ? Math.min(100, (supported.length / invoices.length) * 100) : 0}%` }} /></div><p className="mt-2 text-[11px] font-semibold text-[#0f8062]">{invoices.length ? Math.round((supported.length / invoices.length) * 100) : 0}% supported</p></div></div><div className="grid gap-4 sm:grid-cols-3"><Metric label={tr(language, 'Captured')} value={invoices.length} note={tr(language, 'in your workspace')} icon={FileText} /><Metric label={tr(language, 'Supported')} value={supported.length} note={tr(language, 'ready for close')} icon={ShieldCheck} good /><Metric label={tr(language, 'Needs review')} value={pending.length} note={tr(language, 'requires attention')} icon={AlertTriangle} warning /></div><div className="rounded-[24px] border border-[#dce9e1] bg-white"><div className="flex items-center justify-between border-b border-[#e7f0ea] px-5 py-4 md:px-6"><div><h3 className="text-sm font-bold">{tr(language, 'Recent evidence')}</h3><p className="mt-1 text-xs text-[#789087]">{tr(language, 'The latest records in your workspace.')}</p></div><button onClick={onInvoices} className="flex items-center gap-1 text-xs font-bold text-[#0f8062]">View all <ArrowUpRight className="size-3.5" /></button></div>{invoices.length ? <div className="divide-y divide-[#edf3ee]">{invoices.slice(0, 5).map(invoice => <InvoiceRow key={invoice.id} invoice={invoice} />)}</div> : <EmptyState onUpload={onUpload} />}</div></section> }

function Metric({ label, value, note, icon: Icon, good, warning }: { label: string; value: number; note: string; icon: typeof FileText; good?: boolean; warning?: boolean }) { return <div className="rounded-2xl border border-[#dce9e1] bg-white p-5"><div className="flex items-center justify-between"><span className="text-xs font-bold text-[#789087]">{label}</span><span className={`flex size-9 items-center justify-center rounded-xl ${warning ? 'bg-[#fff3dc] text-[#b97818]' : good ? 'bg-[#dff3e9] text-[#0f8062]' : 'bg-[#eef5f0] text-[#678078]'}`}><Icon className="size-4" /></span></div><p className="mt-5 text-2xl font-bold tracking-tight">{value}</p><p className="mt-1 text-[11px] text-[#789087]">{note}</p></div> }
function InvoiceRow({ invoice }: { invoice: Invoice }) {
  const statusStyle = invoice.status === 'supported' ? 'bg-[#dff3e9] text-[#0f8062]' : invoice.status === 'unsupported' ? 'bg-[#fee8e5] text-[#b54739]' : 'bg-[#fff3dc] text-[#a56b16]'
  const statusLabel = invoice.status === 'supported' ? 'Reviewed for workpapers' : invoice.status === 'unsupported' ? 'Excluded' : 'Needs review'
  const scanLabel = invoice.extractionStatus === 'extracted' ? 'Read — verify values' : invoice.extractionStatus === 'reviewed_manual' ? 'Manual review complete' : invoice.extractionStatus === 'credits_required' ? 'AI credits needed' : invoice.extractionStatus === 'processing' ? 'Scanning' : 'Manual entry needed'
  const supplierLabel = invoice.supplier === 'Unknown supplier' ? 'Supplier not read' : invoice.supplier
  return <div className="flex items-center gap-3 px-5 py-4 md:px-6">
    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#eef5f0] text-xs font-bold text-[#0f8062]">{invoice.initials}</span>
    <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{supplierLabel}</p><p className="mt-1 text-[11px] text-[#789087]">{invoice.invoiceNumber && invoice.invoiceNumber !== 'UNKNOWN' ? `${invoice.invoiceNumber} · ` : ''}{invoice.date === 'UNKNOWN' ? 'Date not read' : formatDate(invoice.date)}</p></div>
    <span className="hidden text-xs font-semibold text-[#678078] md:block">{invoice.amount > 0 ? money(invoice.amount) : '—'}</span>
    <div className="flex flex-col items-end gap-1"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${statusStyle}`}>{statusLabel}</span><span className="text-[10px] font-medium text-[#789087]">{scanLabel}</span></div>
    <ChevronRight className="size-4 shrink-0 text-[#b2c2ba]" />
  </div>
}
function EmptyState({ onUpload }: { onUpload: () => void }) { return <div className="flex flex-col items-center justify-center px-6 py-14 text-center"><span className="flex size-14 items-center justify-center rounded-2xl bg-[#dff3e9] text-[#0f8062]"><Upload className="size-6" /></span><h3 className="mt-5 text-base font-bold">Start your evidence trail</h3><p className="mt-2 max-w-sm text-sm leading-6 text-[#789087]">Upload your first EBM invoice or receipt. We will extract the details and keep the original attached for review.</p><button onClick={onUpload} className="mt-5 rounded-xl bg-[#0f5c49] px-4 py-2.5 text-xs font-bold text-white">Upload invoice</button></div> }

function Invoices({ invoices, query, onQuery, onUpload, onReviewed, focusedInvoiceId, onFocusInvoice }: { invoices: Invoice[]; query: string; onQuery: (value: string) => void; onUpload: () => void; onReviewed: (invoice: { id: string; status: 'pending' | 'supported' | 'unsupported'; supplier: string; tin: string; invoiceNumber: string; invoiceDate: string; amount: number; vat: number; currency: string; extractionStatus: string; extractionConfidence: string | number | null; ebmEvidence: Invoice['ebmEvidence']; extractionNotes: string }) => void; focusedInvoiceId: string | null; onFocusInvoice: (id: string | null) => void }) {
  const needsReview = invoices.filter(invoice => invoice.status === 'pending').length
  return <section className="mt-10 space-y-4">
    <div className="rounded-[24px] border border-[#dce9e1] bg-white p-5 md:p-6"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-center"><div><h2 className="text-base font-bold">Invoice inbox</h2><p className="mt-1 text-xs leading-5 text-[#789087]">One path: scan the source, verify the draft, then include or exclude it from your internal filing workpapers.</p></div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#fff3dc] px-3 py-1.5 text-[11px] font-bold text-[#a56b16]">{needsReview} need review</span><button onClick={onUpload} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0f5c49] px-3 text-xs font-bold text-white"><Plus className="size-3.5" /> Add invoice</button></div></div><div className="relative mt-4 max-w-sm"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#91a69d]" /><input value={query} onChange={event => onQuery(event.target.value)} placeholder="Find by supplier, invoice, or TIN" className="h-10 w-full rounded-xl border border-[#dce9e1] pl-9 pr-3 text-xs outline-none focus:border-[#0f8062]" /></div></div>
    {invoices.length ? <div className="divide-y divide-[#edf3ee] rounded-[24px] border border-[#dce9e1] bg-white">{invoices.map(invoice => <div key={invoice.id} className="py-2"><InvoiceRow invoice={invoice} /><InvoiceReviewActions invoiceId={invoice.id} status={invoice.status} supplier={invoice.supplier} tin={invoice.tin} invoiceNumber={invoice.invoiceNumber} invoiceDate={invoice.date} amount={invoice.amount} vat={invoice.vat} currency={invoice.currency} extractionStatus={invoice.extractionStatus} extractionConfidence={invoice.extractionConfidence} ebmEvidence={invoice.ebmEvidence} extractionNotes={invoice.extractionNotes} documentPathname={invoice.documentPathname} originalFilename={invoice.originalFilename} expanded={focusedInvoiceId === invoice.id} onToggle={() => onFocusInvoice(focusedInvoiceId === invoice.id ? null : invoice.id)} onUpdated={onReviewed} /></div>)}</div> : <div className="rounded-[24px] border border-[#dce9e1] bg-white"><EmptyState onUpload={onUpload} /></div>}
  </section>
}
function VatSummary({ invoices }: { invoices: Invoice[] }) {
  const [period, setPeriod] = useState(kigaliPeriod())
  const periodInvoices = invoices.filter(invoice => invoice.date.startsWith(period))
  const total = periodInvoices.reduce((sum, invoice) => sum + invoice.amount, 0)
  const inputVat = periodInvoices.filter(invoice => invoice.status === 'supported').reduce((sum, invoice) => sum + invoice.vat, 0)
  return <section className="mt-10 space-y-5"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0f8062]">VAT evidence summary</p><h2 className="mt-2 text-2xl font-bold">Human-reviewed records for the selected month.</h2></div><label className="grid gap-1.5 text-xs font-bold">Evidence period<input type="month" value={period} onChange={event => setPeriod(event.target.value)} className="h-10 rounded-xl border border-[#c8ddd2] bg-white px-3 text-sm outline-none focus:border-[#0f8062]" /></label></div><div className="grid gap-5 md:grid-cols-3"><div className="rounded-[24px] bg-[#10251f] p-6 text-white md:col-span-2"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9ee5c7]">{period}</p><div className="mt-8 grid gap-3 sm:grid-cols-3"><Summary label="Invoice value" value={money(total)} /><Summary label="Reviewed purchase VAT (internal)" value={money(inputVat)} /><Summary label="Records" value={String(periodInvoices.length)} /></div></div><div className="rounded-[24px] border border-[#ead9b8] bg-[#fff9ec] p-6"><p className="text-sm font-bold">Evidence only</p><p className="mt-3 text-sm leading-6 text-[#735725]">This is not a VAT return. Output VAT, statutory adjustments, and filing eligibility are not calculated here.</p><div className="mt-6 flex items-center gap-2 text-xs font-bold text-[#735725]"><ShieldCheck className="size-4" /> Verify in RRA eTax</div></div></div></section>
}
function Summary({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl bg-white/10 p-4"><p className="text-[11px] text-white/60">{label}</p><p className="mt-3 text-lg font-bold">{value}</p></div> }
function Exports({ onDownload, invoices }: { onDownload: (kind: 'csv' | 'summary', period: string) => void; invoices: Invoice[] }) {
  const [period, setPeriod] = useState(kigaliPeriod())
  const periodCount = invoices.filter(invoice => invoice.date.startsWith(period)).length
  return <section className="mt-10 space-y-5"><div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-xl font-bold">Period exports</h2><p className="mt-1 text-sm text-[#789087]">Exports include only invoice records dated in the selected period.</p></div><label className="grid gap-1.5 text-xs font-bold">Export period<input type="month" value={period} onChange={event => setPeriod(event.target.value)} className="h-10 rounded-xl border border-[#c8ddd2] bg-white px-3 text-sm outline-none focus:border-[#0f8062]" /></label></div><div className="grid gap-5 md:grid-cols-2"><ExportCard icon={FileText} title="Invoice evidence CSV" text={`${periodCount} invoice records for ${period}; includes review status and source fields.`} onClick={() => onDownload('csv', period)} /><ExportCard icon={WalletCards} title="Evidence summary CSV" text="A period-scoped internal summary for your accountant. Not an RRA return." onClick={() => onDownload('summary', period)} /></div></section>
}
function ExportCard({ icon: Icon, title, text, onClick }: { icon: typeof FileText; title: string; text: string; onClick: () => void }) { return <div className="rounded-[24px] border border-[#dce9e1] bg-white p-6"><span className="flex size-11 items-center justify-center rounded-xl bg-[#dff3e9] text-[#0f8062]"><Icon className="size-5" /></span><h2 className="mt-6 text-base font-bold">{title}</h2><p className="mt-2 text-sm leading-6 text-[#789087]">{text}</p><button onClick={onClick} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#0f5c49] px-4 py-3 text-xs font-bold text-white"><ArrowDownToLine className="size-4" /> Download</button></div> }
type RwandaTaxDate = { title: string; schedule: string; nextDue: string; note: string }

function nextMonthlyDueDate(day: number) {
  const [year, month, currentDay] = kigaliToday().split('-').map(Number)
  const today = Date.UTC(year, month - 1, currentDay)
  const thisMonth = Date.UTC(year, month - 1, day)
  return new Date(thisMonth >= today ? thisMonth : Date.UTC(year, month, day)).toISOString().slice(0, 10)
}

function nextScheduledDate(schedule: { month: number; day: number }[]) {
  const [year, month, currentDay] = kigaliToday().split('-').map(Number)
  const today = Date.UTC(year, month - 1, currentDay)
  return schedule
    .flatMap(({ month: dueMonth, day }) => [year, year + 1].map(dueYear => new Date(Date.UTC(dueYear, dueMonth - 1, day)).toISOString().slice(0, 10)))
    .filter(date => Date.parse(`${date}T00:00:00Z`) >= today)
    .sort()[0] ?? ''
}

function deadlineStatus(date: string) {
  const today = Date.parse(`${kigaliToday()}T00:00:00Z`)
  const dueDate = Date.parse(`${date}T00:00:00Z`)
  const daysUntil = Math.round((dueDate - today) / 86_400_000)
  return daysUntil === 0 ? 'Due today' : daysUntil <= 14 ? 'Due soon' : 'Upcoming'
}

function getRwandaTaxDates(): RwandaTaxDate[] {
  return [
    { title: 'VAT return & payment · monthly', schedule: '15th of the month after the filing period', nextDue: nextMonthlyDueDate(15), note: 'Use this date only if your RRA account has a monthly filing cycle.' },
    { title: 'VAT return & payment · quarterly', schedule: '15th after each quarter ends', nextDue: nextScheduledDate([{ month: 1, day: 15 }, { month: 4, day: 15 }, { month: 7, day: 15 }, { month: 10, day: 15 }]), note: 'For taxpayers assigned quarterly VAT filing; confirm your period in eTax.' },
    { title: 'PAYE declaration & payment', schedule: '15th after the payroll tax period', nextDue: nextMonthlyDueDate(15), note: 'Check the period and filing frequency shown in your RRA account.' },
    { title: 'Annual income tax declaration', schedule: '31 March after the tax year', nextDue: nextScheduledDate([{ month: 3, day: 31 }]), note: 'For the previous tax year; taxpayer-specific rules may apply.' },
    { title: 'Quarterly income tax prepayments', schedule: '30 June, 30 September & 31 December', nextDue: nextScheduledDate([{ month: 6, day: 30 }, { month: 9, day: 30 }, { month: 12, day: 31 }]), note: 'Applies to taxpayers required to make quarterly advance payments.' },
    { title: 'Trading license tax', schedule: '31 January', nextDue: nextScheduledDate([{ month: 1, day: 31 }]), note: 'Confirm the applicable amount and any current local requirements.' },
  ]
}

function RwandaTaxCalendar() {
  const dates = getRwandaTaxDates()
  return <div className="space-y-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0f8062]">Rwanda tax calendar</p><h2 className="mt-2 text-xl font-bold">Upcoming filing dates</h2></div><span className="rounded-full bg-[#dff3e9] px-3 py-1.5 text-[10px] font-bold text-[#0f8062]">RRA reference dates</span></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{dates.map(item => <article key={item.title} className="rounded-[24px] border border-[#dce9e1] bg-white p-5"><div className="flex items-start justify-between gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#dff3e9] text-[#0f8062]"><CalendarClock className="size-5" /></span><span className="rounded-full bg-[#eef5f0] px-2.5 py-1 text-[10px] font-bold text-[#45665a]">{deadlineStatus(item.nextDue)}</span></div><h3 className="mt-5 text-sm font-bold leading-5">{item.title}</h3><p className="mt-1 text-xs text-[#789087]">{item.schedule}</p><p className="mt-4 text-[10px] font-bold uppercase tracking-[0.12em] text-[#789087]">Next date</p><p className="mt-1 text-lg font-bold text-[#10251f]">{formatDate(item.nextDue)}</p><p className="mt-2 text-xs leading-5 text-[#789087]">{item.note}</p></article>)}</div><div role="note" className="rounded-2xl border border-[#ead9b8] bg-[#fff9ec] p-4 text-xs leading-5 text-[#735725]">These are general reference dates, not a personalized tax notice. Filing frequency, tax type, and current RRA rules can change what applies to you. Confirm the exact due date and amount in <a className="font-bold underline" href="https://etax.rra.gov.rw/login" target="_blank" rel="noopener noreferrer">RRA eTax</a> or on the <a className="font-bold underline" href="https://www.rra.gov.rw/" target="_blank" rel="noopener noreferrer">RRA website</a>.</div></div>
}

function Deadlines({ tasks, onTasks, notify }: { tasks: Task[]; onTasks: (tasks: Task[]) => void; notify: (message: string) => void }) {
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const complete = async (taskId: string) => {
    const response = await fetch('/api/compliance', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId, status: 'completed' }) })
    if (response.ok) { onTasks(tasks.map(task => task.id === taskId ? { ...task, status: 'completed' } : task)); notify('Reminder marked complete.') }
  }
  const addTask = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    setSaving(true)
    setFormError('')
    try {
      const response = await fetch('/api/compliance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: values.get('title'), description: values.get('description'), dueDate: values.get('dueDate') }) })
      const result = await response.json()
      if (!response.ok) { setFormError(result.error || 'The reminder could not be saved.'); return }
      onTasks([...tasks, result.task])
      form.reset()
      setShowForm(false)
      notify('Your reminder was saved. The date is user-entered, not an official RRA deadline.')
    } catch { setFormError('The reminder could not be saved. Check your connection and try again.') }
    finally { setSaving(false) }
  }
  return <section className="mt-10 space-y-5"><RwandaTaxCalendar /><div className="flex justify-end"><button onClick={() => setShowForm(current => !current)} className="rounded-xl bg-[#0f5c49] px-4 py-3 text-xs font-bold text-white">{showForm ? 'Cancel' : 'Add your own reminder'}</button></div>{showForm && <form onSubmit={addTask} className="grid gap-4 rounded-[24px] border border-[#dce9e1] bg-white p-5 md:grid-cols-3"><label className="grid gap-1.5 text-xs font-semibold">Reminder title<input name="title" required minLength={2} maxLength={120} className="h-10 rounded-lg border border-[#c8ddd2] px-3 text-sm font-normal outline-none focus:border-[#0f8062]" /></label><label className="grid gap-1.5 text-xs font-semibold">Your reminder date<input name="dueDate" required type="date" className="h-10 rounded-lg border border-[#c8ddd2] px-3 text-sm font-normal outline-none focus:border-[#0f8062]" /></label><label className="grid gap-1.5 text-xs font-semibold md:col-span-3">Notes<textarea name="description" required minLength={4} maxLength={500} rows={2} className="rounded-lg border border-[#c8ddd2] px-3 py-2 text-sm font-normal outline-none focus:border-[#0f8062]" /></label>{formError && <p role="alert" className="text-xs text-[#b54739] md:col-span-3">{formError}</p>}<button disabled={saving} className="rounded-xl bg-[#0f5c49] px-4 py-3 text-xs font-bold text-white disabled:opacity-60 md:col-span-3">{saving ? 'Saving…' : 'Save reminder'}</button></form>}<div className="grid gap-4 md:grid-cols-2">{tasks.length ? tasks.map(task => <div key={task.id} className="rounded-[24px] border border-[#dce9e1] bg-white p-6"><div className="flex items-start justify-between gap-4"><span className="flex size-11 items-center justify-center rounded-xl bg-[#fff3dc] text-[#a56b16]"><CalendarClock className="size-5" /></span><span className="rounded-full bg-[#eef5f0] px-2.5 py-1 text-[10px] font-bold text-[#678078]">Your reminder</span></div><h2 className="mt-6 text-base font-bold">{task.title}</h2><p className="mt-2 text-sm leading-6 text-[#789087]">{task.description}</p><p className="mt-3 text-xs font-semibold text-[#678078]">Your date: {formatDate(task.dueDate)}</p>{task.status !== 'completed' ? <button onClick={() => complete(task.id)} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#0f5c49] px-4 py-3 text-xs font-bold text-white"><Check className="size-4" /> Mark reminder complete</button> : <p className="mt-6 flex items-center gap-2 text-xs font-bold text-[#0f8062]"><CheckCircle2 className="size-4" /> Completed</p>}</div>) : <div className="rounded-[24px] border border-dashed border-[#c8ddd2] bg-white p-10 text-center md:col-span-2"><CalendarClock className="mx-auto size-7 text-[#0f8062]" /><h2 className="mt-4 font-bold">No personal reminders yet</h2><p className="mt-2 text-sm text-[#789087]">The Rwanda tax calendar above shows recurring reference dates. Add a personal reminder once you have confirmed the due date in eTax.</p></div>}</div></section>
}
function Profile({ notify, language }: { notify: (message: string) => void; language: Language }) {
  const { data, error, isLoading, mutate } = useSWR('/api/profile', fetchJson)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    setSaving(true)
    setFormError('')
    try {
      const response = await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessName: values.get('businessName'), tin: values.get('tin'), language }) })
      const result = await response.json()
      if (!response.ok) { setFormError(result.error || 'Could not save profile.'); return }
      await mutate()
      notify('Business details saved. Verify registration details with RRA.')
    } catch { setFormError('Could not save profile. Check your connection and try again.') }
    finally { setSaving(false) }
  }
  const profileData = data?.profile
  return <section className="mt-10 max-w-2xl rounded-[24px] border border-[#dce9e1] bg-white p-6 md:p-8"><div className="flex items-center gap-4"><span className="flex size-12 items-center justify-center rounded-2xl bg-[#dff3e9] text-[#0f8062]"><Settings2 className="size-5" /></span><div><h2 className="text-base font-bold">Business settings</h2><p className="mt-1 text-xs text-[#789087]">Used on your review records and exports.</p></div></div>{isLoading ? <p className="mt-8 text-sm text-[#789087]">Loading saved details…</p> : error ? <p role="alert" className="mt-8 text-sm text-[#b54739]">Could not load business details.</p> : <form key={profileData?.userId || 'profile'} onSubmit={save}><div className="mt-8 grid gap-5"><label className="grid gap-2 text-xs font-bold">Business name<input name="businessName" required minLength={2} maxLength={160} defaultValue={profileData?.businessName || ''} placeholder="Your registered business" className="h-11 rounded-xl border border-[#c8ddd2] px-3 text-sm font-normal outline-none focus:border-[#0f8062]" /></label><label className="grid gap-2 text-xs font-bold">Rwanda TIN<input name="tin" required minLength={3} maxLength={32} defaultValue={profileData?.tin === 'PENDING' ? '' : profileData?.tin || ''} placeholder="Your TIN" className="h-11 rounded-xl border border-[#c8ddd2] px-3 text-sm font-normal outline-none focus:border-[#0f8062]" /></label></div><p className="mt-4 text-xs leading-5 text-[#789087]">Saving these details does not verify taxpayer registration or certify an RRA device.</p>{formError && <p role="alert" className="mt-4 text-xs text-[#b54739]">{formError}</p>}<button disabled={saving} className="mt-7 rounded-xl bg-[#0f5c49] px-4 py-3 text-xs font-bold text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save business details'}</button></form>}</section>
}
function FilingPreparation({ language }: { language: Language }) {
  const [period, setPeriod] = useState(kigaliPeriod())
  const [pack, setPack] = useState<Record<string, any> | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const prepare = async () => {
    setLoading(true)
    setLoadError('')
    try {
      const response = await fetch(`/api/filing-pack?period=${encodeURIComponent(period)}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'The workpaper could not be prepared.')
      setPack(data)
    } catch {
      setPack(null)
      setLoadError('Could not prepare this period. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }
  const download = () => {
    if (!pack) return
    const columns = ['Record type', 'Imisoro record ID', 'Date', 'Supplier / counterparty', 'TIN', 'Invoice / EBM reference', 'Currency', 'Gross amount RWF', 'VAT RWF', 'EBM evidence', 'Workpaper status', 'Extraction status', 'Confidence', 'Scan notes', 'Source document', 'RRA receipt number']
    const purchases = [...(pack.purchaseInvoices || []), ...(pack.undatedPurchaseInvoices || [])].map((invoice: Record<string, unknown>) => ['Purchase', invoice.id, invoice.invoiceDate, invoice.supplier, invoice.supplierTin, invoice.invoiceNumber, invoice.currency, invoice.amountRwf, invoice.vatRwf, invoice.ebmEvidence, invoice.reviewStatus, invoice.extractionStatus, invoice.extractionConfidence ?? '', Array.isArray(invoice.extractionNotes) ? invoice.extractionNotes.join('; ') : '', invoice.originalFilename, ''])
    const sales = [...(pack.recordedSales || []).map((sale: Record<string, unknown>) => ['Manual sale', sale.id, sale.transactionDate, sale.counterparty, '', sale.reference, 'RWF', sale.amountRwf, '', '', 'Not RRA-fiscalized', 'manual_entry', '', '', '', '']), ...(pack.fiscalizedSales || []).map((sale: Record<string, unknown>) => ['Fiscalized sale', sale.id, sale.saleDate, sale.counterparty, '', '', 'RWF', sale.totalRwf, '', '', 'RRA receipt recorded', 'verified_fiscalized', '', '', '', sale.fiscalReceiptNumber])]
    const csvRows: unknown[][] = [['Business', pack.taxpayer?.businessName || ''], ['Taxpayer TIN', pack.taxpayer?.tin || ''], ['Filing period', pack.period || period], [], columns, ...purchases, ...sales]
    const csv = csvRows.map(row => row.map((value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `rra-etax-workpaper-${period}.csv`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }; return <section className="mt-10 space-y-6"><div className="rounded-[24px] bg-[#10251f] p-6 text-white md:p-8"><div className="flex flex-col justify-between gap-6 md:flex-row md:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9ee5c7]">{tr(language, 'RRA eTax · Filing preparation')}</p><h2 className="mt-3 max-w-2xl text-2xl font-bold tracking-[-0.04em] md:text-3xl">{tr(language, 'Prepare your return with a reviewable evidence pack.')}</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">{tr(language, 'Organize the period’s source documents, reviewed purchase records, and sales records before completing the return in RRA eTax.')}</p></div><div className="flex shrink-0 items-end gap-2"><label className="grid gap-2 text-xs font-semibold text-white/70">{tr(language, 'Filing period')}<input type="month" value={period} onChange={event => setPeriod(event.target.value)} className="h-11 rounded-xl border border-white/15 bg-white/10 px-3 text-sm text-white outline-none focus:border-[#9ee5c7]" /></label><button onClick={prepare} disabled={loading} className="h-11 rounded-xl bg-[#9ee5c7] px-4 text-xs font-bold text-[#10251f] disabled:opacity-60">{tr(language, loading ? 'Preparing…' : 'Prepare pack')}</button></div></div></div>{loadError && <p role="alert" className="rounded-xl border border-[#e4c7c2] bg-[#fff4f2] p-4 text-sm text-[#9b3d32]">{loadError}</p>}<div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]"><div className="rounded-[24px] border border-[#dce9e1] bg-white p-6"><p className="text-xs font-bold uppercase tracking-[0.15em] text-[#0f8062]">{tr(language, 'Filing readiness checklist')}</p><h3 className="mt-2 text-lg font-bold">{tr(language, 'Your eTax handoff, step by step')}</h3><div className="mt-5 space-y-3">{(pack?.checklist || [{ id: 'period', label: 'Choose the filing period and prepare a pack', status: 'ready' }, { id: 'invoice-scan', label: 'Resolve scan issues and verify invoice numbers, TINs, dates, and EBM evidence', status: 'required' }, { id: 'review', label: 'Review purchase invoices and VAT evidence', status: 'required' }, { id: 'sales', label: 'Reconcile sales with EBM/EIS records', status: 'required' }, { id: 'submit', label: 'Complete and submit the return in RRA eTax', status: 'external' }]).map((item: any) => <div key={item.id} className="flex items-start gap-3 rounded-xl bg-[#f7fbf8] p-3.5"><span className={`mt-0.5 size-2.5 shrink-0 rounded-full ${item.status === 'ready' ? 'bg-[#0f8062]' : item.status === 'blocked' ? 'bg-[#c44d3e]' : 'bg-[#d89b32]'}`} /><div className="flex-1"><p className="text-sm font-semibold">{tr(language, item.label)}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#789087]">{tr(language, item.status === 'external' ? 'Complete in RRA eTax' : item.status)}</p></div></div>)}</div></div><div className="rounded-[24px] border border-[#dce9e1] bg-white p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.15em] text-[#0f8062]">{tr(language, 'Period summary')}</p><h3 className="mt-2 text-lg font-bold">{pack?.period || period}</h3></div><FileCheck2 className="size-5 text-[#0f8062]" /></div>{pack ? <div className="mt-5 grid grid-cols-2 gap-3">{[['Purchase invoices', pack.totals.purchaseInvoiceCount], ['Undated invoices', pack.totals.undatedPurchaseCount], ['Need review', pack.totals.pendingReviewCount], ['Supported input VAT', money(pack.totals.reviewedPurchaseVatRwf)], ['RRA-fiscalized sales', money(pack.totals.fiscalizedSalesGrossRwf)], ['Manual sales (not fiscalized)', money(pack.totals.manualSalesGrossRwf)]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-[#f4f8f5] p-3"><p className="text-[10px] text-[#789087]">{tr(language, String(label))}</p><p className="mt-2 text-sm font-bold">{value}</p></div>)}</div> : <p className="mt-5 text-sm leading-6 text-[#789087]">Prepare the selected period to see its supporting documents, review counts, and available tax figures.</p>}{pack && <button onClick={download} className="mt-5 w-full rounded-xl bg-[#0f5c49] px-4 py-3 text-xs font-bold text-white">Download workpaper CSV</button>}<a href="https://etax.rra.gov.rw/login" target="_blank" rel="noopener noreferrer" className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[#c8ddd2] bg-white px-4 py-3 text-xs font-bold text-[#0f5c49]"><ExternalLink className="size-3.5" />Open RRA eTax</a></div></div><div role="note" className="rounded-2xl border border-[#ead9b8] bg-[#fff9ec] p-4 text-xs leading-5 text-[#735725]"><strong>{tr(language, 'Preparation only — no direct RRA submission.')}</strong> {tr(language, 'The downloaded file is an internal workpaper, not the official VAT annexure, an RRA-approved return, or proof of filing. Download the current annexure in eTax, transfer and validate the verified figures there, then submit in eTax. Output VAT and statutory adjustments are not calculated here.')}</div>{pack?.notice && <p className="text-[11px] text-[#789087]">Generated for {pack.taxpayer.businessName || 'your business'} · TIN {pack.taxpayer.tin || 'not set'} · {new Date(pack.generatedAt).toLocaleString()}</p>}</section> }
function Sales() {
  const [form, setForm] = useState({ counterparty: '', amount: '', vatAmount: '0', reference: '', transactionDate: kigaliToday() })
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/ledger', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, type: 'sale', amount: Number(form.amount), vatAmount: Number(form.vatAmount) }) })
      const data = await response.json()
      if (!response.ok) { setError(data.error || 'The sale could not be posted.'); return }
      setSaved(true)
      setForm(current => ({ ...current, counterparty: '', amount: '', vatAmount: '0', reference: '' }))
    } catch { setError('The sale could not be posted. Check your connection and try again.') }
    finally { setSaving(false) }
  }
  return <section className="mt-10 grid gap-5 lg:grid-cols-[1fr_0.8fr]"><form onSubmit={submit} className="rounded-[24px] border border-[#dce9e1] bg-white p-6 md:p-8"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0f8062]">Manual sales ledger</p><h2 className="mt-3 text-2xl font-bold tracking-[-0.04em]">Record a sale</h2><p className="mt-2 text-sm leading-6 text-[#789087]">Enter a gross amount and the output VAT you have verified. The app does not calculate statutory tax treatment or fiscalize this sale.</p><div className="mt-7 grid gap-4"><label className="grid gap-2 text-xs font-bold">Customer or counterparty<input required value={form.counterparty} onChange={event => setForm({ ...form, counterparty: event.target.value })} className="h-11 rounded-xl border border-[#c8ddd2] px-3 text-sm font-normal outline-none focus:border-[#0f8062]" placeholder="Customer name" /></label><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-xs font-bold">Gross amount (RWF)<input required type="number" min="1" step="1" value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })} className="h-11 rounded-xl border border-[#c8ddd2] px-3 text-sm font-normal outline-none focus:border-[#0f8062]" placeholder="0" /></label><label className="grid gap-2 text-xs font-bold">Verified output VAT (RWF)<input required type="number" min="0" step="1" value={form.vatAmount} onChange={event => setForm({ ...form, vatAmount: event.target.value })} className="h-11 rounded-xl border border-[#c8ddd2] px-3 text-sm font-normal outline-none focus:border-[#0f8062]" /></label></div><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-xs font-bold">Invoice or EBM reference<input value={form.reference} onChange={event => setForm({ ...form, reference: event.target.value })} className="h-11 rounded-xl border border-[#c8ddd2] px-3 text-sm font-normal outline-none focus:border-[#0f8062]" placeholder="Optional reference" /></label><label className="grid gap-2 text-xs font-bold">Sale date<input required type="date" value={form.transactionDate} onChange={event => setForm({ ...form, transactionDate: event.target.value })} className="h-11 rounded-xl border border-[#c8ddd2] px-3 text-sm font-normal outline-none focus:border-[#0f8062]" /></label></div></div>{error && <p role="alert" className="mt-4 text-xs font-medium text-[#b54739]">{error}</p>}<button disabled={saving} className="mt-7 rounded-xl bg-[#0f5c49] px-4 py-3 text-xs font-bold text-white disabled:opacity-60">{saving ? 'Posting…' : 'Post manual sale'}</button>{saved && <p role="status" className="mt-4 text-xs font-bold text-[#0f8062]">Sale posted. It still needs statement evidence and separate RRA fiscalization.</p>}</form><div className="rounded-[24px] bg-[#10251f] p-6 text-white md:p-8"><ReceiptText className="size-6 text-[#9ee5c7]" /><h2 className="mt-6 text-xl font-bold">Manual ledger entry only</h2><p className="mt-3 text-sm leading-6 text-white/60">The entry is balanced using your declared VAT split. It is not an RRA-approved receipt or proof of filing. Sales created here remain unmatched until statement evidence is recorded.</p></div></section>
}
function Reconciliation({ notify }: { notify: (message: string) => void }) {
  const { data, error, isLoading, mutate } = useSWR('/api/reconciliation', fetchJson)
  const items = data?.items || []
  const [savingId, setSavingId] = useState<string | null>(null)
  const [formError, setFormError] = useState('')
  const match = async (event: React.FormEvent<HTMLFormElement>, transactionId: string) => {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    setSavingId(transactionId)
    setFormError('')
    try {
      const response = await fetch('/api/reconciliation', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId,
          statementReference: values.get('statementReference'),
          statementDate: values.get('statementDate'),
          statementAmount: Number(values.get('statementAmount')),
          confirmation: values.get('confirmation') === 'on',
        }),
      })
      const result = await response.json()
      if (!response.ok) { setFormError(result.error || 'The match could not be saved.'); return }
      await mutate()
      notify('Statement evidence recorded. This manual match is self-attested, not bank-verified.')
    } catch { setFormError('The match could not be saved. Check your connection and try again.') }
    finally { setSavingId(null) }
  }
  return <section className="mt-10 rounded-[24px] border border-[#dce9e1] bg-white"><div className="border-b border-[#e7f0ea] p-6"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0f8062]">Manual reconciliation queue</p><h2 className="mt-2 text-xl font-bold">Record evidence for each money movement.</h2><p className="mt-2 text-sm text-[#789087]">No bank feed is connected. A match is a reviewer&apos;s attestation to statement reference, date, and exact amount; it is not independently verified.</p></div>{isLoading ? <p className="p-8 text-sm text-[#789087]">Loading unmatched transactions…</p> : error ? <p role="alert" className="p-8 text-sm text-[#b54739]">Could not load reconciliation records.</p> : items.length ? <div className="divide-y divide-[#edf3ee]">{items.map((item: { id: string; counterparty: string; amount: number; transactionDate: string; needsEvidence?: boolean }) => <div key={item.id} className="p-5 md:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-bold">{item.counterparty}</p><p className="mt-1 text-xs text-[#789087]">{formatDate(item.transactionDate)} · {item.id}{item.needsEvidence ? ' · evidence required' : ''}</p></div><span className="text-sm font-bold">{money(item.amount)}</span></div><form onSubmit={(event) => match(event, item.id)} className="mt-4 grid gap-3 sm:grid-cols-3"><label className="grid gap-1.5 text-xs font-semibold">Statement reference<input name="statementReference" required minLength={3} maxLength={120} className="h-10 rounded-lg border border-[#c8ddd2] bg-white px-3 text-sm font-normal outline-none focus:border-[#0f8062]" placeholder="Bank or Mobile Money ID" /></label><label className="grid gap-1.5 text-xs font-semibold">Statement date<input name="statementDate" required type="date" className="h-10 rounded-lg border border-[#c8ddd2] bg-white px-3 text-sm font-normal outline-none focus:border-[#0f8062]" /></label><label className="grid gap-1.5 text-xs font-semibold">Statement amount (RWF)<input name="statementAmount" required type="number" min="1" step="1" className="h-10 rounded-lg border border-[#c8ddd2] bg-white px-3 text-sm font-normal outline-none focus:border-[#0f8062]" placeholder="Enter the statement amount" /></label><label className="flex items-start gap-2 text-xs leading-5 text-[#678078] sm:col-span-2"><input name="confirmation" required type="checkbox" className="mt-1 accent-[#0f8062]" />I checked these details against the original bank or Mobile Money statement.</label><button disabled={savingId === item.id} className="rounded-lg bg-[#0f5c49] px-3 py-2 text-xs font-bold text-white disabled:opacity-60">{savingId === item.id ? 'Saving…' : 'Record manual match'}</button></form></div>)}</div> : <div className="p-12 text-center"><ArrowLeftRight className="mx-auto size-7 text-[#0f8062]" /><p className="mt-4 text-sm font-bold">Nothing needs matching</p><p className="mt-2 text-xs text-[#789087]">New manual entries will appear here until statement evidence is recorded.</p></div>}{formError && <p role="alert" className="border-t border-[#f0dddd] px-5 py-3 text-xs font-medium text-[#b54739]">{formError}</p>}</section>
}
function Reports() {
  const [period, setPeriod] = useState(kigaliPeriod())
  const { data, error, isLoading } = useSWR(`/api/reports?period=${encodeURIComponent(period)}`, fetchJson)
  const metrics = data?.metrics
  return <section className="mt-10 space-y-5"><div className="rounded-[24px] bg-[#10251f] p-6 text-white md:p-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9ee5c7]">Journal summary</p><h2 className="mt-3 text-2xl font-bold">Period-based management view.</h2><p className="mt-2 text-sm text-white/60">Income and expenses use posted journal entries. This is not a complete statutory P&amp;L.</p></div><label className="grid gap-1.5 text-xs font-semibold text-white/70">Reporting month<input type="month" value={period} onChange={event => setPeriod(event.target.value)} className="h-10 rounded-xl border border-white/15 bg-white/10 px-3 text-sm text-white outline-none focus:border-[#9ee5c7]" /></label></div></div>{data?.legacyPostingReviewRequired && <div role="note" className="rounded-2xl border border-[#ead9b8] bg-[#fff9ec] p-4 text-sm leading-6 text-[#735725]">{data.legacyTransactionCount} older transactions are excluded from these totals because their historical postings were created under the earlier rules. They have not been rewritten; review and correct them with your accountant.</div>}{error && <p role="alert" className="text-sm text-[#b54739]">Could not load this report period.</p>}<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[['Income', metrics?.income || 0], ['Expenses', metrics?.expenses || 0], ['Net movement', metrics?.net || 0], ['Cash movement', metrics?.cash || 0]].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-[#dce9e1] bg-white p-5"><p className="text-xs font-bold text-[#789087]">{label}</p><p className="mt-4 text-xl font-bold">{isLoading ? '…' : money(Number(value))}</p><p className="mt-1 text-[11px] text-[#789087]">{metrics?.transactionCount || 0} entries in {period}</p></div>)}</div></section>
}
function UploadDialog({ onClose, onUpload, uploading }: { onClose: () => void; onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void; uploading: boolean }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#10251f]/40 p-5 backdrop-blur-sm"><div role="dialog" aria-modal="true" aria-labelledby="invoice-upload-title" className="w-full max-w-md rounded-[24px] bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0f8062]">Add evidence</p><h2 id="invoice-upload-title" className="mt-2 text-xl font-bold">Upload an invoice</h2><p className="mt-2 text-sm leading-6 text-[#789087]">Choose a PDF or photo. We keep the original private, read a draft, and open it for your review.</p></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-[#789087]" aria-label="Close upload"><X className="size-4" /></button></div><label className={`mt-7 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#c8ddd2] bg-[#f7fbf8] px-5 py-12 text-center transition ${uploading ? 'opacity-60' : 'cursor-pointer hover:border-[#0f8062] hover:bg-[#eef8f2]'}`}><Upload className="size-7 text-[#0f8062]" /><span className="mt-3 text-sm font-bold">{uploading ? 'Uploading and reading…' : 'Choose a document'}</span><span className="mt-1 text-xs text-[#789087]">PDF, JPG, or PNG · up to 10 MB · private source file</span><input type="file" accept="application/pdf,image/jpeg,image/png" disabled={uploading} onChange={onUpload} className="sr-only" /></label>{uploading && <p role="status" className="mt-4 rounded-xl bg-[#eef5f0] p-3 text-xs leading-5 text-[#31564a]">This can take a little while. The file is saved before extraction, so a scan issue will not lose your original.</p>}</div></div>
}
