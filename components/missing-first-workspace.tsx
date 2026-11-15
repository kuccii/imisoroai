'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { ArrowDownToLine, ArrowUpRight, Check, Clipboard, FileUp, ListChecks, Menu, Plus, Settings, Users, Wallet, X } from 'lucide-react'
import type { Language } from '@/lib/i18n'
import { translate } from '@/lib/i18n'

type RecordRow = { id: string; kind: string; supplier: string; tin: string; reference: string; recordDate: string; amount: number; vat: number | null; phone: string | null; userTag: string | null; chaseStatus: string; confirmed: boolean }
type Match = { group: string; purchaseIds: string[]; paymentIds: string[]; reason: string; confidence: number; confirmed: boolean }
type Data = { records: RecordRow[]; mappings: { normalizedName: string; canonicalName: string; confirmed: boolean; phone: string | null }[]; matches: Match[]; metrics: { unsupportedRwf: number; chasedRwf: number; recoveredRwf: number } }
type TabularPreview = { headers: string[]; rows: string[][]; rowCount: number }
const fetcher = async (url: string) => { const response = await fetch(url); if (!response.ok) throw new Error('Request failed.'); return response.json() }
const amount = (value: number) => new Intl.NumberFormat('en-RW', { style: 'currency', currency: 'RWF', maximumFractionDigits: 0 }).format(value)
const normalize = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
type Section = 'Missing' | 'Imports' | 'Suppliers' | 'Ledger draft' | 'Exports' | 'Deadlines' | 'Settings'
const navigation: { label: Section; icon: typeof ListChecks }[] = [
  { label: 'Missing', icon: ListChecks }, { label: 'Imports', icon: FileUp }, { label: 'Suppliers', icon: Users }, { label: 'Ledger draft', icon: Wallet }, { label: 'Exports', icon: ArrowDownToLine }, { label: 'Deadlines', icon: ListChecks }, { label: 'Settings', icon: Settings },
]
const templates: Record<Language, string> = {
  en: 'Hello, we are reconciling our purchase records for {date}. Could you please send the EBM receipt for {amount} RWF ({reference})? Thank you.',
  rw: 'Muraho, turimo kugenzura inyandiko z’ibyo twaguze byo ku wa {date}. Mwaduha inyemezabuguzi ya EBM ya {amount} RWF ({reference})? Murakoze.',
  fr: 'Bonjour, nous vérifions nos achats du {date}. Pourriez-vous nous envoyer le reçu EBM de {amount} RWF ({reference}) ? Merci.',
}

