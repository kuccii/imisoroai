# Imisoro AI — system workflow and feature guide

Imisoro AI is a Rwanda-focused tax operations workspace for organizing business records and preparing reviewable tax evidence. It supports a human-led process: AI can draft data from a document, but a person verifies it, and filing is completed separately in RRA eTax.

## End-to-end monthly workflow

1. **Set up the workspace.** A user signs in and maintains business profile details, including the business name and TIN. The system supports English, Kinyarwanda, and French. Accountants can work in client workspaces only with the required membership and active client consent; document uploads and scans are blocked without consent.
2. **Capture source records.** Add purchase invoices or expense receipts by uploading a private PDF/JPG/PNG or entering records through the available import/manual workflows. The original document remains linked to its invoice record. Upload validation checks file size, declared media type, and file signature.
3. **Draft invoice fields with OCR.** The server sends the document to the configured AI model. The extraction instructions distinguish supplier from buyer, issue date from due date, gross total from subtotal, explicitly stated VAT from inferred tax, and invoice/EBM identifiers from other references. The model must not follow text embedded in a document. Unreadable information remains unknown; foreign-currency values are not silently converted to RWF. If scanning is disabled or unavailable, the original is retained for manual entry.
4. **Triage data-quality issues.** Imisoro flags missing or suspect supplier name/TIN, invoice number, date, amount, VAT relationship, currency conversion, and EBM evidence. These checks describe data needing attention; they are not proof that a document is valid or invalid. Users can open the original alongside the editable extracted draft, correct fields, and leave a review note describing what they checked.
5. **Make a human workpaper decision.** An authorized reviewer explicitly includes a supported purchase invoice in internal workpapers or excludes it, with a review note. Records missing the required source, supplier TIN, invoice number, date, or positive total cannot be included. All review decisions are audited with before/after values. This decision is not RRA approval and does not file a tax claim.
6. **Record and reconcile sales.** Sales can be captured as manual evidence or entered in the itemized fiscal sales workflow. Fiscalization is separate from filing preparation: an RRA fiscal receipt is represented as fiscalized only when the system has the corresponding recorded submission and receipt identifiers. Manual sales remain visibly distinct and must be reconciled against EBM/EIS records.
7. **Prepare the period.** The filing-preparation workspace assembles dated purchase evidence, undated records needing date follow-up, manual sales, and verified fiscalized sales for a selected month. Its checklist identifies scan/data-quality issues, unreviewed invoices, sales reconciliation needs, and the RRA eTax handoff. VAT summaries and exports are evidence aids; output VAT and statutory adjustments are not calculated as a return.
8. **Complete filing outside Imisoro.** The user/accountant verifies the source evidence and figures, then prepares and submits the periodic return in RRA eTax. The filing pack is an internal preparation/export aid only; it does not submit an eTax return.
9. **Track deadlines and account settings.** The user reviews compliance reminders, profile settings, and language preferences. Superadmins can review platform-level activity, user access, and OCR configuration through the separate admin console.

## Main product areas

- **Overview:** workspace snapshot, review workload, reviewed purchase VAT evidence, and a path into the invoice inbox.
- **Invoices / evidence inbox:** private originals, OCR draft fields, confidence and extraction status, field correction, data-quality cues, review notes, include/exclude decisions, and retry from the stored original.
- **Filing preparation:** monthly checklist and downloadable evidence pack with manual sales and verified fiscalized sales distinguished.
- **Fiscalization:** itemized sales, device/business setup, submission queue, and RRA response lifecycle. Production fiscalization remains gated by certification/registration; this is not a tax-return submission feature.
- **Sales and reconciliation:** record manual sales and compare operational records with imported or fiscalized evidence; unresolved/manual records are not presented as verified RRA receipts.
- **VAT summary and exports:** selected-period evidence totals and CSV exports for the user/accountant. These are not a substitute for a statutory VAT calculation or eTax filing.
- **Deadlines:** Rwanda tax-calendar tasks and completion tracking.
- **Profile and access:** business profile, supported language preferences, client workspaces, membership/consent controls, sign-in, and administrative access.
- **Assistant and guidance:** multilingual tax/compliance guidance; advice should be checked against current official RRA guidance and is not a tax determination.

## OCR quality and safety principles

- Preserve the source and make extraction corrections traceable.
- Show missing or ambiguous values as follow-up tasks rather than filling them with guesses.
- Never infer VAT, exchange rates, EBM authenticity, or RRA acceptance from visual extraction.
- Keep AI extraction, human workpaper review, RRA sales fiscalization, and eTax filing as distinct states and workflows.
- Do not describe an invoice as supported merely because OCR succeeded. A reviewer must inspect the original and explicitly decide.

## Compliance boundaries

- The app is a preparation and evidence-management workspace, not an RRA-certified tax adviser or return-submission channel.
- An EBM/VSDC mark read by OCR is only a visual evidence cue, not a cryptographic or RRA validation.
- Sales fiscalization must use the applicable current RRA-approved specification, certified configuration, and registered device. The separate filing-preparation pack does not imply that a fiscalized sale files a periodic return.
- Users remain responsible for checking current law, tax treatment, deadlines, and figures with RRA or a qualified accountant before filing.
