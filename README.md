# Ledger

A household expense and savings tracker — log income, needs, savings, and
spending by month, and track what your savings instruments (SIP, gold, etc.)
are worth over time. Data lives in MongoDB, behind a small API.

```
Ledger/
├── client/     # React + Vite + React-Bootstrap frontend
└── server/     # Express + Mongoose API, backed by MongoDB
```

See `client/README.md` and `server/README.md` for details on each half.

## Quick start (both apps together)

From the repo root:

```bash
npm install                 # installs "concurrently"
npm run install:all         # installs client + server dependencies
```

Then set up your environment files:

```bash
cp server/.env.example server/.env   # fill in MONGODB_URI
cp client/.env.example client/.env   # defaults to http://localhost:5000/api
```

Run both apps at once:

```bash
npm run dev
```

- Client: `http://localhost:5173`
- Server: `http://localhost:5000`

Or run them separately in two terminals: `npm run dev:server` and
`npm run dev:client`.

## Deploying

- **Client**: `npm run build:client` produces `client/dist` — deploy that as
  a static site (Vercel, Netlify, GitHub Pages, etc). Set `VITE_API_URL` at
  build time to point at your deployed server.
- **Server**: deploy `server/` to any Node host (Render, Railway, Fly.io,
  etc). Set `MONGODB_URI`, `PORT`, and `CLIENT_ORIGIN` as environment
  variables there — don't rely on a committed `.env` file, since it isn't
  committed at all.

## A note on the database credential

Never commit a real `MONGODB_URI` to this repo. Both `client/.env` and
`server/.env` are gitignored for exactly this reason — only the `.env.example`
files (with placeholders) are meant to be tracked. If your real connection
string has ever been shared outside your own `.env` file, rotate that
database user's password in MongoDB Atlas.

## Authentication and SIP growth

The app now requires an account. Passwords are stored as bcrypt hashes and the
session is an HTTP-only, seven-day cookie signed with `JWT_SECRET`. Copy
`server/.env.example` to `server/.env` and set a long random `JWT_SECRET`.

The `/sip-growth` page loads each signed-in user's investments from MongoDB and
displays NAV-based estimates. Scenario projections are explicitly illustrative
and are not guaranteed returns.

Investment, transaction, and valuation records are scoped to the signed-in
user. Existing MongoDB databases should recreate the valuation index as a
compound `{ user, month, instrument }` unique index (drop the old
`month_1_instrument_1` index once during migration if it exists).
Run `npm --prefix server run migrate:indexes` after installing dependencies to
apply that index migration automatically.

On the first authenticated request, if the database still has exactly one
user, records created before authentication are automatically backfilled to
that user. This makes existing July/August transactions and valuations visible
without exposing them once additional accounts are created.
