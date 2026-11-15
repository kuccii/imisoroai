export type ReminderChannel = 'email' | 'whatsapp' | 'sms'

export type ReminderPayload = {
  recipient: string
  subject?: string
  body: string
  clientId: string
}

export type ReminderAdapterResult = { accepted: boolean; providerReference?: string }

export interface ReminderAdapter {
  readonly channel: ReminderChannel
  send(payload: ReminderPayload): Promise<ReminderAdapterResult>
}

export type ReminderDeliveryState = 'opted_out' | 'provider_unconfigured' | 'sent'

/** Returns a non-sending state unless both consent and channel opt-in are explicit and an adapter is supplied. */
export async function deliverReminder({
  clientConsentActive,
  optedIn,
  adapter,
  payload,
}: {
  clientConsentActive: boolean
  optedIn: boolean
  adapter?: ReminderAdapter
  payload: ReminderPayload
}): Promise<{ state: ReminderDeliveryState; result?: ReminderAdapterResult }> {
  if (!clientConsentActive || !optedIn) return { state: 'opted_out' }
  if (!adapter) return { state: 'provider_unconfigured' }
  return { state: 'sent', result: await adapter.send(payload) }
}
