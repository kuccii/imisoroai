# Verification assumptions and audit

This document separates verified application behavior from external tax, data, and provider details that must be confirmed. Nothing listed as an assumption is treated as an RRA rule or a supported interface.

## External verification required

| ID | Verify with | Question / assumption | Until verified |
|---|---|---|---|
| VERIFY-01 | RRA e-Tax guidance or authorized users | Can the e-Tax **View purchases** list be exported? If yes, what exact file formats, column names, date/period behavior, and encoding are produced? | Accept user-provided CSV/XLSX through configurable column mapping only. Do not claim direct e-Tax connectivity. |
| VERIFY-02 | Current RRA e-Tax annexure instructions | What is the current annexure template, exact columns, required values, and upload file format for unsupported expenses? | Ledger export is a review CSV/XLSX only, marked **format not verified — not upload-ready**. |
| VERIFY-03 | RRA/EBM technical documentation | What information, if any, does an EBM receipt QR code or signature encode, and how should it be validated? | Do not infer authenticity or decode undocumented formats. Treat OCR/extracted fields as unverified evidence. |
| VERIFY-04 | RRA and officially authorized provider | Is there an applicable OSDC/VSDC/CIS purchase-retrieval specification, and what lawful, documented authorization and interface does it provide? | No RRA login automation, scraping, credential storage, or assumed endpoints/formats. Import only files supplied by the user. |
| VERIFY-05 | RRA tax guidance and qualified local tax professional | Which evidence categories and period rules apply to the user’s intended process, including EBM, customs, withholding, and ledger treatment? | Categories remain user-recorded workflow labels; do not decide deductibility or tax treatment. |
| VERIFY-06 | Rwandan legal counsel / data-protection authority guidance | What data-protection duties, lawful bases, notices, retention limits, deletion obligations, and processor terms apply to this service? | Flag for legal review; do not state legal conclusions. |
| VERIFY-07 | Native Kinyarwanda and French reviewers | Are supplier-chase message translations accurate, polite, and appropriate for local business use? | Kinyarwanda and French templates must be marked **needs native-speaker review**. |

## Repository audit against the brief (starting state)

| Requirement area | What exists in the repository | Gap / boundary |
|---|---|---|
| Stack and persistence | Next.js App Router, React, TypeScript, Better Auth, Drizzle/PostgreSQL, Vercel Blob, SWR. Existing APIs use session checks, input validation, user-scoped records, and audit events in some workflows. | Existing user-only ownership model does not yet implement accountant/client membership or consent scoping. |
| Invoice capture | Upload/OCR API and invoice records with source document metadata, extraction status/confidence/notes, EBM evidence label, and manual review UI. | OCR evidence is not verified against EBM cryptography/QR rules; no accuracy harness or field-level benchmark exists. |
| RRA purchases import | No import workflow for user-exported e-Tax purchases, no CSV/XLSX parser, paste-table fallback, or column mapper was found in the initial route/UI audit. | Must build file import without assuming an RRA format. |
| Payments import | A generic `business_transaction` table and reconciliation API/UI exist for recorded transactions. | No bank/MoMo statement import workflow, configurable column mapping, PDF best-effort import, or matching test suite was found. |
| Matching and supplier memory | Existing invoice/manual transaction review and reconciliation affordances. | No deterministic purchase-to-payment-to-RRA matching engine, confirmed supplier alias directory, match explanations/confidence, or four requested outcome groups. |
| Missing-first workflow | Existing app opens to an Overview and has separate invoices, sales, fiscalization, reconciliation, VAT, exports, deadlines, and profile views. | The primary “what is missing and what do I do?” landing/chase list is not implemented. Navigation is more extensive than needed. |
| Supplier chase | No message templates, copy-to-clipboard/wa.me action, compliance tracking, or supplier scorecard was found. | Needs manual, user-triggered contact and opt-in reminder support; never auto-send. |
| Accountant multi-client | Existing workspace data and records are scoped to the signed-in user. | No organizations/clients, accountant role, switcher, client consent record, or actor-plus-client audit scope exists. Adding this safely requires additive schema changes and careful scoping. |
| Ledger draft and export | Filing preparation and CSV/summary exports exist; ledger-related routes exist. | No itemized unsupported-expense ledger draft with reason/evidence or annexure-mirroring export. Exact annexure format is unverified. |
| Tax calculations | Existing UI can summarize supported purchase VAT evidence. | Output VAT must remain uncalculated. No complete tax liability or deductibility determination should be presented. |
| Fiscalization and sales | Fiscal setup/sales draft UI and APIs exist; current UI states that transmission is disabled pending specification/certification. | Keep existing code but hide these workflows behind an off-by-default feature flag. Do not enable RRA transmission. |
| AI chat | A chat endpoint and launcher exist. | Not retrieval-only over a curated cited RRA corpus. Must be disabled by default until that source-grounded behavior exists. |
| Deadlines | Compliance task workflow/API exists. | Reminders must be in-app and provider adapters opt-in/off by default; validate imported/calendar content separately. |
| Operations | Authentication, private file storage, and some audit support exist. | No documented data inventory/retention/deletion process, consent lifecycle, OCR cost events, import-to-missing timing metric, or accuracy measurement was found. |
| Tests and demo | The repository has build/dev scripts and package/workspace configuration. | No unit-test framework or matching fixtures were found in the initial audit. No seeded RRA-list + statement demo was found. |

