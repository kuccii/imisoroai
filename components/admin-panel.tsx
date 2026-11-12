'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { signOut } from '@/lib/auth-client'
import { formatRwf, formatRwandaDate } from '@/lib/rwanda-locale'
import { AlertTriangle, ArrowUpRight, Check, FileText, LayoutDashboard, Settings2, ShieldCheck, Users } from 'lucide-react'

type Tab = 'Overview' | 'Users' | 'Invoices' | 'OCR & AI'

const tabs: { label: Tab; icon: typeof LayoutDashboard }[] = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Users', icon: Users },
  { label: 'Invoices', icon: FileText },
  { label: 'OCR & AI', icon: Settings2 },
]

const fetchJson = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Request failed.')
  return data
}

type Overview = {
  stats: { users: number; invoices: number; pendingReview: number; extractionIssues: number; documents: number }
  ocr: { model: string; enabled: boolean }
  activity: { id: string; action: string; entityType: string; entityId: string | null; createdAt: string; email: string | null }[]
}

type AdminUser = { id: string; name: string; email: string; role: string; createdAt: string; invoices: number }
type AdminInvoice = {
  id: string
  supplier: string
  invoiceNumber: string
  invoiceDate: string
  amount: number
  vat: number
  currency: string
  status: string
  extractionStatus: string
  originalFilename: string | null
  createdAt: string
  ownerEmail: string | null
}

type SettingsData = {
  ocr: { model: string; enabled: boolean }
  models: { id: string; label: string; note: string }[]
  defaults: { model: string; enabled: boolean }
}

const statusStyle = (status: string) =>
  status === 'supported' ? 'bg-[#dff3e9] text-[#0f8062]' : status === 'unsupported' ? 'bg-[#fee8e5] text-[#b54739]' : 'bg-[#fff3dc] text-[#a56b16]'

const extractionLabel = (status: string) =>
  status === 'extracted' ? 'Extracted' : status === 'reviewed_manual' ? 'Manual review' : status === 'processing' ? 'Processing' : status === 'admin_disabled' ? 'Disabled by admin' : status.replaceAll('_', ' ')

