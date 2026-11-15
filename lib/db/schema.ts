import { boolean, integer, numeric, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  role: text('role').notNull().default('user'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

export const appSetting = pgTable('app_setting', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedBy: text('updatedBy'),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId').notNull(),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  issuer: text('issuer').notNull().default(''),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId').notNull(),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

export const profile = pgTable('profile', {
  userId: text('userId').primaryKey(),
  businessName: text('businessName').notNull().default('My business'),
  tin: text('tin').notNull().default('PENDING'),
  phone: text('phone'),
  language: text('language').notNull().default('en'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

export const invoiceRecord = pgTable('invoice_record', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  supplier: text('supplier').notNull(),
  tin: text('tin').notNull(),
  invoiceDate: text('invoiceDate').notNull(),
  amount: integer('amount').notNull(),
  vat: integer('vat').notNull(),
  status: text('status').notNull().default('pending'),
  blobPathname: text('blobPathname'),
  originalFilename: text('originalFilename'),
  contentType: text('contentType'),
  invoiceNumber: text('invoiceNumber').notNull().default(''),
  currency: text('currency').notNull().default('RWF'),
  extractionStatus: text('extractionStatus').notNull().default('legacy'),
  extractionConfidence: numeric('extractionConfidence'),
  ebmEvidence: text('ebmEvidence').notNull().default('unclear'),
  extractionNotes: text('extractionNotes').notNull().default('[]'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

export const complianceTask = pgTable('compliance_task', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  clientId: text('clientId'),
  title: text('title').notNull(),
  description: text('description').notNull(),
  dueDate: text('dueDate').notNull(),
  status: text('status').notNull().default('open'),
  source: text('source').notNull().default('rwanda_tax_calendar'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

export const auditEvent = pgTable('audit_event', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  clientId: text('clientId'),
  action: text('action').notNull(),
  entityType: text('entityType').notNull(),
  entityId: text('entityId'),
  metadata: text('metadata'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
})


export const businessFiscalProfile = pgTable('business_fiscal_profile', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().unique(),
  taxpayerTin: text('taxpayerTin'),
  legalName: text('legalName'),
  branchCode: text('branchCode'),
  deviceSerial: text('deviceSerial'),
  environment: text('environment').notNull().default('sandbox'),
  certificationStatus: text('certificationStatus').notNull().default('not_started'),
  productionEnabled: boolean('productionEnabled').notNull().default(false),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

export const fiscalSale = pgTable('fiscal_sale', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  saleDate: text('saleDate').notNull(),
  counterparty: text('counterparty').notNull(),
  counterpartyTin: text('counterpartyTin'),
  currency: text('currency').notNull().default('RWF'),
  subtotalRwf: integer('subtotalRwf').notNull(),
  declaredTaxRwf: integer('declaredTaxRwf').notNull().default(0),
  totalRwf: integer('totalRwf').notNull(),
  status: text('status').notNull().default('draft'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

export const fiscalSaleLine = pgTable('fiscal_sale_line', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  saleId: text('saleId').notNull(),
  description: text('description').notNull(),
  quantity: numeric('quantity', { precision: 16, scale: 4 }).notNull(),
  unitPriceRwf: integer('unitPriceRwf').notNull(),
  netRwf: integer('netRwf').notNull(),
  declaredTaxRwf: integer('declaredTaxRwf').notNull().default(0),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
})

export const fiscalSubmission = pgTable('fiscal_submission', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  saleId: text('saleId').notNull(),
  idempotencyKey: text('idempotencyKey').notNull().unique(),
  environment: text('environment').notNull(),
  status: text('status').notNull().default('queued'),
  requestHash: text('requestHash'),
  externalCorrelationId: text('externalCorrelationId'),
  fiscalReceiptNumber: text('fiscalReceiptNumber'),
  responseCode: text('responseCode'),
  errorCode: text('errorCode'),
  errorMessage: text('errorMessage'),
  attemptCount: integer('attemptCount').notNull().default(0),
  lastAttemptAt: timestamp('lastAttemptAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

export const businessTransaction = pgTable('business_transaction', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  type: text('type').notNull(),
  counterparty: text('counterparty').notNull(),
  reference: text('reference'),
  amount: integer('amount').notNull(),
  transactionDate: text('transactionDate').notNull(),
  status: text('status').notNull().default('unmatched'),
  source: text('source').notNull().default('manual'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
})

export const importedEvidence = pgTable('imported_evidence', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  clientId: text('clientId'),
  isDemo: boolean('isDemo').notNull().default(false),
  kind: text('kind').notNull(),
  supplier: text('supplier').notNull(),
  tin: text('tin').notNull().default(''),
  reference: text('reference').notNull().default(''),
  recordDate: text('recordDate').notNull(),
  amount: integer('amount').notNull(),
  vat: integer('vat'),
  currency: text('currency').notNull().default('RWF'),
  phone: text('phone'),
  userTag: text('userTag'),
  chaseStatus: text('chaseStatus').notNull().default('not_chased'),
  confirmed: boolean('confirmed').notNull().default(false),
  importBatchId: text('importBatchId').notNull(),
  rawData: text('rawData').notNull().default('{}'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
})

export const supplierMapping = pgTable('supplier_mapping', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  clientId: text('clientId').notNull(),
  normalizedName: text('normalizedName').notNull(),
  canonicalName: text('canonicalName').notNull(),
  supplierTin: text('supplierTin').notNull().default(''),
  phone: text('phone'),
  confirmed: boolean('confirmed').notNull().default(false),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

export const workspaceClient = pgTable('workspace_client', {
  id: text('id').primaryKey(),
  ownerUserId: text('ownerUserId').notNull(),
  displayName: text('displayName').notNull(),
  tin: text('tin').notNull().default(''),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
})

export const clientMembership = pgTable('client_membership', {
  id: text('id').primaryKey(),
  clientId: text('clientId').notNull(),
  userId: text('userId').notNull(),
  role: text('role').notNull().default('accountant'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
})

export const clientConsent = pgTable('client_consent', {
  id: text('id').primaryKey(),
  clientId: text('clientId').notNull(),
  recordedByUserId: text('recordedByUserId').notNull(),
  consentText: text('consentText').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
})

export const reminderPreference = pgTable('reminder_preference', {
  id: text('id').primaryKey(),
  clientId: text('clientId').notNull(),
  userId: text('userId').notNull(),
  channel: text('channel').notNull(),
  optIn: boolean('optIn').notNull().default(false),
  destination: text('destination'),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

export const ledgerDraftEntry = pgTable('ledger_draft_entry', {
  id: text('id').primaryKey(),
  clientId: text('clientId').notNull(),
  createdByUserId: text('createdByUserId').notNull(),
  sourceRecordId: text('sourceRecordId'),
  expenseDate: text('expenseDate').notNull(),
  supplier: text('supplier').notNull(),
  tin: text('tin').notNull().default(''),
  reference: text('reference').notNull().default(''),
  amountRwf: integer('amountRwf').notNull(),
  reason: text('reason').notNull(),
  evidenceDescription: text('evidenceDescription').notNull(),
  reviewStatus: text('reviewStatus').notNull().default('needs_review'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
})
