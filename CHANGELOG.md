# Changelog

## 2026-11-19

- Re-enabled the AI chat assistant (`aiChatEnabled = true`). It stays scoped to the signed-in client's own imported records, cites record IDs, and is instructed to refuse general tax-rate/deadline questions rather than answer unverified — but it has not been tested against adversarial prompting and does not yet retrieve from a curated, cited RRA source set.

## 2026-11-15

- Centered the workspace on missing supplier evidence, with imports and exports as the primary supporting workflows.
- Added multi-client consent/access workflows, ledger review drafts, and opt-in reminder preferences.
- Added an isolated, fictional sample import scenario for exploring the Missing list, plus first-view timing and best-effort per-document OCR cost audit events.
- Gated fiscalization/sales APIs and disabled AI chat until verified RRA interfaces and cited-source retrieval are available.
- Documented external verification requirements, data inventory, retention gaps, and legal-review caveats in `docs/ASSUMPTIONS.md`.
