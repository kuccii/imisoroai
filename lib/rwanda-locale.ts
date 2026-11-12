import type { Language } from '@/lib/i18n'

const localeByLanguage: Record<Language, string> = {
  en: 'en-RW',
  rw: 'rw-RW',
  fr: 'fr-RW',
}

export function kigaliToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Kigali',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(value => value.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function kigaliPeriod() {
  return kigaliToday().slice(0, 7)
}

export function formatRwf(value: number, language: Language = 'en') {
  return new Intl.NumberFormat(localeByLanguage[language], {
    style: 'currency',
    currency: 'RWF',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatRwandaDate(value: string, language: Language = 'en') {
  const date = new Date(`${value.slice(0, 10)}T12:00:00+02:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(localeByLanguage[language], {
    timeZone: 'Africa/Kigali',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}
