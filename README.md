# Ledger

Ledger is a personal finance workspace for recording household cash flow and tracking savings, budgets, investments, bonds, debts, and bills. It combines a responsive React application with an authenticated Express API and MongoDB persistence.

The interface is organized like a modern digital ledger: month-based records and summaries, category-coded entries, charts and alerts, optional AI assistance, and responsive desktop and mobile navigation. Financial values are based on the records saved in Ledger unless a screen explicitly identifies data as coming from an external market-data source.

## Contents

- [Features](#features)
- [How the app is organized](#how-the-app-is-organized)
- [Technology](#technology)
- [Repository layout](#repository-layout)
- [Requirements](#requirements)
- [Run locally](#run-locally)
- [Configuration](#configuration)
- [API overview](#api-overview)
- [Testing and maintenance](#testing-and-maintenance)
- [Deployment](#deployment)
- [Security and data handling](#security-and-data-handling)
- [Known behavior and limitations](#known-behavior-and-limitations)

## Features

### Dashboard

- Review monthly income, needs, savings, spending, and remaining cash flow.
- Compare current monthly totals with the previous month.
- Explore cash-flow trends, recent transactions, and expense categories.
- Review tracked assets and other financial snapshot figures.
- Open the Financial Command Center for net-worth, savings-rate, financial-health, budget-usage, debt, bill, category, and trend summaries.
- Switch the Command Center between Today, This Week, This Month, Quarter, Year, and a custom month range.
- See alerts for budget limits, recurring entries ready to generate, overdue or upcoming bills, debt payments, and investment valuation freshness.
- Use the dashboard section rail to jump to Overview, Cash flow, Recent entries, Categories, or Insights. The rail tracks the section currently in view.

### Entries and cash flow

- Record entries in four modes: **Income**, **Needs**, **Savings**, and **Spending**.
- Add a category/type, amount, month, date, account, merchant, payment method, note, and recurring setting.
- Upload an optional JPEG, PNG, or PDF receipt (up to 5 MB) with an entry.
- Optionally upload a text-based PDF payslip (up to 5 MB) to suggest income fields. Review and edit the suggestion before saving; uploading a payslip does not submit an entry.
- Browse entries by month and mode, edit them, or delete them with a five-second Undo window.
- Import and export transactions as CSV. The export includes mode, type, amount, dates, account and merchant details, notes, and recurring metadata.
- Generate entries from recurring templates for a selected month. Generated records are linked to their source template so the same template is not generated twice for that month.

### Budgets and savings

- Create monthly category budgets by mode and type, then compare planned and actual amounts.
- Record monthly valuations for savings instruments and review their history and trends.
- Use the budget and savings pages to edit or remove saved records.

### SIP and investment tracking

- Record SIP contributions, additional contributions, and portfolio status snapshots by fund.
- Track invested amount, current value, date, asset class, units, XIRR, and optional benchmark return where relevant.
- Review totals, gain/loss, allocation, history, and illustrative growth scenarios.
- Search mutual-fund schemes and retrieve scheme/NAV history through the API market-data proxy.
- Keep status snapshots distinct from contribution totals: a status refresh updates the fund's displayed portfolio state rather than adding another monthly SIP contribution.
- The optional monthly Auto-SIP scheduler creates **ledger records only**. It does not place fund orders, transfer money, or interact with a brokerage.

### Bonds

- Track bond purchases and status/valuation records by issuer.
- Review principal, current value, returns, maturity information, and bonds approaching maturity.
- Search market-linked mutual-fund data from the bonds workspace where supported.

### Debts, bills, and payment tracking

- Record debts such as loans, credit cards, and EMIs with original and outstanding balances, interest, minimum payment, and due date.
- Create bills with amount, due date, category, and recurring status.
- See due-soon and overdue states, record payments, and review obligations without rewriting the original ledger entry history.
- The dashboard can surface due and overdue bill and debt alerts.

### Ledger AI

- Ask questions about the financial data saved in the signed-in Ledger account.
- Receive streamed responses and restore successful chat history after a reload or sign-in session change.
- Copy messages, start a fresh on-screen conversation, or explicitly create a read-only share snapshot.
- Share links contain only the selected conversation snapshot, do not expose account access, and expire after seven days. Anyone with the link can view the snapshot until it expires.
- Ledger AI requires a server-side Gemini API key. The rest of the application can be used without that integration.

### Accounts, navigation, and appearance

- Register, sign in, restore the current session, and sign out.
- Keep application records scoped to the signed-in user.
- Switch between light and dark themes; the selected theme is saved in browser local storage.
- Use the desktop sidebar, mobile top navigation, and mobile bottom navigation to move between Dashboard, Add Entry, All Entries, Budget, Savings Tracker, SIP Growth, Bonds, Obligations, and Ledger AI.
- Open explicitly shared Ledger AI snapshots without signing in.

### Motion and interaction

- Route changes and dashboard sections use short transitions and scroll-triggered reveals.
- A fixed progress line responds to page scroll without taking up layout space.
- Dashboard section navigation uses an animated active marker; cards, filters, buttons, and financial rows provide restrained hover, press, or enter/exit feedback.
- Charts and financial values use animated transitions where supported.
- Motion follows the operating system's reduced-motion preference. Animations are presentational; they do not change financial calculations, form submissions, routing, or saved data.

## How the app is organized

The browser application calls the `/api` service using credentialed requests. The API validates input, authenticates requests, scopes finance records to a user, and persists them in MongoDB. The client owns presentation, filtering, formatting, and chart rendering; the server owns persistence, authentication, validation, scheduled Auto-SIP record creation, market-data proxying, payslip text extraction, and AI requests.

```text
Browser
  └─ React / Vite client
       └─ HTTP API requests with the ledger_session cookie
            └─ Express API
                 ├─ Authentication and validation middleware
                 ├─ MongoDB / Mongoose models
                 ├─ Market-data proxy
                 ├─ Monthly Auto-SIP record scheduler
                 └─ Optional Gemini AI integration
```

## Technology

| Layer | Main tools |
| --- | --- |
| Client | React 19, Vite, React Router, React-Bootstrap, Bootstrap, Lucide |
| Charts and motion | Recharts, Framer Motion, Three.js |
| API | Node.js, Express 4, Mongoose, Zod |
| Authentication and security | JSON Web Tokens, bcryptjs, HTTP-only cookies, Helmet, CORS, express-rate-limit |
| External integrations | Gemini for Ledger AI; a server-side mutual-fund search/NAV data proxy |
| Tests | Vitest, Supertest, mongodb-memory-server |
| Hosting configuration | Netlify, Render, and GitHub Actions configuration files |

## Repository layout

```text
Ledger/
├── client/
│   ├── public/                 # Static assets
│   └── src/
│       ├── components/         # Pages, forms, tables, navigation, and shared UI
│       ├── lib/                # API client, calculations, formatting, and motion
│       ├── App.jsx             # Routes, session state, and shared financial data
│       ├── main.jsx            # React entry point and global motion settings
│       └── index.css           # Theme tokens and application-wide styling
├── server/
│   └── src/
│       ├── lib/                # CSV and payslip parsing helpers
│       ├── middleware/         # Authentication, validation, and rate limits
│       ├── models/             # User and finance data models
│       ├── routes/             # REST API routes
│       ├── services/           # Auto-SIP and AI services
│       ├── app.js              # Express app and middleware
│       └── index.js            # Environment validation, DB startup, scheduler
├── .github/workflows/          # CI workflows
├── netlify.toml                # Netlify client build and SPA fallback
├── render.yaml                 # Render API and optional static client services
└── package.json                # Root development and maintenance scripts
```

## Requirements

- A Node.js version supported by the Vite version in `client/package.json`.
- npm.
- MongoDB for persistent local or deployed use.
- Optional: a Gemini API key to enable Ledger AI.

## Run locally

Clone the repository and install the root and application dependencies:

```bash
npm install
npm run install:all
```

Create local environment files from the safe templates:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Set `MONGODB_URI`, a strong `JWT_SECRET`, and the local `CLIENT_ORIGIN` in `server/.env`. The client template defaults to `http://localhost:5000/api`; change `VITE_API_URL` if your API uses another address. Set the optional Gemini settings only if you want Ledger AI.

Start the client and API together:

```bash
npm run dev
```

- Client: <http://localhost:5173>
- API: <http://localhost:5000>
- Liveness check: <http://localhost:5000/api/health>
- Database readiness check: <http://localhost:5000/api/ready>

The API uses the `ledger` MongoDB database name. Register an account in the app to begin saving user-owned records.

### Useful scripts

Run these from the repository root:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run client and API in development |
| `npm run dev:client` | Run only the Vite client |
| `npm run dev:server` | Run only the API with Node watch mode |
| `npm run build:client` | Create the client production build in `client/dist` |
| `npm run lint` | Run ESLint on the client |
| `npm test` | Run server and client test suites |
| `npm --prefix server run migrate:indexes` | Run the server's index migration helper |

## Configuration

### Client

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:5000/api` | Base URL for the API. This is bundled into the public client, so it must never contain secrets. |

### Server

| Variable | Required | Default / purpose |
| --- | --- | --- |
| `MONGODB_URI` | Yes | MongoDB connection string. The app selects the `ledger` database. |
| `JWT_SECRET` | Yes | Secret for signing session tokens. Use at least 32 characters in production. |
| `CLIENT_ORIGIN` | Yes for deployment | Exact allowed frontend origins, comma-separated when more than one origin is needed. Include the scheme and port where applicable. |
| `NODE_ENV` | Recommended | Use `production` in deployment and `development` locally. |
| `PORT` | No | API listener port; defaults to `5000`. |
| `GEMINI_API_KEY` | No | Server-only Gemini key for Ledger AI. Do not prefix it with `VITE_` or put it in the client environment. |
| `GEMINI_MODEL` | No | Gemini model name; the example template uses `gemini-2.5-flash`. |
| `GEMINI_TIMEOUT_MS` | No | Ledger AI server request timeout; the example template uses `90000` ms. |
| `MONGODB_MAX_POOL_SIZE` | No | Maximum MongoDB connection pool size; the code default is `50`. |
| `MONGODB_MIN_POOL_SIZE` | No | Minimum MongoDB connection pool size; the code default is `5`. |
| `MONGODB_SOCKET_TIMEOUT_MS` | No | MongoDB socket timeout; the code default is `45000` ms. |
| `MONGODB_WAIT_QUEUE_TIMEOUT_MS` | No | MongoDB wait-queue timeout; the code default is `10000` ms. |
| `MONGODB_MAX_CONNECTING` | No | Maximum concurrent connection attempts; the code default is `10`. |
| `MONGODB_MAX_IDLE_TIME_MS` | No | Maximum idle connection time; the code default is `60000` ms. |
| `SHUTDOWN_TIMEOUT_MS` | No | Graceful shutdown timeout; the code default is `30000` ms. |

### Optional monthly Auto-SIP records

Auto-SIP is enabled by default outside test mode. It runs on API startup and hourly, uses India time (`Asia/Kolkata`), catches up after downtime, and is idempotent. A run creates one investment ledger record for each eligible fund per due month. A matching manual SIP/additional entry for the configured amount prevents a duplicate. The service only processes users who have at least one configured excluded fund; excluded fund names are not themselves auto-invested.

| Variable | Default | Purpose |
| --- | --- | --- |
| `AUTO_SIP_ENABLED` | Enabled outside tests | Set to `false` to disable; set to `true` to explicitly enable. |
| `AUTO_SIP_AMOUNT` | `1000` | Rupees recorded per eligible fund per month. |
| `AUTO_SIP_DAY` | `10` | Day of month, from 1 to 28. If it falls on a weekend, the run date moves to Monday. |
| `AUTO_SIP_START_MONTH` | `2026-11` | First eligible month in `YYYY-MM` format. Earlier months are not generated. |
| `AUTO_SIP_EXCLUDED_FUNDS` | `LIC MF Consumption` | Comma-separated fund names that qualify a user for the scheduler and are excluded from auto-created records. Matching ignores case and tolerates whitespace differences. |

The feature is a record-keeping convenience, not an investment order. Per-fund schedules with independent amounts or dates are not part of the current implementation.

## API overview

Application routes are prefixed with `/api`. Unless noted as public, application data routes require the signed-in user's session cookie and operate on that user's records.

| Area | Endpoints | Purpose |
| --- | --- | --- |
| Health | `GET /health`, `GET /ready` | Process liveness and MongoDB readiness |
| Authentication | `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `POST /auth/logout` | Create account, establish/check session, and sign out |
| Transactions | `GET/POST /transactions`, `PUT/DELETE /transactions/:id` | List, create, edit, and delete ledger entries |
| Recurring transactions | `POST /transactions/generate-recurring` | Generate entries from recurring templates for a requested month |
| CSV | `POST /transactions/import`, `GET /transactions/export` | Import or download transactions |
| Receipts | `POST/GET /transactions/:id/receipts`, `GET /transactions/:id/receipts/:receiptId` | Attach, list, and retrieve transaction receipts |
| Valuations | `GET/POST /valuations`, `DELETE /valuations/:id` | Read, upsert, or remove instrument valuations |
| Investments | `GET/POST /investments`, `PUT/DELETE /investments/:id` | Manage contributions and portfolio status records |
| Bonds | `GET/POST /bonds`, `PUT/DELETE /bonds/:id` | Manage bond records |
| Budgets | `GET/POST /budgets`, `DELETE /budgets/:id` | Read, upsert, and remove monthly budgets |
| Debts | `GET/POST /debts`, `PUT/DELETE /debts/:id` | Manage debt records |
| Bills | `GET/POST /bills`, `PUT/DELETE /bills/:id` | Manage bill records |
| Market data | `GET /market/search?q=...`, `GET /market/:schemeCode` | Mutual-fund scheme search and scheme/NAV data proxy |
| Payslips | `POST /documents/parse-payslip` | Extract a suggested salary entry from a text-based PDF |
| Ledger AI | `POST /ai/chat`, `GET /ai/history` | Stream an answer and retrieve successful chat history |
| Shared AI chat | `POST /ai/share`, `GET /ai/share/:token` | Create an expiring read-only snapshot; token read endpoint is public |

Transaction listing returns the existing plain-array response when no query parameters are supplied. Pagination can be requested with `?page=1&limit=200`; date filters include `month`, or `from` and `to` where supported.

## Testing and maintenance

Run all configured tests from the repository root:

```bash
npm test
```

The server suite uses Vitest, Supertest, and an in-memory MongoDB test server. Client utility tests use Vitest. Run the client lint and production build with:

```bash
npm run lint
npm run build:client
```

The GitHub Actions workflow in `.github/workflows/ci.yml` runs the repository's configured CI checks.

## Deployment

The repository supports a static client plus a Node API:

1. Build `client/` with `npm run build:client` and publish `client/dist`.
2. Run `server/` on a Node-capable host with MongoDB access.
3. Set the client's `VITE_API_URL` to the public API base URL, ending in `/api`.
4. Set the API's `CLIENT_ORIGIN` to the exact deployed client origin (scheme and hostname; no path).
5. Configure the MongoDB URI and JWT secret in the API host's secret/environment settings.

`netlify.toml` configures the client build and single-page-app fallback for Netlify. `render.yaml` defines a Render API service and an optional Render static client service. Choose the intended frontend host and make `VITE_API_URL` and `CLIENT_ORIGIN` agree with the actual deployed URLs before deployment. Do not configure both frontend services to serve production traffic accidentally.

## Security and data handling

- Passwords are stored as bcrypt hashes; the API issues a seven-day JWT in an HTTP-only cookie.
- Production cookies use `Secure` and `SameSite=None` for the separate client/API origins. State-changing browser requests are checked against `CLIENT_ORIGIN`.
- Logout increments the user's token version so previously issued tokens are rejected.
- Authenticated records are scoped to the signed-in user. Shared Ledger AI snapshots expose only their selected transcript, are read-only, use an unguessable token, and expire after seven days.
- Helmet, CORS allowlisting, input validation, and rate limits protect API routes. Authentication attempts, AI requests, shared-chat reads, and authenticated API traffic have separate limits.
- Receipt and payslip uploads are restricted by type and size. Payslip parsing extracts text and returns a suggestion; the user must review and save it.
- The Gemini key, JWT secret, and MongoDB URI belong only in server-side environment variables. Never commit them or expose them through a `VITE_` variable.
- AI chat logs are configured for 90-day expiry. Keep MongoDB backups and rotate credentials if they are exposed.

## Known behavior and limitations

- Ledger stores and displays financial records entered by the user. Investment values and projections are estimates; projections are scenarios, not guaranteed returns or live brokerage balances.
- Market-data availability depends on the upstream source and network. The proxy returns a temporary-unavailable error if the source cannot be reached.
- Auto-SIP creates database entries only. It does not buy securities, initiate payments, or guarantee a scheduler will run continuously; startup catch-up and idempotency reduce missed/duplicate ledger records.
- Process-local rate-limit counters reset when an API process restarts. Multi-instance deployments that need shared counters should configure a shared rate-limit store.
- Numeric amount representation remains compatible with existing saved data. A migration from rupees to paise must be versioned and applied separately; changing the unit in place would alter existing values.
- Transaction list response compatibility is intentional: existing callers receive an array unless they opt into pagination.
- Motion and decorative background effects are not required for form submission or navigation and respect reduced-motion preferences.

## License

This project is provided for personal use and experimentation.
