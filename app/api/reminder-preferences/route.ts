import { auth } from '@/lib/auth'
import { getClientContext } from '@/lib/client-workspace'
import { ensureDatabaseSchema } from '@/lib/db/bootstrap'
import { db } from '@/lib/db'
import { auditEvent, reminderPreference } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const channels = ['email', 'whatsapp', 'sms'] as const
async function actor() {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user ?? null
}

export async function GET(request: Request) {
  const user = await actor()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureDatabaseSchema()
  const client = await getClientContext(user, new URL(request.url).searchParams.get('clientId'))
  if (!client) return NextResponse.json({ error: 'Client not found or access not granted.' }, { status: 404 })
  const preferences = await db.select().from(reminderPreference).where(and(eq(reminderPreference.clientId, client.id), eq(reminderPreference.userId, user.id)))
  return NextResponse.json({ preferences: channels.map(channel => preferences.find(preference => preference.channel === channel) ?? { channel, optIn: false, destination: '' }), adaptersConfigured: [] })
}

export async function PUT(request: Request) {
  const user = await actor()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureDatabaseSchema()
  const parsed = z.object({ clientId: z.string().min(1), channel: z.enum(channels), optIn: z.boolean(), destination: z.string().trim().max(254).optional().default('') }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Check the reminder preference.' }, { status: 400 })
  const client = await getClientContext(user, parsed.data.clientId)
  if (!client) return NextResponse.json({ error: 'Client not found or access not granted.' }, { status: 404 })
  if (!client.consentActive) return NextResponse.json({ error: 'Client consent is not active.' }, { status: 409 })
  const destination = parsed.data.destination.trim()
  if (parsed.data.optIn && !destination) return NextResponse.json({ error: 'Enter a destination before opting in.' }, { status: 400 })
  if (parsed.data.optIn && parsed.data.channel === 'email' && !z.email().safeParse(destination).success) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  if (parsed.data.optIn && ['whatsapp', 'sms'].includes(parsed.data.channel) && !/^\+?[0-9 ()-]{7,24}$/.test(destination)) return NextResponse.json({ error: 'Enter a valid phone number.' }, { status: 400 })
  const values = { optIn: parsed.data.optIn, destination: destination || null, updatedAt: new Date() }
  await db.insert(reminderPreference).values({ id: `RMP-${crypto.randomUUID()}`, clientId: client.id, userId: user.id, channel: parsed.data.channel, ...values }).onConflictDoUpdate({ target: [reminderPreference.clientId, reminderPreference.userId, reminderPreference.channel], set: values })
  await db.insert(auditEvent).values({ id: `AUD-${crypto.randomUUID()}`, userId: user.id, clientId: client.id, action: parsed.data.optIn ? 'reminder_channel_opted_in' : 'reminder_channel_opted_out', entityType: 'reminder_preference', entityId: parsed.data.channel, metadata: JSON.stringify({ channel: parsed.data.channel }) })
  return NextResponse.json({ ok: true, channel: parsed.data.channel, optIn: parsed.data.optIn, deliveryAvailable: false })
}
