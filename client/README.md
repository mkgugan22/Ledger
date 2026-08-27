# Ledger — client

The React frontend. See the repo root README for the full setup (this app
needs the `server` API running to load or save any data — see `../server`).

## Stack

- **React 19** + **Vite** — app shell and dev tooling
- **React Router** — page navigation (`/`, `/add`, `/entries`, `/savings`)
- **React-Bootstrap** + **Bootstrap 5** — responsive layout and components
- **Recharts** — the category breakdown and savings trend charts
- **lucide-react** — icons
- Data comes from the `server` API (`src/lib/api.js`), which is backed by
  MongoDB. This app has no storage of its own.

## Project structure

```
client/
├── index.html
├── package.json
├── vite.config.js
├── .env.example              # copy to .env — VITE_API_URL
├── public/
│   └── favicon.svg
└── src/
    ├── main.jsx               # app entry point
    ├── App.jsx                # owns app state, talks to the API, routing
    ├── index.css               # theme: Bootstrap variable overrides
    ├── lib/
    │   ├── constants.js        # modes, colors
    │   ├── format.js           # date/currency/id helpers
    │   └── api.js               # fetch wrapper for the backend
    └── components/
        ├── layout/
        │   ├── Layout.jsx        # sidebar + navbar + page outlet
        │   ├── Sidebar.jsx       # desktop nav
        │   └── TopNavbar.jsx     # mobile nav (offcanvas)
        ├── shared/
        │   ├── PageHeader.jsx
        │   ├── MonthPicker.jsx
        │   └── EmptyState.jsx
        ├── dashboard/Dashboard.jsx
        ├── entry/AddEntry.jsx
        ├── entries/Entries.jsx
        └── savings/SavingsTracker.jsx
```

## Getting started

```bash
cp .env.example .env    # adjust VITE_API_URL if needed
npm install
npm run dev
```

Open the local URL Vite prints (usually `http://localhost:5173`). Make sure
the server (`../server`) is running too, or the app will show a connection
error banner.

## Build for production

```bash
npm run build
npm run preview   # sanity-check the production build locally
```

The build output lands in `dist/` — deploy that folder to any static host
(Vercel, Netlify, GitHub Pages, etc.), and point `VITE_API_URL` at your
deployed server's URL.

## Notes

- "Spending" is a logged category for real day-to-day expenses. "In hand" on
  the dashboard is calculated as `Income − Needs − Savings − Spending`.
