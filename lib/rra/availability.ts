export const rraAvailability = {
  canTransmit: false,
  environment: 'sandbox' as const,
  blockers: [
    'Current official RRA fiscal-device protocol is not verified.',
    'RRA sandbox credentials and test-device registration are not configured.',
    'RRA certification and production authorization are not complete.',
  ],
}