export default function AdminPanel({ email }: { email: string }) {
  const [active, setActive] = useState<Tab>('Overview')
  const [notice, setNotice] = useState('')
  const notify = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 4000)
  }

  return (
    <div className="min-h-screen bg-[#f4f7f3] text-[#10251f]">
      <header className="border-b border-[#dce9e1] bg-[#f9fcfa]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-5 py-4 md:px-8">
          <a href="/" className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-[14px] bg-[#10251f] text-[#9ee5c7]"><ShieldCheck className="size-5" /></span>
            <span>
              <strong className="block text-sm tracking-tight">Imisoro <span className="text-[#0f8062]">AI</span></strong>
              <small className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#789087]">Superadmin console</small>
            </span>
          </a>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="hidden rounded-full border border-[#dce9e1] bg-white px-3 py-1.5 text-[11px] font-bold text-[#587069] sm:inline-flex">{email}</span>
            <a href="/dashboard" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#c8ddd2] bg-white px-3 text-xs font-bold text-[#31564a] transition hover:bg-[#f2f8f4]">
              Workspace <ArrowUpRight className="size-3.5" />
            </a>
            <button
              type="button"
              onClick={async () => {
                await signOut().catch(() => undefined)
                window.location.href = '/login'
              }}
              className="h-9 rounded-xl bg-[#10251f] px-3 text-xs font-bold text-white transition hover:bg-[#1b3a31]"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 md:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0f8062]">Platform control</p>
            <h1 className="mt-2 text-2xl font-bold tracking-[-0.04em] md:text-3xl">Everything, in one place.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#789087]">Review every workspace, manage superadmin access, and choose the OCR model used for invoice extraction.</p>
          </div>
          {notice && <div role="status" className="flex items-center gap-2 rounded-xl border border-[#b9e3cd] bg-[#e9f8ef] px-3.5 py-2.5 text-xs font-bold text-[#0f8062]"><Check className="size-4" />{notice}</div>}
        </div>

        <nav className="mt-7 flex flex-wrap gap-1 rounded-2xl border border-[#dce9e1] bg-white p-1.5">
          {tabs.map(({ label, icon: Icon }) => (
            <button
              key={label}
              type="button"
              onClick={() => setActive(label)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${active === label ? 'bg-[#dff3e9] text-[#0f8062]' : 'text-[#678078] hover:bg-[#f4f9f6] hover:text-[#10251f]'}`}
            >
              <Icon className="size-4" />{label}
            </button>
          ))}
        </nav>

        <div className="mt-7">
          {active === 'Overview' && <OverviewTab />}
          {active === 'Users' && <UsersTab notify={notify} />}
          {active === 'Invoices' && <InvoicesTab />}
          {active === 'OCR & AI' && <OcrTab notify={notify} />}
        </div>
      </div>
    </div>
  )
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[24px] border border-[#dce9e1] bg-white p-6 md:p-7">
      <h2 className="text-base font-bold">{title}</h2>
      {subtitle && <p className="mt-1 text-xs leading-5 text-[#789087]">{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </section>
  )
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return <p role="alert" className="flex items-center gap-2 rounded-xl border border-[#e4c7c2] bg-[#fff4f2] p-3.5 text-sm text-[#9b3d32]"><AlertTriangle className="size-4 shrink-0" />{children}</p>
}

function Loading({ label }: { label: string }) {
  return <p className="p-2 text-sm text-[#789087]">{label}</p>
}

function Stat({ label, value, note }: { label: string; value: number | string; note: string }) {
  return (
    <div className="rounded-2xl border border-[#dce9e1] bg-white p-5">
      <p className="text-xs font-bold text-[#789087]">{label}</p>
      <p className="mt-4 text-2xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 text-[11px] text-[#789087]">{note}</p>
    </div>
  )
}

function OverviewTab() {
  const { data, error, isLoading } = useSWR<Overview>('/api/admin/overview', fetchJson)
  if (error) return <ErrorBox>Could not load the platform overview.</ErrorBox>
  if (isLoading || !data) return <Loading label="Loading platform overview…" />

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Workspaces" value={data.stats.users} note="Registered accounts" />
        <Stat label="Invoices" value={data.stats.invoices} note="All workspace records" />
        <Stat label="Needs review" value={data.stats.pendingReview} note="Awaiting human review" />
        <Stat label="Extraction issues" value={data.stats.extractionIssues} note="Manual entry or failed scans" />
        <Stat label="Stored documents" value={data.stats.documents} note="Private source files" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <Panel title="OCR model in use" subtitle="This model runs every new invoice scan.">
          <div className="rounded-2xl bg-[#10251f] p-5 text-white">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#9ee5c7]">Active model</p>
            <p className="mt-2 break-all font-mono text-sm">{data.ocr.model}</p>
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-bold text-white/80">
              <span className={`size-1.5 rounded-full ${data.ocr.enabled ? 'bg-[#9ee5c7]' : 'bg-[#f0b76a]'}`} />
              {data.ocr.enabled ? 'Automatic extraction enabled' : 'Automatic extraction disabled'}
            </p>
          </div>
          <p className="mt-4 text-xs leading-5 text-[#789087]">Change the model under the OCR &amp; AI tab. Extraction always stays advisory and reviewable.</p>
        </Panel>

        <Panel title="Recent activity" subtitle="Latest audit events across every workspace.">
          <div className="max-h-[360px] divide-y divide-[#edf3ee] overflow-y-auto">
            {data.activity.length === 0 && <p className="text-sm text-[#789087]">No audit events yet.</p>}
            {data.activity.map((event) => (
              <div key={event.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold">{event.action.replaceAll('_', ' ')}</p>
                  <p className="mt-1 truncate text-[11px] text-[#789087]">{event.email || 'Unknown user'} · {event.entityType}</p>
                </div>
                <span className="shrink-0 text-[10px] font-medium text-[#91a69d]">{formatRwandaDate(event.createdAt)}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}

function UsersTab({ notify }: { notify: (message: string) => void }) {
  const { data, error, isLoading, mutate } = useSWR<{ users: AdminUser[]; selfEmail: string; protectedEmails: string[] }>('/api/admin/users', fetchJson)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  const saveRole = async (user: AdminUser) => {
    const role = drafts[user.id] ?? user.role
    if (role === user.role) return
    setSavingId(user.id)
    setActionError('')
    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, role }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        setActionError(result.error || 'Could not update that account.')
        return
      }
      await mutate()
      notify(`${user.email} is now ${role === 'superadmin' ? 'a superadmin' : 'a standard user'}.`)
    } catch {
      setActionError('Could not update that account. Check your connection and try again.')
    } finally {
      setSavingId(null)
    }
  }

  if (error) return <ErrorBox>Could not load user accounts.</ErrorBox>
  if (isLoading || !data) return <Loading label="Loading user accounts…" />

  return (
    <Panel title="User accounts" subtitle="Promote trusted operators to superadmin, or return them to a standard workspace.">
      {actionError && <div className="mb-4"><ErrorBox>{actionError}</ErrorBox></div>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-[#e7f0ea] text-[10px] font-bold uppercase tracking-[0.12em] text-[#91a69d]">
              <th className="py-3 pr-4">Account</th>
              <th className="py-3 pr-4">Joined</th>
              <th className="py-3 pr-4">Invoices</th>
              <th className="py-3 pr-4">Role</th>
              <th className="py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf3ee]">
            {data.users.map((user) => {
              const pinned = data.protectedEmails.includes(user.email.toLowerCase())
              const isSelf = user.email.toLowerCase() === data.selfEmail
              const draft = drafts[user.id] ?? user.role
              return (
                <tr key={user.id} className="align-middle">
                  <td className="py-3.5 pr-4">
                    <p className="text-xs font-bold">{user.name || 'Unnamed account'}</p>
                    <p className="mt-0.5 text-[11px] text-[#789087]">{user.email}{isSelf ? ' · you' : ''}</p>
                  </td>
                  <td className="py-3.5 pr-4 text-[11px] text-[#678078]">{formatRwandaDate(user.createdAt)}</td>
                  <td className="py-3.5 pr-4 text-xs font-semibold">{user.invoices}</td>
                  <td className="py-3.5 pr-4">
                    <select
                      aria-label={`Role for ${user.email}`}
                      value={draft}
                      disabled={isSelf || pinned || savingId === user.id}
                      onChange={(event) => setDrafts((current) => ({ ...current, [user.id]: event.target.value }))}
                      className="h-9 rounded-lg border border-[#c8ddd2] bg-white px-2 text-xs font-semibold outline-none focus:border-[#0f8062] disabled:bg-[#f4f7f3] disabled:text-[#91a69d]"
                    >
                      <option value="user">Standard user</option>
                      <option value="superadmin">Superadmin</option>
                    </select>
                    {pinned && <p className="mt-1 text-[10px] text-[#91a69d]">Pinned by SUPERADMIN_EMAILS</p>}
                  </td>
                  <td className="py-3.5 text-right">
                    <button
                      type="button"
                      disabled={isSelf || pinned || savingId === user.id || draft === user.role}
                      onClick={() => saveRole(user)}
                      className="rounded-lg bg-[#0f5c49] px-3 py-2 text-[11px] font-bold text-white transition disabled:opacity-40"
                    >
                      {savingId === user.id ? 'Saving…' : 'Save'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-[11px] leading-5 text-[#789087]">You cannot change your own role. Accounts listed in the SUPERADMIN_EMAILS environment variable always return to superadmin on sign-in.</p>
    </Panel>
  )
}

function InvoicesTab() {
  const { data, error, isLoading } = useSWR<{ invoices: AdminInvoice[] }>('/api/admin/invoices', fetchJson)
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const rows = data?.invoices ?? []
    const value = query.trim().toLowerCase()
    if (!value) return rows
    return rows.filter((invoice) => `${invoice.supplier} ${invoice.invoiceNumber} ${invoice.ownerEmail ?? ''} ${invoice.id}`.toLowerCase().includes(value))
  }, [data, query])

  if (error) return <ErrorBox>Could not load invoice records.</ErrorBox>
  if (isLoading || !data) return <Loading label="Loading invoice records…" />

  return (
    <Panel title="All invoice records" subtitle="Newest 200 records across every workspace. Read-only.">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Filter by supplier, invoice, owner, or record id"
        className="mb-4 h-10 w-full max-w-md rounded-xl border border-[#dce9e1] px-3 text-xs outline-none focus:border-[#0f8062]"
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead>
            <tr className="border-b border-[#e7f0ea] text-[10px] font-bold uppercase tracking-[0.12em] text-[#91a69d]">
              <th className="py-3 pr-4">Supplier</th>
              <th className="py-3 pr-4">Owner</th>
              <th className="py-3 pr-4">Date</th>
              <th className="py-3 pr-4">Amount</th>
              <th className="py-3 pr-4">Review</th>
              <th className="py-3">Extraction</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf3ee]">
            {filtered.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-xs text-[#789087]">No matching invoice records.</td></tr>}
            {filtered.map((invoice) => (
              <tr key={invoice.id}>
                <td className="py-3.5 pr-4">
                  <p className="text-xs font-bold">{invoice.supplier}</p>
                  <p className="mt-0.5 text-[11px] text-[#789087]">{invoice.invoiceNumber && invoice.invoiceNumber !== 'UNKNOWN' ? invoice.invoiceNumber : invoice.id}</p>
                </td>
                <td className="py-3.5 pr-4 text-[11px] text-[#678078]">{invoice.ownerEmail || 'Unknown'}</td>
                <td className="py-3.5 pr-4 text-[11px] text-[#678078]">{invoice.invoiceDate === 'UNKNOWN' ? 'Unknown' : formatRwandaDate(invoice.invoiceDate)}</td>
                <td className="py-3.5 pr-4 text-xs font-semibold">{invoice.amount > 0 ? formatRwf(invoice.amount) : '—'}</td>
                <td className="py-3.5 pr-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${statusStyle(invoice.status)}`}>{invoice.status === 'pending' ? 'Needs review' : invoice.status === 'supported' ? 'Reviewed' : 'Excluded'}</span></td>
                <td className="py-3.5 text-[11px] capitalize text-[#678078]">{extractionLabel(invoice.extractionStatus)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function OcrTab({ notify }: { notify: (message: string) => void }) {
  const { data, error, isLoading, mutate } = useSWR<SettingsData>('/api/admin/settings', fetchJson)
  const [model, setModel] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [hydrated, setHydrated] = useState(false)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    if (!data || hydrated) return
    setModel(data.ocr.model)
    setEnabled(data.ocr.enabled)
    setHydrated(true)
  }, [data, hydrated])

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setActionError('')
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: model.trim(), enabled }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        setActionError(result.error || 'Could not save the OCR settings.')
        return
      }
      await mutate()
      notify('OCR settings saved. New invoice scans use this configuration.')
    } catch {
      setActionError('Could not save the OCR settings. Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  if (error) return <ErrorBox>{error.message || 'Could not load OCR settings.'}</ErrorBox>
  if (isLoading || !data) return <Loading label="Loading OCR settings…" />

  const dirty = model.trim() !== data.ocr.model || enabled !== data.ocr.enabled

  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
      <Panel title="Invoice extraction model" subtitle="Choose which AI Gateway model reads uploaded invoices. New scans pick this up immediately.">
        <form onSubmit={save} className="space-y-5">
          <label className="grid gap-2 text-xs font-bold">
            Gateway model id
            <input
              list="ocr-model-options"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              required
              minLength={3}
              maxLength={120}
              placeholder="provider/model-name"
              className="h-11 rounded-xl border border-[#c8ddd2] px-3 font-mono text-sm font-normal outline-none focus:border-[#0f8062]"
            />
            <datalist id="ocr-model-options">
              {data.models.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </datalist>
            <span className="text-[11px] font-normal leading-5 text-[#789087]">Use the <code className="rounded bg-[#eef5f0] px-1 py-0.5">provider/model</code> format accepted by Vercel AI Gateway. Pick a suggestion or type any model id.</span>
          </label>

          <label className="flex items-start justify-between gap-4 rounded-2xl border border-[#dce9e1] bg-[#f9fcfa] p-4">
            <span>
              <span className="block text-xs font-bold">Automatic extraction</span>
              <span className="mt-1 block text-[11px] font-normal leading-5 text-[#789087]">When off, uploads are still saved and queued for manual entry with a clear note.</span>
            </span>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
              className="mt-0.5 size-5 shrink-0 accent-[#0f5c49]"
            />
          </label>

          {actionError && <ErrorBox>{actionError}</ErrorBox>}

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={saving || !dirty} className="rounded-xl bg-[#0f5c49] px-4 py-2.5 text-xs font-bold text-white transition disabled:opacity-40">
              {saving ? 'Saving…' : 'Save OCR settings'}
            </button>
            <button
              type="button"
              onClick={() => { setModel(data.defaults.model); setEnabled(data.defaults.enabled) }}
              disabled={saving}
              className="rounded-xl border border-[#c8ddd2] bg-white px-4 py-2.5 text-xs font-bold text-[#31564a] disabled:opacity-40"
            >
              Reset to default
            </button>
            {dirty && <span className="text-[11px] font-semibold text-[#a56b16]">Unsaved changes</span>}
          </div>
        </form>
      </Panel>

      <Panel title="Model notes" subtitle={`Currently saved: ${data.ocr.model}`}>
        <ul className="space-y-3">
          {data.models.map((option) => (
            <li key={option.id} className="rounded-2xl border border-[#e7f0ea] p-4">
              <p className="font-mono text-[11px] font-bold text-[#0f5c49]">{option.id}</p>
              <p className="mt-1 text-xs font-bold">{option.label}</p>
              <p className="mt-1 text-[11px] leading-5 text-[#789087]">{option.note}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 rounded-2xl bg-[#fff9ec] p-4 text-[11px] leading-5 text-[#735725]">
          Vision-capable models are required for PDFs and images. If the gateway rejects the selected model, uploads still save and the scan falls back to manual review.
        </p>
      </Panel>
    </div>
  )
}
