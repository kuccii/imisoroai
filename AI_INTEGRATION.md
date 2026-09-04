# AI integration

The backend defines `OcrService`, `LlmService`, and `EmailService` in `backend/src/services/index.ts`. The included adapters are deterministic placeholders for local development.

Implement `processImage(fileBuffer)` with an OCR provider that accepts PDF/image bytes and returns plain text. Then implement `extractInvoiceData(ocrText)` with a strict JSON schema for invoice date, supplier identity, totals, VAT, and line items. Validate provider output before writing it to Prisma. Implement `classifyExpense(data)` with the RRA rule set, a stable reason code, and localized explanation; keep the classification auditable and allow user overrides.

Use `OCR_API_KEY`, `LLM_API_KEY`, and provider URLs only on the server. Add request timeouts, retry limits, structured logs without document contents, and a manual review fallback whenever confidence is low. Email adapters should use `EMAIL_SERVICE_*` variables and idempotent reminder keys.
