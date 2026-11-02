# Ledger

Ledger is a personal finance and investment tracker for income, spending, savings, budgets, obligations, investment contributions, bonds, and portfolio valuations. It uses a React/Vite frontend and an Express/Mongoose API backed by MongoDB.

## Application features

- **Dashboard:** monthly cash-flow totals, category breakdowns, valuation trends, and financial alerts.
- **Entries:** create, edit, filter, export, and import transactions; attach receipts; generate recurring entries.
- **Budgets:** set monthly targets by mode and category.
- **Savings tracker:** record monthly instrument valuations and review their history.
- **SIP Growth:** manage SIP, additional contribution, and portfolio status records; research mutual-fund schemes and NAV history through the server-side market-data proxy.
- **Auto-SIP:** a monthly India-time scheduler creates idempotent investment records using the existing environment configuration. Users with the configured excluded fund are eligible; the configured excluded fund itself is not auto-invested.
- **Bonds:** track bond holdings, maturity information, and valuations.
- **Obligations:** manage debts, EMIs, bills, and payment-related entries.
- **Payslip parsing:** upload a PDF payslip to receive suggested auto-fill values for review.
- **Ledger AI:** ask questions about ledger data, retain authenticated chat history, and explicitly share read-only conversation snapshots through expiring links.
- **Authentication:** bcrypt password hashes and a seven-day HTTP-only JWT cookie.
- **Themes and responsive layout:** light/dark theme and desktop/mobile navigation.

## Technology

- Client: React 19, Vite, React Router, React-Bootstrap, Recharts, Framer Motion, and Three.js.
- Server: Node.js, Express, Mongoose, MongoDB, Zod validation, JWT, bcryptjs, and rate limiting.
- Tests: Vitest, Supertest, and mongodb-memory-server.

## Repository layout

```text
Ledger/
├── client/
│   └── src/
│       ├── components/   # Application pages and UI
│       └── lib/          # API client, formatting, calculations, motion
├── server/
│   └── src/
│       ├── middleware/   # Authentication, validation, rate limiting
│       ├── models/       # Users and finance records
│       ├── routes/       # REST API endpoints
│       └── services/     # Auto-SIP and AI services
└── .github/workflows/    # Continuous integration
```

## API overview

All API routes are prefixed with `/api`.

| Area | Main endpoints | Purpose |
| --- | --- | --- |
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `POST /auth/logout` | Account and session management |
| Transactions | `GET/POST /transactions`, `PUT/DELETE /transactions/:id`, `POST /transactions/import`, `GET /transactions/export` | Ledger entries and CSV workflows |
| Receipts | `POST/GET /transactions/:id/receipts` | Receipt attachments |
| Valuations | `GET/POST /valuations`, `DELETE /valuations/:id` | Monthly valuations |
| Investments | `GET/POST /investments`, `PUT/DELETE /investments/:id` | SIP and fund records |
| Bonds | `/bonds` | Bond records |
| Budgets | `/budgets` | Monthly budgets |
| Debts and bills | `/debts`, `/bills` | Financial obligations |
| Market | `GET /market/search?q=...`, `GET /market/:schemeCode` | Mutual-fund search and NAV proxy |
| Documents | `POST /documents/parse-payslip` | Payslip parsing suggestions |
| Ledger AI | `POST /ai/chat`, `GET /ai/history`, `POST /ai/share`, `GET /ai/share/:token` | AI chat and explicit expiring shares |
| Health | `GET /health`, `GET /ready` | Liveness and database readiness |

Transaction listing keeps the existing plain-array response when no query parameters are supplied. Callers can opt into pagination with `?page=1&limit=200`, or filter by `month` / `from` and `to`.

## Local development

From the repository root:

```bash
npm install
npm run install:all
```

Copy the safe environment templates:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Set `MONGODB_URI` and a strong `JWT_SECRET` only in `server/.env`. Set `VITE_API_URL` in `client/.env` when the API is not at `http://localhost:5000/api`.

Run both services:

```bash
npm run dev
```

Client: `http://localhost:5173`; API: `http://localhost:5000`.

Useful commands:

```bash
npm run dev:client
npm run dev:server
npm run build:client
npm run lint
npm run test
npm --prefix server run migrate:indexes
```

## Environment configuration

Required server values:

- `MONGODB_URI`
- `JWT_SECRET` (at least 32 characters in production)
- `CLIENT_ORIGIN` (comma-separated exact frontend origins, including scheme and port where applicable)
- `NODE_ENV`

Optional integrations include `GEMINI_API_KEY`, `GEMINI_MODEL`, and `GEMINI_TIMEOUT_MS`. MongoDB connection-pool settings can be tuned for the database tier and number of API instances.

Auto-SIP supports these optional environment variables (the defaults preserve the current behavior):

| Variable | Default | Purpose |
| --- | --- | --- |
| `AUTO_SIP_ENABLED` | enabled outside tests | Set `false` to disable |
| `AUTO_SIP_AMOUNT` | `1000` | Contribution amount in rupees |
| `AUTO_SIP_DAY` | `10` | Day of month (1–28); weekends move to Monday |
| `AUTO_SIP_START_MONTH` | `2026-11` | First eligible month |
| `AUTO_SIP_EXCLUDED_FUNDS` | `LIC MF Consumption` | Comma-separated, case-insensitive fund names used for eligibility/exclusion |

The current Auto-SIP configuration is global. Per-fund plans with independent amounts, dates, enable/disable controls, and a management UI are a separate enhancement and are not enabled by this release.

## Deployment

The intended production architecture is a static frontend plus a Node API:

1. Build `client/` with `npm run build:client` and publish `client/dist` (the existing deployment documentation uses Netlify).
2. Run `server/` on a Node-capable host such as Render.
3. Set `VITE_API_URL` to the public API URL, and configure the API's `CLIENT_ORIGIN` to the exact deployed frontend origin.

The checked-in `render.yaml` also defines an optional Render static-site service. Do not deploy two frontend copies unintentionally; choose one frontend host and keep `CLIENT_ORIGIN` aligned with it.

Never place `MONGODB_URI`, `JWT_SECRET`, or the Gemini API key in frontend environment variables. Vite-exposed variables are public.

## Security and operations

- Passwords are stored as bcrypt hashes.
- Authenticated API resources are scoped to the signed-in user.
- Logout increments a per-user token version, invalidating JWT cookies previously issued for that account.
- Unsafe API requests that include a browser `Origin` must match `CLIENT_ORIGIN`; requests without an Origin remain compatible with non-browser clients.
- Rate limits are process-local unless a shared store is configured; multi-instance deployments should use a shared limiter store.
- AI chat logs expire after 90 days; shared snapshots expire independently.
- Keep regular MongoDB backups and rotate credentials that have been exposed.

## Compatibility notes

Existing financial amounts remain stored in their current numeric representation. A rupee-to-paise migration must be separately versioned; changing the unit in-place would corrupt existing values. Transaction list consumers continue receiving arrays unless they explicitly request pagination.

## License

This project is provided for personal use and experimentation.
