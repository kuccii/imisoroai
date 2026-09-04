# Imisoro AI

Imisoro AI is a focused tax-compliance assistant for VAT-registered Rwandan SMEs. The MVP covers invoice upload and extraction review, supported/unsupported expense classification, VAT summaries, e-Tax exports, reminders, and multilingual guidance.

## Architecture

`Next.js frontend` → `Express REST API` → `Prisma/PostgreSQL`; uploaded files pass through a storage abstraction, then an OCR adapter and LLM adapter. Email reminders use a pluggable email adapter and a daily cron worker.

## Stack

Next.js 16, React, TypeScript, Tailwind CSS, Express, Zod, Prisma, PostgreSQL, JWT, and JSON locale dictionaries (`en`, `fr`, `rw`).

## Local setup

1. Copy `.env.example` to `.env` and set `DATABASE_URL`, `JWT_SECRET`, `OCR_API_KEY`, `LLM_API_KEY`, and email settings.
2. Install dependencies with pnpm.
3. Run `pnpm prisma migrate dev --schema backend/prisma/schema.prisma` and `pnpm prisma db seed`.
4. Run the frontend with `pnpm dev`. Run the API with `tsx backend/src/server.ts`.

The current preview includes an interactive dashboard shell with demo data. Replace the service adapters and API client wiring before production use. Local files live behind a storage interface so S3 or Blob can be added without changing invoice workflows.

## Deployment

Build the Next.js app on Vercel or a VPS. Run the Express API as a separate process, use managed PostgreSQL, mount a durable private upload volume, configure HTTPS, and schedule the reminder worker daily. Never commit secrets or expose uploaded files publicly.
