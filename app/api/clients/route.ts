import { auth } from '@/lib/auth'
import { ensureDatabaseSchema } from '@/lib/db/bootstrap'
import { db } from '@/lib/db'
import { auditEvent, clientConsent, clientMembership, user as userTable, workspaceClient } from '@/lib/db/schema'
import { ensurePersonalClient, getClientContext } from '@/lib/client-workspace'
import { and, desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

async function getUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user ?? null
}

const mutationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create_client'), displayName: z.string().trim().min(2).max(160), tin: z.string().trim().max(32).default(''), consentConfirmed: z.literal(true) }),
  z.object({ action: z.literal('record_consent'), clientId: z.string().min(1), consentConfirmed: z.literal(true) }),
  z.object({ action: z.literal('revoke_consent'), clientId: z.string().min(1), reason: z.string().trim().min(8).max(300) }),
  z.object({ action: z.literal('invite_accountant'), clientId: z.string().min(1), email: z.email().trim().toLowerCase() }),
])

export async function GET(request: Request) {
  const actor = await getUser()
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureDatabaseSchema()
  const personalClientId = await ensurePersonalClient(actor)
  const requested = new URL(request.url).searchParams.get('clientId')
  const active = await getClientContext(actor, requested || personalClientId)
  const rows = await db.select({ id: workspaceClient.id, displayName: workspaceClient.displayName, tin: workspaceClient.tin, ownerUserId: workspaceClient.ownerUserId, role: clientMembership.role }).from(clientMembership).innerJoin(workspaceClient, eq(clientMembership.clientId, workspaceClient.id)).where(eq(clientMembership.userId, actor.id)).orderBy(desc(workspaceClient.createdAt))
  const clients = await Promise.all(rows.map(async row => {
    const [latest] = await db.select({ status: clientConsent.status, createdAt: clientConsent.createdAt }).from(clientConsent).where(eq(clientConsent.clientId, row.id)).orderBy(desc(clientConsent.createdAt)).limit(1)
    return { ...row, consentActive: latest?.status === 'active', consentRecordedAt: latest?.createdAt ?? null }
  }))
  return NextResponse.json({ clients, activeClientId: active?.id ?? null, activeClient: active })
}

export async function POST(request: Request) {
  const actor = await getUser()
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureDatabaseSchema()
  const parsed = mutationSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'The client or consent details are invalid.' }, { status: 400 })
  const value = parsed.data
  let clientId: string
  if (value.action === 'create_client') {
    clientId = `CL-${crypto.randomUUID()}`
    await db.transaction(async tx => {
      await tx.insert(workspaceClient).values({ id: clientId, ownerUserId: actor.id, displayName: value.displayName, tin: value.tin })
      await tx.insert(clientMembership).values({ id: `MEM-${crypto.randomUUID()}`, clientId, userId: actor.id, role: 'owner' })
      await tx.insert(clientConsent).values({ id: `CONS-${crypto.randomUUID()}`, clientId, recordedByUserId: actor.id, consentText: 'The workspace owner confirmed they are authorized to provide and process this client’s tax-evidence records.', status: 'active' })
      await tx.insert(auditEvent).values({ id: `AUD-${crypto.randomUUID()}`, userId: actor.id, clientId, action: 'client_created_with_consent', entityType: 'workspace_client', entityId: clientId })
    })
    return NextResponse.json({ clientId }, { status: 201 })
  }

  const context = await getClientContext(actor, value.clientId)
  if (!context) return NextResponse.json({ error: 'Client not found or access not granted.' }, { status: 404 })
  if (context.role !== 'owner') return NextResponse.json({ error: 'Only the client owner can change consent or access.' }, { status: 403 })
  clientId = context.id

  if (value.action === 'record_consent') {
    await db.insert(clientConsent).values({ id: `CONS-${crypto.randomUUID()}`, clientId, recordedByUserId: actor.id, consentText: 'The workspace owner confirmed they are authorized to provide and process this client’s tax-evidence records.', status: 'active' })
    await db.insert(auditEvent).values({ id: `AUD-${crypto.randomUUID()}`, userId: actor.id, clientId, action: 'client_consent_recorded', entityType: 'client_consent', entityId: clientId })
  } else if (value.action === 'revoke_consent') {
    await db.insert(clientConsent).values({ id: `CONS-${crypto.randomUUID()}`, clientId, recordedByUserId: actor.id, consentText: value.reason, status: 'revoked' })
    await db.insert(auditEvent).values({ id: `AUD-${crypto.randomUUID()}`, userId: actor.id, clientId, action: 'client_consent_revoked', entityType: 'client_consent', entityId: clientId })
  } else {
    if (!context.consentActive) return NextResponse.json({ error: 'Record current client consent before inviting an accountant.' }, { status: 409 })
    const [invitee] = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, value.email)).limit(1)
    if (!invitee) return NextResponse.json({ error: 'That account was not found. The client must create an account before access is granted.' }, { status: 404 })
    await db.insert(clientMembership).values({ id: `MEM-${crypto.randomUUID()}`, clientId, userId: invitee.id, role: 'accountant' }).onConflictDoNothing()
    await db.insert(auditEvent).values({ id: `AUD-${crypto.randomUUID()}`, userId: actor.id, clientId, action: 'accountant_access_granted', entityType: 'client_membership', entityId: invitee.id, metadata: JSON.stringify({ email: value.email, role: 'accountant' }) })
  }
  return NextResponse.json({ ok: true, clientId })
}
