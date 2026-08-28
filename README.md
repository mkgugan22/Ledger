# Ledger

Ledger is a household money tracker for recording monthly income, needs,
savings, spending, investment contributions, and portfolio valuations. It has
a React/Vite frontend and an Express/Mongoose API backed by MongoDB.

## What the app includes

- **Dashboard** — monthly totals for income, needs, savings, spending, and
  money in hand, plus category and valuation trend charts.
- **Add Entry** — record an income, need, saving, or spending entry with a
  type, amount, month, and optional note.
- **All Entries** — filter entries by month and mode, edit them, or remove
  them.
- **Savings Tracker** — record one valuation per instrument and month, view
  the history chart, and delete obsolete valuations.
- **SIP Growth** — manage funds and contributions, compare invested value with
  the latest estimate, review gains, and explore illustrative 8%, 10%, and 12%
  projection scenarios. The projection is not a return guarantee.
- **Fund research** — search mutual-fund schemes and retrieve NAV history from
  the server-side market-data proxy.
- **Authentication** — register and sign in with a bcrypt-hashed password;
  sessions use a seven-day, HTTP-only JWT cookie.
- **Themes** — switch between light and dark mode. Tables, forms, charts,
  navigation, placeholders, and tooltips use theme-aware contrast colors.
- **Responsive layout** — the sidebar and mobile navigation adapt to smaller
  screens.

## Project structure

```text
Ledger/
├── client/                 # React 19 + Vite + React-Bootstrap frontend
│   ├── public/              # Static assets
│   └── src/
│       ├── components/      # Auth, layout, dashboard, entries, savings, SIP
│       └── lib/             # API client, constants, and formatting helpers
├── server/                 # Express + Mongoose API
│   └── src/
│       ├── middleware/      # JWT session guard
│       ├── models/          # User, Transaction, Valuation, Investment
│       └── routes/          # Auth, transactions, valuations, investments,
│                            # and mutual-fund market routes
└── package.json             # Workspace scripts
```

## Data model

Every user-owned record is scoped with a `user` reference:

- `User`: name, normalized email, and bcrypt password hash.
- `Transaction`: mode (`Income`, `Needs`, `Savings`, or `Spending`), type,
  amount, `YYYY-MM` month, and optional note.
- `Valuation`: `YYYY-MM` month, instrument name, and value. A compound unique
  index prevents duplicate instrument/month records for one user.
- `Investment`: fund, type (`SIP` or `Additional`), invested amount, current
  estimate, date, optional monthly contribution, NAV, and source.

Existing records created before authentication can be claimed automatically on
the first authenticated request when the database contains exactly one user.
This preserves legacy July/August data without exposing it across accounts.

## API routes

The server is mounted at `/api`:

| Area | Routes | Purpose |
| --- | --- | --- |
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `POST /auth/logout` | Account and session management |
| Transactions | `GET/POST /transactions`, `PUT/DELETE /transactions/:id` | Monthly ledger entries |
| Valuations | `GET/POST /valuations`, `DELETE /valuations/:id` | Instrument valuations |
| Investments | `GET/POST /investments`, `PUT/DELETE /investments/:id` | SIP and fund records |
| Market | `GET /market/search?q=...`, `GET /market/:schemeCode` | Mutual-fund scheme and NAV lookup |
| Health | `GET /health` | Server availability check |

## Local development

From the repository root:

```bash
npm install
npm run install:all
```

Create environment files from the safe templates:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Set the real MongoDB connection string and a long random JWT secret only in
`server/.env`. Set `VITE_API_URL` in `client/.env` if the API is not running at
`http://localhost:5000/api`.

Run both halves together:

```bash
npm run dev
```

The frontend runs at `http://localhost:5173` and the API at
`http://localhost:5000`.

Useful individual commands:

```bash
npm run dev:client
npm run dev:server
npm run build:client
npm --prefix client run lint
npm --prefix server run migrate:indexes
```

## Production deployment

This repository is intentionally split into two deployables:

1. **Frontend:** build `client/` with `npm run build:client` and publish
   `client/dist` as a static site. The build-time variable `VITE_API_URL` must
   point to the public API, for example `https://api.example.com/api`.
2. **API:** run `server/` on a Node-capable host with `MONGODB_URI`, `PORT`,
   `CLIENT_ORIGIN`, `JWT_SECRET`, and `NODE_ENV=production` configured there.

Netlify hosts the static frontend. Do not put `MONGODB_URI` or `JWT_SECRET` in
the frontend build; Vite variables are visible to browser users. Netlify only
needs the public `VITE_API_URL` value for this architecture.

## Security and repository hygiene

- Real `.env` files are ignored and must never be committed.
- `node_modules`, build output, and generated work directories are ignored.
- `.env.example` files contain placeholders only.
- Passwords are never stored in plaintext.
- API routes require the signed-in user's session and query only that user's
  records.
- If a database password or JWT secret has ever been shared outside its secret
  store, rotate it before production deployment.

## License

This project is provided for personal use and experimentation.
