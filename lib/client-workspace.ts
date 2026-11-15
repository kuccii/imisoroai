import { and, desc, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { ensureDatabaseSchema } from '@/lib/db/bootstrap'
import { auditEvent, clientConsent, clientMembership, complianceTask, importedEvidence, profile, supplierMapping, workspaceClient } from '@/lib/db/schema'

export type ActiveClientContext = {
  id: string
  displayName: string
  tin: string
  ownerUserId: string
  role: string
  consentActive: boolean
  consentId: string | null
}

export async function ensurePersonalClient(user: { id: string; name?: string | null }) {
  await ensureDatabaseSchema()
  const clientId = `CL-PERSONAL-${user.id}`
  const [existingProfile] = await db.select().from(profile).where(eq(profile.userId, user.id)).limit(1)
  await db.insert(workspaceClient).values({
    id: clientId,
    ownerUserId: user.id,
    displayName: existingProfile?.businessName || user.name || 'My business',
    tin: existingProfile?.tin === 'PENDING' ? '' : existingProfile?.tin || '',
  }).onConflictDoNothing()
  await db.insert(clientMembership).values({ id: `MEM-${user.id}-${clientId}`, clientId, userId: user.id, role: 'owner' }).onConflictDoNothing({ target: [clientMembership.clientId, clientMembership.userId] })
  // Backfill only this user's existing personal data into their newly created personal client.
  await db.update(importedEvidence).set({ clientId }).where(and(eq(importedEvidence.userId, user.id), isNull(importedEvidence.clientId)))
  await db.update(supplierMapping).set({ clientId }).where(and(eq(supplierMapping.userId, user.id), eq(supplierMapping.clientId, '')))
  await db.update(auditEvent).set({ clientId }).where(and(eq(auditEvent.userId, user.id), isNull(auditEvent.clientId)))
  await db.update(complianceTask).set({ clientId }).where(and(eq(complianceTask.userId, user.id), isNull(complianceTask.clientId)))
  return clientId
}

export async function getClientContext(user: { id: string; name?: string | null }, requestedClientId?: string | null): Promise<ActiveClientContext | null> {
  await ensurePersonalClient(user)
  const conditions = [eq(clientMembership.userId, user.id)]
  if (requestedClientId) conditions.push(eq(clientMembership.clientId, requestedClientId))
  const memberships = await db.select({
    id: workspaceClient.id,
    displayName: workspaceClient.displayName,
    tin: workspaceClient.tin,
    ownerUserId: workspaceClient.ownerUserId,
    role: clientMembership.role,
  }).from(clientMembership).innerJoin(workspaceClient, eq(clientMembership.clientId, workspaceClient.id)).where(and(...conditions)).orderBy(desc(workspaceClient.createdAt)).limit(1)
  const membership = memberships[0]
  if (!membership) return null
  const [consent] = await db.select({ id: clientConsent.id, status: clientConsent.status }).from(clientConsent).where(eq(clientConsent.clientId, membership.id)).orderBy(desc(clientConsent.createdAt)).limit(1)
  return { ...membership, consentActive: consent?.status === 'active', consentId: consent?.id ?? null }
}
