# API

Base URL: `/api`. JSON responses use `{ data }` for success and `{ error, details? }` for failures.

- `POST /auth/signup` body `{ email, password, role? }`; returns `{ user, token }`. Errors: 400 validation, 409 duplicate email.
- `POST /auth/login` body `{ email, password }`; returns `{ user, token }`. Errors: 401 invalid credentials.
- `GET /auth/me` bearer token; returns the current user.
- `GET /business` bearer token; returns owned businesses or accountant clients.
- `POST /business` body `{ name, tin, contact_email?, contact_phone?, preferred_language? }`.
- `POST /invoices` multipart `file`, `business_id`; returns `{ invoice_id, status }`. Errors: 400 type/size, 404 business.
- `GET /invoices?business_id=&status=&classification=&from=&to=` returns `{ data, meta }`.
- `GET /invoices/:id` returns invoice, line items, and classification.
- `PUT /invoices/:id` body may include extracted fields, `approve`, and `classification_override` plus `user_note`.
- `GET /export/unsupported-expenses?business_id=&from=&to=` downloads CSV.
- `GET /export/vat-summary?business_id=&from=&to=` returns input/output/net VAT totals.
- `GET /deadlines` returns upcoming deadlines localized to the user language.
- `POST /seed` is development-only and populates sample data.

All production handlers must enforce ownership, validate with Zod, use parameterized Prisma queries, and return stable error codes.
