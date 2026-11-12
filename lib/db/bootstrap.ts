import { pool } from '@/lib/db'

/**
 * Creates every table the app uses if it is missing. The repository ships no
 * migration files, so a fresh database previously left every screen empty and
 * every write failing. This bootstrap is idempotent and cached per process.
 */
const statements = [
  `CREATE TABLE IF NOT EXISTS "user" (
    "id" text PRIMARY KEY,
    "name" text NOT NULL,
    "email" text NOT NULL UNIQUE,
    "emailVerified" boolean NOT NULL DEFAULT false,
    "image" text,
    "role" text NOT NULL DEFAULT 'user',
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "role" text NOT NULL DEFAULT 'user'`,
  `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "emailVerified" boolean NOT NULL DEFAULT false`,
  `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "image" text`,
  `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now()`,
  `CREATE TABLE IF NOT EXISTS "session" (
    "id" text PRIMARY KEY,
    "expiresAt" timestamptz NOT NULL,
    "token" text NOT NULL UNIQUE,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now(),
    "ipAddress" text,
    "userAgent" text,
    "userId" text NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "account" (
    "id" text PRIMARY KEY,
    "issuer" text NOT NULL DEFAULT '',
    "accountId" text NOT NULL,
    "providerId" text NOT NULL,
    "userId" text NOT NULL,
    "accessToken" text,
    "refreshToken" text,
    "idToken" text,
    "accessTokenExpiresAt" timestamptz,
    "refreshTokenExpiresAt" timestamptz,
    "scope" text,
    "password" text,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
  )`,
  // better-auth 1.7 added account.issuer; older databases need it too.
  `ALTER TABLE "account" ADD COLUMN IF NOT EXISTS "issuer" text NOT NULL DEFAULT ''`,
  `UPDATE "account" SET "issuer" = 'legacy:' || "id" WHERE "issuer" = ''`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "account_issuer_accountId_unique" ON "account" ("issuer", "accountId")`,
  `CREATE TABLE IF NOT EXISTS "verification" (
    "id" text PRIMARY KEY,
    "identifier" text NOT NULL,
    "value" text NOT NULL,
    "expiresAt" timestamptz NOT NULL,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "profile" (
    "userId" text PRIMARY KEY,
    "businessName" text NOT NULL DEFAULT 'My business',
    "tin" text NOT NULL DEFAULT 'PENDING',
    "phone" text,
    "language" text NOT NULL DEFAULT 'en',
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "invoice_record" (
    "id" text PRIMARY KEY,
    "userId" text NOT NULL,
    "supplier" text NOT NULL,
    "tin" text NOT NULL,
    "invoiceDate" text NOT NULL,
    "amount" integer NOT NULL,
    "vat" integer NOT NULL,
    "status" text NOT NULL DEFAULT 'pending',
    "blobPathname" text,
    "originalFilename" text,
    "contentType" text,
    "invoiceNumber" text NOT NULL DEFAULT '',
    "currency" text NOT NULL DEFAULT 'RWF',
    "extractionStatus" text NOT NULL DEFAULT 'legacy',
    "extractionConfidence" numeric,
    "ebmEvidence" text NOT NULL DEFAULT 'unclear',
    "extractionNotes" text NOT NULL DEFAULT '[]',
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "compliance_task" (
    "id" text PRIMARY KEY,
    "userId" text NOT NULL,
    "title" text NOT NULL,
    "description" text NOT NULL,
    "dueDate" text NOT NULL,
    "status" text NOT NULL DEFAULT 'open',
    "source" text NOT NULL DEFAULT 'rwanda_tax_calendar',
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "audit_event" (
    "id" text PRIMARY KEY,
    "userId" text NOT NULL,
    "action" text NOT NULL,
    "entityType" text NOT NULL,
    "entityId" text,
    "metadata" text,
    "createdAt" timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "ledger_account" (
    "id" text PRIMARY KEY,
    "userId" text NOT NULL,
    "code" text NOT NULL,
    "name" text NOT NULL,
    "type" text NOT NULL,
    "createdAt" timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "ledger_entry" (
    "id" text PRIMARY KEY,
    "userId" text NOT NULL,
    "accountId" text NOT NULL,
    "referenceType" text NOT NULL,
    "referenceId" text NOT NULL,
    "description" text NOT NULL,
    "debit" integer NOT NULL DEFAULT 0,
    "credit" integer NOT NULL DEFAULT 0,
    "entryDate" text NOT NULL,
    "createdAt" timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "business_transaction" (
    "id" text PRIMARY KEY,
    "userId" text NOT NULL,
    "type" text NOT NULL,
    "counterparty" text NOT NULL,
    "reference" text,
    "amount" integer NOT NULL,
    "transactionDate" text NOT NULL,
    "status" text NOT NULL DEFAULT 'unmatched',
    "source" text NOT NULL DEFAULT 'manual',
    "createdAt" timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "business_fiscal_profile" (
    "id" text PRIMARY KEY,
    "userId" text NOT NULL UNIQUE,
    "taxpayerTin" text,
    "legalName" text,
    "branchCode" text,
    "deviceSerial" text,
    "environment" text NOT NULL DEFAULT 'sandbox',
    "certificationStatus" text NOT NULL DEFAULT 'not_started',
    "productionEnabled" boolean NOT NULL DEFAULT false,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "fiscal_sale" (
    "id" text PRIMARY KEY,
    "userId" text NOT NULL,
    "saleDate" text NOT NULL,
    "counterparty" text NOT NULL,
    "counterpartyTin" text,
    "currency" text NOT NULL DEFAULT 'RWF',
    "subtotalRwf" integer NOT NULL,
    "declaredTaxRwf" integer NOT NULL DEFAULT 0,
    "totalRwf" integer NOT NULL,
    "status" text NOT NULL DEFAULT 'draft',
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "fiscal_sale_line" (
    "id" text PRIMARY KEY,
    "userId" text NOT NULL,
    "saleId" text NOT NULL,
    "description" text NOT NULL,
    "quantity" numeric(16, 4) NOT NULL,
    "unitPriceRwf" integer NOT NULL,
    "netRwf" integer NOT NULL,
    "declaredTaxRwf" integer NOT NULL DEFAULT 0,
    "createdAt" timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "fiscal_submission" (
    "id" text PRIMARY KEY,
    "userId" text NOT NULL,
    "saleId" text NOT NULL,
    "idempotencyKey" text NOT NULL UNIQUE,
    "environment" text NOT NULL,
    "status" text NOT NULL DEFAULT 'queued',
    "requestHash" text,
    "externalCorrelationId" text,
    "fiscalReceiptNumber" text,
    "responseCode" text,
    "errorCode" text,
    "errorMessage" text,
    "attemptCount" integer NOT NULL DEFAULT 0,
    "lastAttemptAt" timestamptz,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "app_setting" (
    "key" text PRIMARY KEY,
    "value" text NOT NULL,
    "updatedBy" text,
    "updatedAt" timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" ("userId")`,
  `CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" ("userId")`,
  `CREATE INDEX IF NOT EXISTS "invoice_record_userId_createdAt_idx" ON "invoice_record" ("userId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "compliance_task_userId_idx" ON "compliance_task" ("userId")`,
  `CREATE INDEX IF NOT EXISTS "audit_event_userId_createdAt_idx" ON "audit_event" ("userId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "ledger_account_userId_idx" ON "ledger_account" ("userId")`,
  `CREATE INDEX IF NOT EXISTS "ledger_entry_userId_entryDate_idx" ON "ledger_entry" ("userId", "entryDate")`,
  `CREATE INDEX IF NOT EXISTS "business_transaction_userId_transactionDate_idx" ON "business_transaction" ("userId", "transactionDate")`,
  `CREATE INDEX IF NOT EXISTS "fiscal_sale_userId_saleDate_idx" ON "fiscal_sale" ("userId", "saleDate")`,
  `CREATE INDEX IF NOT EXISTS "fiscal_submission_userId_idx" ON "fiscal_submission" ("userId")`,
]

let ready: Promise<void> | null = null

export function ensureDatabaseSchema() {
  if (!ready) {
    ready = (async () => {
      const client = await pool.connect()
      try {
        for (const statement of statements) {
          await client.query(statement)
        }
      } finally {
        client.release()
      }
    })().catch((error) => {
      ready = null
      throw error
    })
  }
  return ready
}