export function MissingFirstWorkspace({ userName, initialLanguage = 'en' }: { userName: string; initialLanguage?: Language }) {
  const { data, error, mutate } = useSWR<Data>('/api/imports', fetcher)
  const { data: taskData } = useSWR<{ tasks: { id: string; title: string; description: string; dueDate: string; status: string }[] }>('/api/compliance', fetcher)
  const [section, setSection] = useState<Section>('Missing')
  const [language, setLanguage] = useState<Language>(initialLanguage)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [kind, setKind] = useState<'rra_purchases' | 'payments'>('rra_purchases')
  const [file, setFile] = useState<File | null>(null)
  const [pasted, setPasted] = useState('')
  const [preview, setPreview] = useState<TabularPreview | null>(null)
  const [mapping, setMapping] = useState<Record<string, number>>({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [manual, setManual] = useState({ supplier: '', date: new Date().toISOString().slice(0, 10), amount: '', phone: '' })
  const [supplierForm, setSupplierForm] = useState({ alias: '', canonical: '', tin: '', phone: '' })
  const t = (text: string) => translate(language, text)
  const records = data?.records ?? []
  const payments = records.filter(record => record.kind === 'payments')
  const missingMatches = data?.matches.filter(match => match.group === 'missing_at_rra' || match.group === 'likely_no_ebm_possible') ?? []
  const missingRows = missingMatches.flatMap(match => match.paymentIds.map(id => ({ record: payments.find(row => row.id === id), match }))).filter((item): item is { record: RecordRow; match: Match } => Boolean(item.record))
  const pendingSupplierNames = useMemo(() => [...new Set(records.map(row => row.supplier))].filter(name => !data?.mappings.some(item => item.confirmed && item.normalizedName === normalize(name))), [records, data?.mappings])
  const groups: { key: string; title: string; matches: Match[] }[] = [
    { key: 'supported', title: 'Supported · internal suggestion', matches: data?.matches.filter(item => item.group === 'supported') ?? [] },
    { key: 'missing_at_rra', title: 'Missing at RRA', matches: data?.matches.filter(item => item.group === 'missing_at_rra') ?? [] },
    { key: 'likely_no_ebm_possible', title: 'Likely no-EBM-possible · user-tagged', matches: data?.matches.filter(item => item.group === 'likely_no_ebm_possible') ?? [] },
    { key: 'in_rra_not_in_books', title: 'In RRA but not in books', matches: data?.matches.filter(item => item.group === 'in_rra_not_in_books') ?? [] },
    { key: 'needs_review', title: 'Needs human review · ambiguous', matches: data?.matches.filter(item => item.group === 'needs_review') ?? [] },
  ]

  const sendImport = async (previewOnly: boolean) => {
    const form = new FormData()
    form.set('kind', kind)
    if (file) form.set('file', file)
    else form.set('pasted', pasted)
    if (previewOnly) form.set('preview', 'true')
    else form.set('mapping', JSON.stringify(mapping))
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/imports', { method: 'POST', body: form })
      const result = await response.json()
      if (!response.ok) throw new Error(result.rowErrors?.join(' ') || result.error || 'Import failed.')
      if (previewOnly) {
        setPreview(result)
        const headers = (result.headers as string[]).map(normalize)
        const guess = (terms: string[]) => { const index = headers.findIndex(header => terms.some(term => header.includes(term))); return index < 0 ? undefined : index }
        setMapping({ supplier: guess(['supplier', 'vendor', 'merchant', 'counterparty', 'name']), date: guess(['date', 'transactiondate']), amount: guess(['amount', 'total', 'gross', 'paid']), tin: guess(['tin', 'taxpayer']), receiptNumber: guess(['receipt', 'invoice', 'reference', 'number']), vat: guess(['vat', 'tax']), phone: guess(['phone', 'mobile']) })
      } else {
        setPreview(null); setFile(null); setPasted(''); setMessage(`${result.imported} rows imported. Suggestions remain internal and need review.`); await mutate()
      }
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Could not complete the import.') }
    finally { setBusy(false) }
  }

  const update = async (body: unknown) => {
    const response = await fetch('/api/imports', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Could not save this change.')
    await mutate()
  }

  const addManual = async (event: React.FormEvent) => {
    event.preventDefault()
    const safeCell = (value: string) => value.replace(/[\t\r\n]/g, ' ').trim()
    const manualRow = `Supplier\tDate\tAmount\tPhone\n${safeCell(manual.supplier)}\t${safeCell(manual.date)}\t${safeCell(manual.amount)}\t${safeCell(manual.phone)}`
    setPasted(manualRow)
    setFile(null); setKind('payments')
    const form = new FormData()
    form.set('kind', 'payments')
    form.set('pasted', manualRow)
    form.set('mapping', JSON.stringify({ supplier: 0, date: 1, amount: 2, phone: 3 }))
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/imports', { method: 'POST', body: form })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not save the payment.')
      setManual({ supplier: '', date: new Date().toISOString().slice(0, 10), amount: '', phone: '' })
      setMessage('Payment saved. Match suggestions need human review.'); setSection('Missing'); await mutate()
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Could not save payment.') }
    finally { setBusy(false) }
  }

  const exportLedger = () => {
    const rows = [['Date', 'Supplier', 'TIN', 'Receipt / reference', 'Amount RWF', 'Reason', 'Review status'], ...missingRows.map(({ record, match }) => [record.recordDate, record.supplier, record.tin, record.reference, String(record.amount), match.reason, record.confirmed ? 'Human reviewed' : 'Needs human review'])]
    const csv = rows.map(row => row.map(value => `"${value.replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = 'imisoro-ledger-draft-review.csv'; link.click(); URL.revokeObjectURL(url)
  }

  const copyChase = async (record: RecordRow) => {
    const text = templates[language].replace('{date}', record.recordDate).replace('{amount}', new Intl.NumberFormat('en-RW').format(record.amount)).replace('{reference}', record.reference || 'purchase')
    await navigator.clipboard.writeText(text)
    setMessage(language === 'en' ? 'Message copied. Review it before sending.' : language === 'rw' ? 'Ubutumwa bwakoporowe. Banza ubusuzume mbere yo kubwohereza. Ikinyarwanda gikeneye gusuzumwa n’umuvugizi kavukire.' : 'Message copiée. Relisez-la avant envoi. Le français doit être vérifié par une personne de langue maternelle.')
  }

  return <div className="min-h-screen bg-[#f4f7f3] text-[#10251f]">
    {mobileOpen && <button aria-label="Close navigation" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-black/30 lg:hidden" />}
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col border-r border-[#dce9e1] bg-white px-4 py-5 transition-transform lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <a href="/dashboard" className="flex items-center gap-3 rounded-xl px-2 py-2"><span className="flex size-10 items-center justify-center rounded-xl bg-[#0f5c49] text-white"><ListChecks className="size-5" /></span><span><strong className="block text-sm">Imisoro AI</strong><small className="text-[10px] text-[#678078]">Tax evidence workspace</small></span></a>
      <div className="mt-7 rounded-xl bg-[#f4f8f5] p-3"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#678078]">Workspace</p><p className="mt-1 truncate text-sm font-semibold">{userName}</p><p className="text-xs text-[#678078]">What&apos;s missing first</p></div>
      <nav aria-label="Main navigation" className="mt-6 flex flex-col gap-1">{navigation.map(({ label, icon: Icon }) => <button key={label} onClick={() => { setSection(label); setMobileOpen(false) }} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold ${section === label ? 'bg-[#dff3e9] text-[#0f8062]' : 'text-[#587069] hover:bg-[#f4f8f5]'}`}><Icon className="size-4" />{label}</button>)}</nav>
      <p className="mt-auto rounded-xl bg-[#10251f] p-4 text-xs leading-5 text-white/75">Internal evidence workflow only. No e-Tax access or return submission.</p>
    </aside>
    <div className="lg:pl-[260px]">
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-[#dce9e1] bg-[#f4f7f3]/95 px-4 backdrop-blur md:px-8"><button aria-label="Open navigation" onClick={() => setMobileOpen(true)} className="rounded-lg border border-[#c8ddd2] bg-white p-2 lg:hidden"><Menu className="size-4" /></button><div className="ml-auto flex items-center gap-2"><select aria-label="Language" value={language} onChange={event => setLanguage(event.target.value as Language)} className="h-9 rounded-lg border border-[#dce9e1] bg-white px-2 text-xs"><option value="en">English</option><option value="rw">Kinyarwanda</option><option value="fr">Français</option></select><span className="hidden text-xs text-[#678078] sm:inline">{userName}</span></div></header>
      <main className="mx-auto max-w-6xl p-4 md:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0f8062]">{section === 'Missing' ? 'Your next actions' : 'Tax evidence workspace'}</p><h1 className="mt-2 text-3xl font-bold tracking-[-0.045em]">{section === 'Missing' ? `What’s missing, ${userName.split(' ')[0]}?` : t(section)}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#678078]">{section === 'Missing' ? 'Compare what was paid with the imported purchase list. Review the gaps and decide which suppliers to contact.' : section === 'Imports' ? 'Bring in the records you already have. Formats are user-provided and not verified RRA exports.' : 'Keep the work focused on what needs review and what to do next.'}</p></div>{section === 'Missing' && <button onClick={() => setSection('Imports')} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0f5c49] px-4 text-sm font-bold text-white"><Plus className="size-4" /> Import records</button>}</div>
        {message && <div role="status" className="mt-5 flex items-start justify-between gap-4 rounded-xl border border-[#c8ddd2] bg-white p-3 text-sm">{message}<button aria-label="Dismiss" onClick={() => setMessage('')}><X className="size-4" /></button></div>}
        {error && <div role="alert" className="mt-5 rounded-xl border border-[#edc7bd] bg-white p-4 text-sm text-[#923f34]">Could not load your evidence. Refresh and try again.</div>}
        {section === 'Missing' && <>
          <div className="mt-7 grid gap-3 sm:grid-cols-3"><Metric title="Unsupported amount" value={amount(data?.metrics.unsupportedRwf ?? 0)} detail="User-confirmed missing-list estimate" /><Metric title="Chased" value={amount(data?.metrics.chasedRwf ?? 0)} detail="Manually marked as chased" /><Metric title="Recovered" value={amount(data?.metrics.recoveredRwf ?? 0)} detail="Confirmed after a later import" /></div>
          <section className="mt-7 rounded-2xl border border-[#dce9e1] bg-white p-4 md:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Supplier chase list</h2><p className="mt-1 text-xs text-[#678078]">Each match is an internal suggestion; confirm against source documents.</p></div><span className="rounded-full bg-[#fff5dc] px-3 py-1.5 text-xs font-semibold text-[#765821]">{missingRows.length} to review</span></div>
            {missingRows.length === 0 ? <div className="mt-5 rounded-xl bg-[#f4f8f5] p-6 text-sm text-[#678078]">No gaps yet. Import a purchase list and a payment statement to see what may be missing.</div> : <div className="mt-4 flex flex-col gap-3">{missingRows.map(({ record, match }) => <article key={record.id} className="rounded-xl border border-[#e5eee8] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{record.supplier}</h3><span className="rounded-full bg-[#fff5dc] px-2 py-1 text-[10px] font-bold text-[#765821]">{record.userTag ? 'User-tagged' : 'Missing at RRA · suggested'}</span></div><p className="mt-1 text-xs text-[#678078]">{record.recordDate} · {record.reference || 'No reference'} · {amount(record.amount)}</p><p className="mt-2 max-w-2xl text-xs leading-5 text-[#587069]">{match.reason} Confidence: {Math.round(match.confidence * 100)}%. This is not a tax decision.</p></div><select aria-label={`Chase status for ${record.supplier}`} value={record.chaseStatus} onChange={event => void update({ action: 'chase_status', recordId: record.id, status: event.target.value }).catch(reason => setMessage(reason.message))} className="h-9 rounded-lg border border-[#dce9e1] bg-white px-2 text-xs"><option value="not_chased">Not chased</option><option value="chased">Chased</option><option value="complied">Supplier complied</option><option value="no_response">No response</option></select></div>
                <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => void copyChase(record).catch(() => setMessage('Clipboard unavailable. Select and copy the message manually.'))} className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#c8ddd2] px-3 text-xs font-semibold"><Clipboard className="size-3.5" /> Copy message</button>{record.phone && <a href={`https://wa.me/${record.phone.replace(/\D/g, '')}?text=${encodeURIComponent(templates[language].replace('{date}', record.recordDate).replace('{amount}', String(record.amount)).replace('{reference}', record.reference || 'purchase'))}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#c8ddd2] px-3 text-xs font-semibold">Open WhatsApp <ArrowUpRight className="size-3.5" /></a>}<button onClick={() => void update({ action: 'tag_possible', recordId: record.id, enabled: !record.userTag }).catch(reason => setMessage(reason.message))} className="inline-flex h-9 items-center rounded-lg border border-[#c8ddd2] px-3 text-xs font-semibold">{record.userTag ? 'Remove no-EBM tag' : 'Tag likely no-EBM-possible'}</button></div>
                {language !== 'en' && <p className="mt-3 text-[11px] font-medium text-[#8a6725]">{language === 'rw' ? 'Kinyarwanda template needs native-speaker review.' : 'French template needs native-speaker review.'}</p>}
              </article>)}</div>}
          </section>
          <section className="mt-7 grid gap-3 md:grid-cols-2">{groups.map(group => <details key={group.key} className="rounded-xl border border-[#dce9e1] bg-white p-4"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold">{group.title}<span className="rounded-full bg-[#f4f8f5] px-2 py-1 text-xs">{group.matches.length}</span></summary><div className="mt-3 flex flex-col gap-2">{group.matches.slice(0, 30).map((match, index) => <div key={`${group.key}-${index}`} className="rounded-lg bg-[#f7faf8] p-3 text-xs"><p className="font-semibold">{[...match.paymentIds, ...match.purchaseIds].map(id => records.find(row => row.id === id)?.supplier).filter(Boolean).join(' ↔ ') || 'Evidence record'}</p><p className="mt-1 text-[#678078]">{match.reason} · {Math.round(match.confidence * 100)}% confidence</p>{!match.confirmed && match.group !== 'missing_at_rra' && match.group !== 'in_rra_not_in_books' && <button onClick={() => void update({ action: 'confirm_match', recordIds: [...match.paymentIds, ...match.purchaseIds] }).catch(reason => setMessage(reason.message))} className="mt-2 inline-flex items-center gap-1 font-semibold text-[#0f8062]"><Check className="size-3" /> Confirm internal match</button>}</div>)}{group.matches.length === 0 && <p className="text-xs text-[#789087]">Nothing in this group.</p>}</div></details>)}</section>
        </>}
        {section === 'Imports' && <div className="mt-7 grid gap-5 xl:grid-cols-[0.8fr_1.2fr]"><section className="rounded-2xl border border-[#dce9e1] bg-white p-5"><h2 className="text-lg font-bold">Add a payment manually</h2><p className="mt-1 text-xs leading-5 text-[#678078]">For a cash expense or a single statement line.</p><form onSubmit={addManual} className="mt-4 flex flex-col gap-3">{([['Supplier / counterparty', 'supplier'], ['Date', 'date'], ['Amount RWF', 'amount'], ['Phone (optional)', 'phone']] as const).map(([label, key]) => <label key={key} className="grid gap-1 text-xs font-semibold">{label}<input required={key !== 'phone'} type={key === 'date' ? 'date' : key === 'amount' ? 'number' : 'text'} min={key === 'amount' ? '0' : undefined} value={manual[key]} onChange={event => setManual(current => ({ ...current, [key]: event.target.value }))} className="h-10 rounded-lg border border-[#dce9e1] px-3 text-sm" /></label>)}<button disabled={busy} className="h-10 rounded-lg bg-[#0f5c49] px-4 text-sm font-bold text-white disabled:opacity-60">Save payment</button></form></section>
          <section className="rounded-2xl border border-[#dce9e1] bg-white p-5"><h2 className="text-lg font-bold">Import a purchase list or statement</h2><p className="mt-1 text-xs leading-5 text-[#678078]">CSV/XLSX files or paste a table. Formats are user-supplied; no e-Tax connection is used.</p><div className="mt-4 flex gap-2"><button onClick={() => { setKind('rra_purchases'); setPreview(null) }} className={`rounded-lg px-3 py-2 text-xs font-semibold ${kind === 'rra_purchases' ? 'bg-[#0f5c49] text-white' : 'border border-[#dce9e1]'}`}>RRA purchase list</button><button onClick={() => { setKind('payments'); setPreview(null) }} className={`rounded-lg px-3 py-2 text-xs font-semibold ${kind === 'payments' ? 'bg-[#0f5c49] text-white' : 'border border-[#dce9e1]'}`}>Bank / MoMo</button></div><label className="mt-4 grid gap-2 text-xs font-semibold">Choose CSV or XLSX<input type="file" accept=".csv,.xlsx" onChange={event => { setFile(event.target.files?.[0] ?? null); setPreview(null) }} className="block w-full text-xs" /></label><label className="mt-4 grid gap-2 text-xs font-semibold">Or paste table<textarea value={pasted} onChange={event => { setPasted(event.target.value); setFile(null); setPreview(null) }} rows={4} placeholder={'Supplier\tDate\tAmount\nKivu Supplies\t2026-10-15\t118000'} className="rounded-lg border border-[#dce9e1] p-3 font-mono text-xs" /></label><button disabled={busy || (!file && !pasted.trim())} onClick={() => void sendImport(true)} className="mt-3 h-10 rounded-lg border border-[#0f8062] px-4 text-sm font-bold text-[#0f8062] disabled:opacity-50">{busy ? 'Reading…' : 'Preview and map columns'}</button>
            {preview && <div className="mt-5 border-t border-[#e5eee8] pt-4"><p className="text-sm font-bold">Map columns <span className="font-normal text-[#678078]">({preview.rowCount} rows)</span></p><div className="mt-3 grid gap-3 sm:grid-cols-2">{(['supplier', 'date', 'amount', ...(kind === 'rra_purchases' ? ['tin', 'receiptNumber', 'vat'] : []), 'phone'] as string[]).map(field => <label key={field} className="grid gap-1 text-xs font-semibold">{field === 'receiptNumber' ? 'Receipt / reference' : field === 'supplier' ? 'Supplier / counterparty' : field[0].toUpperCase() + field.slice(1)}{['supplier', 'date', 'amount'].includes(field) && <span className="text-[#923f34]">Required</span>}<select value={mapping[field] ?? ''} onChange={event => setMapping(current => ({ ...current, [field]: Number(event.target.value) }))} className="h-9 rounded-lg border border-[#dce9e1] bg-white px-2"><option value="">Skip</option>{preview.headers.map((header, index) => <option key={`${index}-${header}`} value={index}>{header}</option>)}</select></label>)}</div><div className="mt-4 overflow-x-auto rounded-lg border border-[#e5eee8]"><table className="min-w-full text-left text-[11px]"><thead><tr>{preview.headers.map((header, index) => <th key={index} className="px-2 py-2">{header}</th>)}</tr></thead><tbody>{preview.rows.slice(0, 3).map((row, index) => <tr key={index} className="border-t border-[#e5eee8]">{row.map((cell, cellIndex) => <td key={cellIndex} className="px-2 py-2">{cell}</td>)}</tr>)}</tbody></table></div><button disabled={busy} onClick={() => void sendImport(false)} className="mt-4 h-10 rounded-lg bg-[#0f5c49] px-4 text-sm font-bold text-white">Import {preview.rowCount} rows</button></div>}
          </section></div>}
        {section === 'Suppliers' && <section className="mt-7 rounded-2xl border border-[#dce9e1] bg-white p-5"><h2 className="text-lg font-bold">Supplier directory</h2><p className="mt-1 text-xs text-[#678078]">Confirm each first-time name mapping. This helps future comparisons; it does not establish a legal identity.</p><form onSubmit={async event => { event.preventDefault(); try { await update({ action: 'confirm_supplier', alias: supplierForm.alias, supplier: supplierForm.canonical, tin: supplierForm.tin, phone: supplierForm.phone }); setSupplierForm({ alias: '', canonical: '', tin: '', phone: '' }); setMessage('Supplier mapping saved and confirmed.') } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Could not save supplier.') } }} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><input aria-label="Imported supplier name" placeholder="Imported supplier name" value={supplierForm.alias} onChange={event => setSupplierForm(current => ({ ...current, alias: event.target.value }))} className="h-10 rounded-lg border border-[#dce9e1] px-3 text-sm" list="supplier-names" required /><datalist id="supplier-names">{pendingSupplierNames.map(name => <option key={name}>{name}</option>)}</datalist><input aria-label="Canonical supplier name" placeholder="Confirmed display name" value={supplierForm.canonical} onChange={event => setSupplierForm(current => ({ ...current, canonical: event.target.value }))} className="h-10 rounded-lg border border-[#dce9e1] px-3 text-sm" required /><input aria-label="Supplier TIN" placeholder="TIN (optional)" value={supplierForm.tin} onChange={event => setSupplierForm(current => ({ ...current, tin: event.target.value }))} className="h-10 rounded-lg border border-[#dce9e1] px-3 text-sm" /><input aria-label="Supplier phone" placeholder="Phone (optional)" value={supplierForm.phone} onChange={event => setSupplierForm(current => ({ ...current, phone: event.target.value }))} className="h-10 rounded-lg border border-[#dce9e1] px-3 text-sm" /><button className="h-10 rounded-lg bg-[#0f5c49] px-4 text-sm font-bold text-white sm:col-span-2">Confirm mapping</button></form><div className="mt-6 flex flex-col gap-2">{(data?.mappings ?? []).map(item => <div key={item.normalizedName} className="flex justify-between gap-3 rounded-lg bg-[#f4f8f5] p-3 text-sm"><span>{item.canonicalName}</span><span className="text-xs text-[#678078]">Confirmed supplier · {item.phone || 'No phone'}</span></div>)}</div><div className="mt-7"><h3 className="font-bold">Supplier scorecard</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{[...new Set(payments.map(row => row.supplier))].map(name => { const supplierPayments = payments.filter(row => row.supplier === name); const supplierMissing = missingRows.filter(row => row.record.supplier === name); return <div key={name} className="rounded-lg border border-[#e5eee8] p-3 text-sm"><p className="font-semibold">{name}</p><p className="mt-1 text-xs text-[#678078]">{amount(supplierPayments.reduce((sum, row) => sum + row.amount, 0))} recorded · {supplierMissing.length} open gap(s)</p></div> })}</div></div></section>}
        {section === 'Ledger draft' && <section className="mt-7 rounded-2xl border border-[#ead9b8] bg-[#fff9ec] p-5"><h2 className="text-lg font-bold">Unsupported-expense ledger draft</h2><p className="mt-2 text-sm leading-6">This CSV is a review draft only. The current RRA annexure columns and upload format have not been verified. It is not upload-ready and does not claim deductibility.</p><button onClick={exportLedger} className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg border border-[#d7bd88] bg-white px-4 text-sm font-bold"><ArrowDownToLine className="size-4" /> Download review CSV</button><p className="mt-4 text-xs text-[#765821]">Reason/evidence must be reviewed and documented by an accountant before any tax decision.</p></section>}
        {section === 'Exports' && <section className="mt-7 rounded-2xl border border-[#dce9e1] bg-white p-5"><h2 className="text-lg font-bold">Export review evidence</h2><p className="mt-2 text-sm text-[#678078]">Download the current missing-list draft as a CSV with an explicit not-upload-ready status.</p><button onClick={exportLedger} className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-[#0f5c49] px-4 text-sm font-bold text-white"><ArrowDownToLine className="size-4" /> Export CSV</button></section>}
        {section === 'Deadlines' && <section className="mt-7 rounded-2xl border border-[#dce9e1] bg-white p-5"><h2 className="text-lg font-bold">Deadlines and reminders</h2><p className="mt-1 text-xs text-[#678078]">Verify all dates against current official guidance. Provider reminders are not enabled.</p><div className="mt-4 flex flex-col gap-2">{taskData?.tasks?.map(task => <article key={task.id} className="rounded-lg bg-[#f4f8f5] p-3"><p className="font-semibold">{task.title} · {task.dueDate}</p><p className="mt-1 text-xs text-[#678078]">{task.description}</p></article>)}{!taskData?.tasks?.length && <p className="text-sm text-[#678078]">No in-app reminders yet.</p>}</div></section>}
        {section === 'Settings' && <section className="mt-7 rounded-2xl border border-[#dce9e1] bg-white p-5"><h2 className="text-lg font-bold">Workspace settings</h2><label className="mt-4 grid max-w-sm gap-2 text-sm font-semibold">Workspace language<select value={language} onChange={async event => { const next = event.target.value as Language; setLanguage(next); await fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ language: next }) }) }} className="h-10 rounded-lg border border-[#dce9e1] bg-white px-3"><option value="en">English</option><option value="rw">Kinyarwanda</option><option value="fr">Français</option></select></label><p className="mt-5 max-w-2xl rounded-xl bg-[#f4f8f5] p-4 text-xs leading-5 text-[#678078]">Source files and imported records are private to this signed-in workspace. RRA passwords and keys are never requested. Retention and deletion requirements need legal review; see the data handling documentation.</p></section>}
      </main>
    </div>
  </div>
}

function Metric({ title, value, detail }: { title: string; value: string; detail: string }) {
  return <article className="rounded-xl border border-[#dce9e1] bg-white p-4"><p className="text-xs font-semibold text-[#678078]">{title}</p><p className="mt-2 text-2xl font-bold tracking-tight">{value}</p><p className="mt-1 text-[11px] text-[#789087]">{detail}</p></article>
}
