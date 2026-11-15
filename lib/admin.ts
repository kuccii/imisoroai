import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { ensureDatabaseSchema } from '@/lib/db/bootstrap'
import { appSetting, user } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { defaultOcrModel } from '@/lib/invoice-ocr'

export type AdminAccess =
  | { ok: true; email: string; role: string; userId: string; name: string }
  | { ok: false; reason: 'unauthenticated' | 'forbidden' }

export type OcrSettings = {
  model: string
  enabled: boolean
}

function defaultOcrSettings(): OcrSettings {
  return { model: defaultOcrModel(), enabled: true }
}

export const DEFAULT_OCR_SETTINGS: OcrSettings = defaultOcrSettings()

// Gateway model ids the app ships with. Administrators can enter any other
// `provider/model` id, since new gateway models appear regularly.
export const KNOWN_OCR_MODELS = [
  { id: 'openai/gpt-5.4-mini', label: 'GPT-5.4 mini (Vercel AI Gateway)', note: 'Default image-capable model; requires AI Gateway credits.' },
  { id: 'google/gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite (Vercel AI Gateway)', note: 'Fast image-capable alternative; requires AI Gateway credits.' },
  { id: 'google/gemini-3.5-flash', label: 'Gemini 3.5 Flash (Vercel AI Gateway)', note: 'Image-capable alternative; requires AI Gateway credits.' },
  { id: 'openai/gpt-5-mini', label: 'GPT-5 mini (Vercel AI Gateway)', note: 'Image-capable alternative; requires AI Gateway credits.' },
  { id: 'openai/gpt-4.1-mini', label: 'GPT-4.1 mini (Vercel AI Gateway)', note: 'Image-capable alternative; requires AI Gateway credits.' },
]

const OCR_SETTING_KEY = 'ocr'
const MODEL_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._:-]*$/

export function superadminEmails() {
  return (process.env.SUPERADMIN_EMAILS ?? '')
    .split(/[,;\s]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
}

export function isValidOcrModel(value: string) {
  return value.length > 2 && value.length <= 120 && MODEL_PATTERN.test(value)
}

function parseOcrSettings(value: string | null | undefined): OcrSettings {
  const fallback = defaultOcrSettings()
  if (!value) return fallback
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object') return fallback
    const record = parsed as { model?: unknown; enabled?: unknown }
    const model = typeof record.model === 'string' && isValidOcrModel(record.model) ? record.model : fallback.model
    return { model, enabled: typeof record.enabled === 'boolean' ? record.enabled : fallback.enabled }
  } catch {
    return fallback
  }
}

export async function getOcrSettings(): Promise<OcrSettings> {
  try {
    await ensureDatabaseSchema()
    const [row] = await db.select().from(appSetting).where(eq(appSetting.key, OCR_SETTING_KEY)).limit(1)
    return parseOcrSettings(row?.value)
  } catch (error) {
    // Never block invoice uploads because the settings table is unavailable.
    console.error('[admin] failed to load OCR settings, using defaults', error)
    return defaultOcrSettings()
  }
}

export async function saveOcrSettings(input: OcrSettings, updatedBy: string) {
  await ensureDatabaseSchema()
  const value = JSON.stringify({ model: input.model, enabled: input.enabled })
  const [saved] = await db
    .insert(appSetting)
    .values({ key: OCR_SETTING_KEY, value, updatedBy, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSetting.key,
      set: { value, updatedBy, updatedAt: new Date() },
    })
    .returning()
  return parseOcrSettings(saved?.value)
}

export async function getAdminAccess(): Promise<AdminAccess> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return { ok: false, reason: 'unauthenticated' }

  const email = (session.user.email ?? '').toLowerCase()
  const allowlisted = superadminEmails().includes(email)
  let role = 'user'

  try {
    await ensureDatabaseSchema()
    const [row] = await db.select({ role: user.role }).from(user).where(eq(user.id, session.user.id)).limit(1)
    role = row?.role ?? 'user'

    // Allowlisted emails are promoted automatically the first time they sign in.
    if (allowlisted && role !== 'superadmin') {
      await db.update(user).set({ role: 'superadmin', updatedAt: new Date() }).where(eq(user.id, session.user.id))
      role = 'superadmin'
    }
  } catch (error) {
    console.error('[admin] failed to resolve superadmin role', error)
    if (!allowlisted) return { ok: false, reason: 'forbidden' }
    role = 'superadmin'
  }

  if (role !== 'superadmin') return { ok: false, reason: 'forbidden' }

  return {
    ok: true,
    email,
    role,
    userId: session.user.id,
    name: session.user.name ?? email,
  }
}
