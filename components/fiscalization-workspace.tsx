'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import type { Language } from '@/lib/i18n'
import { translate } from '@/lib/i18n'
import { formatRwf, kigaliToday } from '@/lib/rwanda-locale'

const fetcher = async (url: string) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Could not load fiscal records.')
  return response.json()
}

type FiscalConfig = {
  taxpayerTin?: string | null
  legalName?: string | null
  branchCode?: string | null
  deviceSerial?: string | null
  environment?: 'sandbox' | 'production'
  certificationStatus?: string
}

type FiscalSale = {
  id: string
  saleDate: string
  counterparty: string
  subtotalRwf: number
  declaredTaxRwf: number
  totalRwf: number
  status: string
}

export function FiscalizationWorkspace({ language }: { language: Language }) {
  const t = (text: string) => translate(language, text)
  const { data: configData, error: configError, mutate: mutateConfig } = useSWR<{ config: FiscalConfig | null }>('/api/fiscal/config', fetcher)
  const { data: salesData, error: salesError, mutate: mutateSales } = useSWR<{ sales: FiscalSale[]; submissions: unknown[]; submissionEnabled: boolean; submissionBlockers: string[] }>('/api/fiscal/sales', fetcher)
  const [config, setConfig] = useState({ taxpayerTin: '', legalName: '', branchCode: '', deviceSerial: '' })
  const [sale, setSale] = useState({ saleDate: kigaliToday(), counterparty: '', counterpartyTin: '' })
  const [items, setItems] = useState([{ description: '', quantity: '1', unitPriceRwf: '', netRwf: '', declaredTaxRwf: '0' }])
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const subtotalRwf = items.reduce((sum, item) => sum + Math.round((Number(item.quantity) || 0) * (Number(item.unitPriceRwf) || 0)), 0)
  const taxRwf = items.reduce((sum, item) => sum + (Number(item.declaredTaxRwf) || 0), 0)

  useEffect(() => {
    if (configData?.config) setConfig({
      taxpayerTin: configData.config.taxpayerTin || '',
      legalName: configData.config.legalName || '',
      branchCode: configData.config.branchCode || '',
      deviceSerial: configData.config.deviceSerial || '',
    })
  }, [configData])

  const saveConfig = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      const response = await fetch('/api/fiscal/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...config, environment: 'sandbox' }) })
      const result = await response.json()
      setMessage(response.ok ? t('Sandbox setup details saved. This does not connect or certify the business.') : result.error || t('Could not save setup.'))
      if (response.ok) await mutateConfig(result, false)
    } catch {
      setMessage(t('Could not save setup. Check your connection and try again.'))
    } finally {
      setSaving(false)
    }
  }

  const createDraft = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      const response = await fetch('/api/fiscal/sales', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...sale, items: items.map(item => ({ ...item, unitPriceRwf: Number(item.unitPriceRwf), netRwf: Math.round((Number(item.quantity) || 0) * (Number(item.unitPriceRwf) || 0)), declaredTaxRwf: Number(item.declaredTaxRwf) })) }) })
      const result = await response.json()
      setMessage(response.ok ? t('Draft saved. It has not been sent to RRA.') : result.error || t('Could not save draft.'))
      if (response.ok) {
        setSale(current => ({ ...current, counterparty: '', counterpartyTin: '' }))
        setItems([{ description: '', quantity: '1', unitPriceRwf: '', netRwf: '', declaredTaxRwf: '0' }])
        await mutateSales()
      }
    } catch {
      setMessage(t('Could not save draft. Check your connection and try again.'))
    } finally {
      setSaving(false)
    }
  }

  const field = (label: string, value: string, onChange: (value: string) => void, options: { type?: string; required?: boolean; min?: string; step?: string; readOnly?: boolean } = {}) => <label className="grid gap-1.5 text-xs font-semibold text-[#49685d]">{t(label)}<input type={options.type || 'text'} required={options.required} min={options.min} step={options.step} readOnly={options.readOnly} value={value} onChange={event => onChange(event.target.value)} className="h-10 rounded-xl border border-[#dce9e1] bg-white px-3 text-sm text-[#10251f] outline-none focus:border-[#0f8062] focus:ring-4 focus:ring-[#0f8062]/10 read-only:bg-[#f4f8f5]" /></label>

  return <section className="mt-10 space-y-6">
    <div className="rounded-[24px] bg-[#10251f] p-6 text-white md:p-8">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9ee5c7]">{t('RRA fiscalization · Sandbox setup')}</p>
      <div className="mt-3 flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div><h2 className="text-2xl font-bold tracking-[-0.04em] md:text-3xl">{t('Prepare sales for RRA fiscalization')}</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">{t('Configure taxpayer and registered device details, then keep sales drafts organized while the official RRA protocol and certification are pending.')}</p></div>
        <span className="shrink-0 rounded-full border border-[#f0ca79]/30 bg-[#f0ca79]/10 px-3 py-2 text-xs font-bold text-[#f0ca79]">{t('Sandbox · not connected')}</span>
      </div>
    </div>

    {(configError || salesError) && <div role="alert" className="rounded-xl border border-[#f2c7c0] bg-[#fff5f3] p-4 text-sm text-[#923f34]">{t('Could not load fiscalization workspace. Refresh and try again.')}</div>}
    {message && <div role="status" className="rounded-xl border border-[#dce9e1] bg-white p-4 text-sm text-[#31564a]">{message}</div>}

    <div className="grid gap-5 xl:grid-cols-2">
      <form onSubmit={saveConfig} className="rounded-[24px] border border-[#dce9e1] bg-white p-6">
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#0f8062]">{t('Business registration')}</p><h3 className="mt-2 text-lg font-bold">{t('Taxpayer and device details')}</h3>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {field('RRA TIN', config.taxpayerTin, value => setConfig(current => ({ ...current, taxpayerTin: value })))}
          {field('Registered legal name', config.legalName, value => setConfig(current => ({ ...current, legalName: value })))}
          {field('Registered branch code', config.branchCode, value => setConfig(current => ({ ...current, branchCode: value })))}
          {field('Registered device serial', config.deviceSerial, value => setConfig(current => ({ ...current, deviceSerial: value })))}
        </div>
        <p className="mt-4 rounded-xl bg-[#f4f8f5] p-3 text-xs leading-5 text-[#678078]">{t('No RRA keys or passwords are collected here. These details do not establish registration, certification, or a live connection.')}</p>
        <button disabled={saving} className="mt-4 h-11 rounded-xl bg-[#0f5c49] px-4 text-xs font-bold text-white disabled:opacity-60">{saving ? t('Saving…') : t('Save sandbox details')}</button>
      </form>

      <form onSubmit={createDraft} className="rounded-[24px] border border-[#dce9e1] bg-white p-6">
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#0f8062]">{t('Sales records')}</p><h3 className="mt-2 text-lg font-bold">{t('Create a fiscal sales draft')}</h3>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {field('Sale date', sale.saleDate, value => setSale(current => ({ ...current, saleDate: value })), { type: 'date', required: true })}
          {field('Customer or counterparty', sale.counterparty, value => setSale(current => ({ ...current, counterparty: value })), { required: true })}
          {field('Customer TIN (if applicable)', sale.counterpartyTin, value => setSale(current => ({ ...current, counterpartyTin: value })))}
        </div>
        <div className="mt-5 space-y-3">
          {items.map((item, index) => <fieldset key={index} className="rounded-xl border border-[#e5eee8] p-4"><legend className="px-1 text-xs font-bold">{t('Item')} {index + 1}</legend><div className="grid gap-3 sm:grid-cols-2">
            {field('Item description', item.description, value => setItems(current => current.map((line, i) => i === index ? { ...line, description: value } : line)), { required: true })}
            {field('Quantity', item.quantity, value => setItems(current => current.map((line, i) => i === index ? { ...line, quantity: value } : line)), { type: 'number', min: '0.0001', step: '0.0001', required: true })}
            {field('Unit price (RWF)', item.unitPriceRwf, value => setItems(current => current.map((line, i) => i === index ? { ...line, unitPriceRwf: value } : line)), { type: 'number', min: '0', step: '1', required: true })}
            {field('Line amount (RWF)', String(Math.round((Number(item.quantity) || 0) * (Number(item.unitPriceRwf) || 0))), () => undefined, { type: 'number', readOnly: true })}
            {field('Declared tax on line (RWF)', item.declaredTaxRwf, value => setItems(current => current.map((line, i) => i === index ? { ...line, declaredTaxRwf: value } : line)), { type: 'number', min: '0', step: '1', required: true })}
          </div>{items.length > 1 && <button type="button" onClick={() => setItems(current => current.filter((_, i) => i !== index))} className="mt-3 text-xs font-semibold text-[#923f34]">{t('Remove item')}</button>}</fieldset>)}
        </div>
        <button type="button" onClick={() => setItems(current => [...current, { description: '', quantity: '1', unitPriceRwf: '', netRwf: '', declaredTaxRwf: '0' }])} className="mt-3 rounded-lg border border-[#dce9e1] px-3 py-2 text-xs font-semibold text-[#31564a]">+ {t('Add item')}</button>
        <div className="mt-4 rounded-xl bg-[#f4f8f5] p-4"><p className="text-xs font-semibold text-[#49685d]">{t('Sale total')}</p><div className="mt-3 flex justify-between gap-3 text-sm"><span>{t('Subtotal')}</span><span>{formatRwf(subtotalRwf, language)}</span></div><div className="mt-2 flex justify-between gap-3 text-sm"><span>{t('Declared tax')}</span><span>{formatRwf(taxRwf, language)}</span></div><div className="mt-3 flex justify-between gap-3 border-t border-[#dce9e1] pt-3 text-sm font-bold"><span>{t('Total')}</span><span>{formatRwf(subtotalRwf + taxRwf, language)}</span></div></div>
        <p className="mt-3 text-xs leading-5 text-[#789087]">{t('Amounts and tax are entered by the user; the app does not infer rates or tax treatment.')}</p>
        <button disabled={saving} className="mt-4 h-11 rounded-xl border border-[#0f8062] px-4 text-xs font-bold text-[#0f8062] disabled:opacity-60">{saving ? t('Saving…') : t('Save draft only')}</button>
      </form>
    </div>

    <div className="rounded-[24px] border border-[#dce9e1] bg-white p-6">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.15em] text-[#0f8062]">{t('Fiscalization queue')}</p><h3 className="mt-2 text-lg font-bold">{t('Drafts and RRA responses')}</h3></div><span className="rounded-full bg-[#fff9ec] px-3 py-1.5 text-[10px] font-bold text-[#735725]">{t('Transmission disabled pending RRA specification and certification')}</span></div>
      {!salesData ? <p className="mt-5 text-sm text-[#789087]">{t('Loading fiscal records…')}</p> : salesData.sales.length === 0 ? <p className="mt-5 rounded-xl bg-[#f7fbf8] p-4 text-sm text-[#789087]">{t('No fiscal sales drafts yet.')}</p> : <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-xs"><thead className="border-b border-[#e5eee8] text-[#789087]"><tr>{['Date', 'Customer', 'Subtotal', 'Declared tax', 'Total', 'Status'].map(header => <th key={header} className="px-3 py-3 font-semibold">{t(header)}</th>)}</tr></thead><tbody>{salesData.sales.map(item => <tr key={item.id} className="border-b border-[#eef3ef]"><td className="px-3 py-3">{item.saleDate}</td><td className="px-3 py-3 font-semibold">{item.counterparty}</td><td className="px-3 py-3">{formatRwf(item.subtotalRwf, language)}</td><td className="px-3 py-3">{formatRwf(item.declaredTaxRwf, language)}</td><td className="px-3 py-3 font-bold">{formatRwf(item.totalRwf, language)}</td><td className="px-3 py-3"><span className="rounded-full bg-[#f4f8f5] px-2.5 py-1">{t(item.status)}</span></td></tr>)}</tbody></table></div>}
      <div role="note" className="mt-5 rounded-xl border border-[#ead9b8] bg-[#fff9ec] p-4 text-xs leading-5 text-[#735725]"><p>{t('Submitting sales to RRA remains unavailable until the current official protocol, test credentials, and certification path are verified. No transaction is transmitted from this screen.')}</p>{salesData?.submissionBlockers?.length ? <ul className="mt-3 list-disc pl-5">{salesData.submissionBlockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul> : null}</div>
    </div>
  </section>
}
