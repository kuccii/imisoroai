# Imisoro AI

Imisoro AI is a focused tax-compliance assistant for VAT-registered Rwandan SMEs. The MVP covers invoice upload and extraction review, supported/unsupported expense classification, VAT summaries, e-Tax exports, reminders, and multilingual guidance.

## Architecture

`Next.js frontend` → `Express REST API` → `Prisma/PostgreSQL`; uploaded files pass through a storage abstraction, then an OCR adapter and LLM adapter. Email reminders use a pluggable email adapter and a daily cron worker.

## Stack

Next.js 16, React, TypeScript, Tailwind CSS, Express, Zod, Prisma, PostgreSQL, JWT, and JSON locale dictionaries (`en`, `fr`, `rw`).

## Local setup

1. Copy `.env.example` to `.env` (a local `.env` is already provided for development).
2. Install dependencies with pnpm.
3. Start a database. Either run the bundled embedded Postgres with `pnpm dev:db`, or point `DATABASE_URL` at any Postgres instance.
4. Create the tables with `pnpm db:init`. This is idempotent and also runs automatically before auth requests, so a fresh database never leaves the app empty.
5. Run the app with `pnpm dev`.

Invoices are stored in `.data/uploads` when `BLOB_READ_WRITE_TOKEN` is not set, so uploads work without Vercel Blob. Set `AI_GATEWAY_API_KEY` to enable AI extraction; without it uploads still save and are queued for manual entry.

The separate `backend/` Express placeholder is not required for the Next.js app.

The dashboard, invoice inbox, and reports are backed by the database: uploads appear immediately, and empty states only appear when the signed-in account has no records yet. Local files live behind a storage interface so S3 or Blob can be added without changing invoice workflows.

## Superadmin console

Open `/admin` with a superadmin account to see platform-wide workspaces, invoices, and audit activity, to promote or demote other accounts, and to choose the OCR model used for invoice extraction.

Bootstrap access with a comma-separated allowlist in `.env`:

```
SUPERADMIN_EMAILS=owner@example.com,ops@example.com
```

Allowlisted emails are promoted to `role = superadmin` the first time they sign in. After that, superadmins can manage roles from the console. The admin tables (`user.role`, `app_setting`) are created lazily and idempotently on first use, so no migration step is required.

## Deployment

Build the Next.js app on Vercel or a VPS. Run the Express API as a separate process, use managed PostgreSQL, mount a durable private upload volume, configure HTTPS, and schedule the reminder worker daily. Never commit secrets or expose uploaded files publicly.