## Product and implementation assumptions (VERIFY where relevant)

1. **User-supplied records only:** RRA purchase lists and financial statements are imported from files or pasted tables that the user is authorized to provide. No automated access to e-Tax is implemented.
2. **Import formats:** CSV and XLSX are accepted through parsing plus a user-confirmed column-mapping step; the parser supports files, not an RRA-certified schema. This is a product input assumption, not confirmation of what e-Tax exports.
3. **Match semantics:** Matching is deterministic and explainable. A match is a workflow suggestion, not evidence of deductibility or RRA acceptance. A user confirms first-time supplier aliases and every ledger entry.
4. **Payment grouping:** Split/combined matching is bounded by explicit amount/date tolerances and surfaced with reasons and confidence for user confirmation. Tolerance defaults are product choices, not RRA rules.
5. **Possible non-EBM classification:** “Likely no-EBM-possible” is a user-tagged internal grouping only. The application does not decide that a purchase qualifies for a customs/withholding/other tax treatment.
6. **Supplier contact:** The app prepares messages and opens a user-initiated copy or WhatsApp link. It never sends messages automatically. Phone numbers and message text require user review.
7. **Supplier compliance:** A later re-import can show that a supplier appears in the new user-provided RRA list. This is a record comparison, not a verified supplier response or official determination.
8. **Metrics:** RWF unsupported/chased/recovered figures are operational estimates derived from user-confirmed records and matching events. They are not tax balances or expected refunds.
9. **Multi-client migration:** New organization/client relationships and consent records are additive. Existing user-owned records remain accessible to their original owner. No destructive migration or ownership reassignment is permitted without explicit approval.
10. **Exports:** Until VERIFY-02 is resolved, all ledger exports carry a prominent not-upload-ready banner and cannot be described as RRA-compatible.
11. **AI and OCR:** Matching never uses AI. Chat is disabled by default unless/ until it retrieves from a curated, maintained RRA source set and cites those sources; it must refuse unsupported tax questions. OCR remains secondary to documented receipt decoding and is never described as accurate until measured.
12. **Language quality:** English templates can be used as initial drafts. Kinyarwanda and French copy is explicitly pending native-speaker review.
13. **Retention and deletion:** No specific retention period is asserted until legal review (VERIFY-06). The product should provide a documented inventory and deletion pathway without silently deleting records needed by an active workflow.

## Safety invariants

