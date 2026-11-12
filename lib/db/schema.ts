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
  action: text('action').notNull(),
  entityType: text('entityType').notNull(),
  entityId: text('entityId'),
  metadata: text('metadata'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
})

export const ledgerAccount = pgTable('ledger_account', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
})

export const ledgerEntry = pgTable('ledger_entry', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  accountId: text('accountId').notNull(),
  referenceType: text('referenceType').notNull(),
  referenceId: text('referenceId').notNull(),
  description: text('description').notNull(),
  debit: integer('debit').notNull().default(0),
  credit: integer('credit').notNull().default(0),
  entryDate: text('entryDate').notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
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
