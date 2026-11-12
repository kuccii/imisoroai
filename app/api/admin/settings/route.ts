import { DEFAULT_OCR_SETTINGS, getAdminAccess, getOcrSettings, isValidOcrModel, KNOWN_OCR_MODELS, saveOcrSettings } from '@/lib/admin'
import { db } from '@/lib/db'
import { auditEvent } from '@/lib/db/schema'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const settingsSchema = z.object({
  model: z.string().trim().min(3).max(120).refine(isValidOcrModel, 'Use a gateway model id such as provider/model-name.'),
  enabled: z.boolean(),
})

export async function GET() {
  const access = await getAdminAccess()
  if (!access.ok) {
    return NextResponse.json(
      { error: access.reason === 'unauthenticated' ? 'Unauthorized' : 'Forbidden' },
      { status: access.reason === 'unauthenticated' ? 401 : 403 },
    )
  }

  const ocr = await getOcrSettings()
  return NextResponse.json({ ocr, models: KNOWN_OCR_MODELS, defaults: DEFAULT_OCR_SETTINGS })
}

export async function PUT(request: Request) {
  const access = await getAdminAccess()
  if (!access.ok) {
    return NextResponse.json(
      { error: access.reason === 'unauthenticated' ? 'Unauthorized' : 'Forbidden' },
      { status: access.reason === 'unauthenticated' ? 401 : 403 },
    )
  }

  const parsed = settingsSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Choose a valid OCR model.' }, { status: 400 })
  }

  try {
    const ocr = await saveOcrSettings(parsed.data, access.userId)
    await db.insert(auditEvent).values({
      id: `AUD-${crypto.randomUUID()}`,
      userId: access.userId,
      action: 'admin_ocr_settings_updated',
      entityType: 'setting',
      entityId: 'ocr',
      metadata: JSON.stringify({ model: ocr.model, enabled: ocr.enabled }),
    })
    return NextResponse.json({ ocr })
  } catch (error) {
    console.error('[admin] settings update failed', error)
    return NextResponse.json({ error: 'Could not save the OCR settings.' }, { status: 500 })
  }
}