- Never submit to RRA, store RRA credentials/keys, or automate/scrape e-Tax login flows.
- Never invent RRA endpoints, protocols, file formats, annexure columns, or tax rules. Keep external-format details behind an adapter and a visible `VERIFY` marker until confirmed.
- Statuses are internal only; never label records “RRA-approved” or assert deductibility/tax determination.
- Preserve existing authentication checks, per-user scoping, validation, and audit events. New accountant/client operations must scope every query and audit actor plus client.
- Do not destructively alter existing data without explicit user approval.

## Current implementation status (2026-11-15)

| Area | Implemented in this branch | Still unverified or incomplete |
|---|---|---|
| Missing-first core | User-supplied CSV/XLSX and pasted imports, column mapping, manual payment entry, deterministic match groups/reasons/confidence, supplier chase actions, and a client switcher. Navigation centers on **Missing**, with Imports, Suppliers, Ledger draft, Exports, Deadlines, and Settings kept as secondary sections. | No direct e-Tax or bank/MoMo connection. PDF statement ingestion is not supported. External export and tax rules remain VERIFY items. |
| Accountant workflow | Additive client/consent records, accountant membership, client-scoped query paths, ledger drafts and review exports, opt-in provider preference records, and in-app tasks are present. | Legal basis, consent wording, deletion lifecycle, and every provider adapter need review or further implementation. |
| Safety gates | Fiscalization and sales APIs are unavailable unless `IMISORO_FISCAL_DRAFTS_ENABLED=true`; the active workspace navigation does not expose them. The legacy AI chat endpoint remains unavailable because `aiChatEnabled` is hard-disabled until retrieval and citation enforcement exist. | Do not set the fiscal flag in production. Chat cannot be enabled safely until curated-source retrieval and citation checks are implemented. |
| Demo | A clearly fictional, client-scoped purchase/payment scenario is seeded and shown in a separate demo view. | It is not RRA or bank data and must not be used as tax evidence. |
| Evidence quality and operations | Matching tests exist. OCR and imported values remain human-reviewable. | No redacted production receipt corpus or measured OCR accuracy; OCR cost per document and import-to-missing elapsed time are not yet recorded. Data erasure is not implemented. |

## Data inventory, retention, and deletion

This is an engineering inventory, not a legal conclusion. Legal review against applicable Rwandan data-protection requirements is required (VERIFY-06).

| Data | Stored / processed | Current control and gap |
|---|---|---|
| Account and session | Better Auth/PostgreSQL: account identifiers, email/name, password hash, sessions, and authentication metadata. | Session lifecycle follows the auth library; a product-wide account deletion and dependent-data erasure workflow is not documented here. |
| Original invoice files | Private Vercel Blob objects; metadata, extracted fields, and review state in PostgreSQL. When OCR is enabled, document bytes are sent server-side to the configured AI Gateway model. | Application deletion may remove a file through existing invoice actions, but no end-to-end retention schedule or verified provider-retention statement is asserted. |
| Imported RRA purchase lists and payment statements | Parsed row fields, raw source cells, batch identifiers, client/user ownership, and review/chase state in PostgreSQL. | User-provided data only. No automatic retention limit or client-wide erasure workflow is implemented. Demo rows have a separate `isDemo` marker and query scope. |
| Client and accountant records | Client identity/TIN, membership role, consent events, and access records in PostgreSQL. | Consent is auditable and revocable. Revocation blocks evidence workflows but does not itself erase historical evidence. |
| Ledger drafts, reminders, supplier directory, audit events | Operational records in PostgreSQL, scoped to user/client where applicable. | Audit history is retained; retention duration and lawful archival/deletion rules require counsel review. |
| OCR usage and timing telemetry | Current audit events store operation/model metadata, but no per-document monetary cost or import-to-missing duration is calculated. | Add measured usage/cost telemetry only when the provider exposes a verifiable cost basis; do not invent pricing. |

No fixed retention period is claimed. There is currently no complete, user-facing client-data deletion workflow. Before production use, define retention by data class, a verified Blob/database erasure path, backup expiration, legal holds, audit-log treatment, and a deletion-request process with counsel. Never silently delete data needed for an active workflow.
