# Ledger — server

An Express + Mongoose API that stores your ledger entries in MongoDB. See the
repo root README for the full setup.

## Stack

- **Express** — HTTP server / routing
- **Mongoose** — MongoDB models and queries
- **dotenv** — loads `MONGODB_URI` etc. from `.env`
- **cors** — allows the client (a different origin during dev) to call this API

## Project structure

```
server/
├── package.json
├── .env.example          # copy to .env and fill in MONGODB_URI
└── src/
    ├── index.js           # Express app entry point
    ├── db.js              # Mongo connection
    ├── models/
    │   ├── Transaction.js # one entry: mode, type, amount, month, note
    │   └── Valuation.js   # one savings-instrument value snapshot per month
    └── routes/
        ├── transactions.js
        └── valuations.js
```

## Getting started

```bash
cp .env.example .env    # fill in your MongoDB connection string
npm install
npm run dev              # restarts on file changes
```

The API listens on `http://localhost:5000` by default (`PORT` in `.env`). In
production, your hosting provider supplies the public API URL and may supply
the port through `PORT`.

## Endpoints

| Method | Path                     | Description                              |
|--------|--------------------------|-------------------------------------------|
| GET    | `/api/health`            | `{ ok: true }` — check the server is up   |
| GET    | `/api/transactions`      | List all transactions                     |
| POST   | `/api/transactions`      | Create a transaction                      |
| PUT    | `/api/transactions/:id`  | Update a transaction                      |
| DELETE | `/api/transactions/:id`  | Delete a transaction                      |
| GET    | `/api/valuations`        | List all savings valuations                |
| POST   | `/api/valuations`        | Record a valuation (upserts by month+instrument) |
| DELETE | `/api/valuations/:id`    | Delete a valuation                        |

## Security notes

- `.env` is gitignored — **never commit it**. Only `.env.example` (with
  placeholder values) should go into version control.
- The MongoDB URI you share with anyone (including in a chat) should be
  treated as compromised — rotate the database user's password in Atlas if
  it's ever been pasted somewhere outside your own `.env` file.
- CORS is restricted to `CLIENT_ORIGIN` — set it to the exact HTTPS Netlify
  site URL when the client is deployed. Multiple origins may be separated by
  commas.
- Production sessions use a secure `SameSite=None` cookie so the Netlify
  frontend can authenticate against an API hosted on another domain. The API
  must be served over HTTPS in production.
