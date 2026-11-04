# Ledger API

The Ledger server is an Express 4 API backed by MongoDB/Mongoose. It owns authentication, validation, user-scoped financial records, receipt and payslip processing, market-data proxying, Auto-SIP ledger generation, and Ledger AI requests.

See the root [README](../README.md) for application overview and full setup.

## Stack

- Node.js and Express
- MongoDB and Mongoose
- Zod request validation
- JWT sessions in HTTP-only cookies and bcrypt password hashing
- MongoDB-backed shared rate limits
- Resend email delivery for optional verification and password recovery
- Vitest, Supertest, and mongodb-memory-server

## Run locally

\`\`\`bash
cp .env.example .env
npm install
npm run dev
\`\`\`

Set \`MONGODB_URI\` and \`JWT_SECRET\` in \`.env\`. The server listens on \`http://localhost:5000\` by default.

## Routes

All paths below are prefixed with \`/api\`. Unless stated otherwise, data routes require an authenticated session and scope records to the current user.

| Area | Endpoints | Purpose |
| --- | --- | --- |
| Health | \`GET /health\`, \`GET /ready\` | Liveness and MongoDB readiness |
| Authentication | \`POST /auth/register\`, \`POST /auth/login\`, \`GET /auth/me\`, \`POST /auth/logout\` | Register, sign in, restore session, and sign out |
| Account recovery | \`POST /auth/verify-email\`, \`POST /auth/resend-verification\`, \`POST /auth/forgot-password\`, \`POST /auth/reset-password\` | Verify an address and use time-limited, one-use password recovery tokens |
| Transactions | \`GET/POST /transactions\`, \`PUT/DELETE /transactions/:id\` | List, create, update, and delete entries |
| Recurring entries | \`POST /transactions/generate-recurring\` | Generate monthly entries from templates |
| CSV | \`POST /transactions/import\`, \`GET /transactions/export\` | Import and export transactions |
| Receipts | \`POST/GET /transactions/:id/receipts\`, \`GET /transactions/:id/receipts/:receiptId\` | Attach, list, and download receipts |
| Valuations | \`GET/POST /valuations\`, \`DELETE /valuations/:id\` | Track monthly savings valuations |
| Investments | \`GET/POST /investments\`, \`PUT/DELETE /investments/:id\` | Track investment contributions and status |
| Bonds | \`GET/POST /bonds\`, \`PUT/DELETE /bonds/:id\` | Manage bond records |
| Budgets | \`GET/POST /budgets\`, \`DELETE /budgets/:id\` | Manage monthly budgets |
| Debts | \`GET/POST /debts\`, \`PUT/DELETE /debts/:id\` | Track debt balances and payments |
| Bills | \`GET/POST /bills\`, \`PUT/DELETE /bills/:id\` | Manage bills |
| Market data | \`GET /market/search?q=...\`, \`GET /market/:schemeCode\` | Search schemes and fetch market/NAV data |
| Documents | \`POST /documents/parse-payslip\` | Extract suggestions from text-based PDF payslips |
| Ledger AI | \`POST /ai/chat\`, \`GET /ai/history\` | Stream AI answers and retrieve chat history |
| AI sharing | \`POST /ai/share\`, public \`GET /ai/share/:token\` | Create and read an expiring read-only transcript snapshot |

Transaction listing preserves the legacy plain-array response when called without query parameters. Pagination can be requested with \`?page=1&limit=200\`; transaction date filters include \`month\` or \`from\` and \`to\`.

## Authentication configuration

The existing sign-in and account flow remains compatible by default. To enable mandatory verification for new registrations, first configure a Resend account and a verified sender domain, then set these server-only variables:

| Variable | Purpose |
| --- | --- |
| \`RESEND_API_KEY\` | Resend API key |
| \`AUTH_EMAIL_FROM\` | Verified sender, e.g. \`Ledger <noreply@example.com>\` |
| \`AUTH_PUBLIC_URL\` | Public frontend origin used for action links |
| \`REQUIRE_EMAIL_VERIFICATION\` | Set to \`true\` after verifying delivery |

Existing users are treated as verified. Verification links expire after 24 hours. Password-reset links expire after one hour. Both token types are random, single-use, and stored only as SHA-256 hashes. A successful password reset increments the user's token version and invalidates all previously issued sessions.

New passwords must be at least 12 characters and no more than 72 UTF-8 bytes, matching bcrypt's input limit. The client-side strength indicator is a heuristic, not a breached-password service.

## Rate limiting

Auth, authenticated API, AI, and shared AI read limits use separate MongoDB counter namespaces. Atomic update pipelines make counters consistent across API instances; a TTL index removes expired records. The database connection must be available before limited routes are first used.

Default limits:

- Authentication: 10 requests per 15 minutes per IP.
- Authenticated API: 600 requests per 5 minutes per user.
- Ledger AI: 20 requests per 15 minutes per user.
- Shared AI snapshot reads: 60 requests per 15 minutes per IP.

The AI rate-limit response includes the configured limit, remaining requests, and reset time.

## Security notes

- Do not commit \`.env\` or expose server secrets in client variables.
- Use a unique production \`JWT_SECRET\` of at least 32 characters.
- Production cookies are \`Secure\` and \`SameSite=None\` because the Netlify frontend and API use separate origins.
- CORS allowlisting and the state-changing request Origin check use \`CLIENT_ORIGIN\`.
- Receipt uploads and PDF parsing are restricted by supported type and payload size.
- The Auto-SIP job writes ledger records only; it does not place investment orders.
- Retain MongoDB backups and test restoration procedures before running any data migration.
