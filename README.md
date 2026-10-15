# IO-DSS — Inventory Decision Support System (Frontend)

A plain HTML/CSS/JavaScript dashboard for a small-retail inventory system: product and
stock management, sales recording, reorder-point (ROP) alerts, EOQ recommendations,
a 30-day demand forecast chart, and a Telegram alert feed.

No build step, no framework, no bundler — open `index.html` in a browser (via a local
server, see below) and it runs.

## File tree

```
InventoryDSS-Frontend/
├── index.html                  # all four pages (dashboard/products/inventory/sales) + modals
├── config/
│   └── config.js               # API_BASE_URL — point this at your backend
├── utils/
│   ├── constants.js             # shared constants (ALERT_LEVELS, EOQ defaults)
│   └── helpers.js               # formatDate, formatCurrency, getStockStatus, escapeHtml
├── assets/
│   ├── css/
│   │   ├── styles.css           # design tokens (colors, type), buttons, badges, forms, toasts
│   │   ├── layout.css            # sidebar, navbar, page grid, responsive breakpoints
│   │   └── components.css        # stat cards, ROP/EOQ panels, Telegram feed, tables, modals
│   ├── js/
│   │   ├── api.js                # fetch wrapper + per-endpoint client (cached, with timeout)
│   │   ├── app.js                 # routing, theme toggle, sidebar open/close, auto-refresh
│   │   ├── dashboard.js            # stats, ROP/EOQ panels, forecast chart, Telegram feed
│   │   ├── products.js             # product CRUD + modal
│   │   ├── inventory.js            # stock levels table + stock-update modal
│   │   ├── sales.js                 # record-sale form + recent sales table
│   │   ├── toast.js                 # toast notification manager
│   │   └── constants.js             # (legacy duplicate of utils/constants.js — see note below)
│   ├── icons/icons.svg            # inline icon sprite (Font Awesome is used via CDN in index.html)
│   └── images/logo.png
└── README.md
```

> **Note:** `assets/js/constants.js` and `utils/constants.js` both exist in this project —
> only one is actually loaded (check the `<script>` order in `index.html`). Safe to delete
> whichever one your `app.js`/other modules don't reference, if you want to tidy this up.

## Setup

1. Open `config/config.js` and point `API_BASE_URL` at your backend:
   ```js
   const API_BASE_URL = 'https://your-backend.onrender.com/api';
   // or for local dev:
   const API_BASE_URL = 'http://localhost:5000/api';
   ```
2. Serve the folder with any static server (opening `index.html` directly via `file://`
   will break `fetch()` calls in some browsers):
   ```
   python -m http.server 8000
   # or
   npx serve .
   ```
3. Visit `http://localhost:8000`.

## Expected backend API

The frontend assumes these endpoints exist (see `assets/js/api.js` for exact usage):

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/products/` | list products |
| POST | `/products/` | create product |
| PUT | `/products/:id` | update product |
| DELETE | `/products/:id` | delete product |
| GET | `/inventory/` | stock levels, reorder points, safety stock |
| PUT | `/inventory/update` | set a product's stock quantity |
| POST | `/sales/` | record a sale |
| GET | `/sales/recent?days=N` | recent sales |
| GET | `/inventory/alerts` | items at/under reorder point |
| GET | `/optimize/summary` | per-product EOQ |
| GET | `/sales/forecast/all` | `{ labels: [...], values: [...] }` for the forecast chart |

All responses are JSON; errors are shown to the user via toast using either the response's
`error` field or a generic message.

## Theming

Light/dark mode is handled by toggling `data-theme="light" | "dark"` on `<html>` (see
`app.js`), with the actual colors defined as CSS custom properties in `styles.css`. To
restyle the whole app, edit the variables at the top of that file rather than hunting
through individual rules.

## Browser-side state

- Theme preference: `localStorage['io-dss-theme']`
- Telegram alert history: `localStorage['io_dss_tg_history']` (deduplicated, capped at 200
  entries) — this is a client-side mirror of ROP alerts for demo purposes; a real Telegram
  bot integration would replace this with alerts actually sent by your backend.

## Related pieces (from the same project, delivered separately)

- **Backend sync to Google Sheets** via Apps Script (`Code.gs` + `appscript_sync.py`) —
  mirrors Supabase data into a Sheet for reporting/forecasting input.
- **Development blueprint** — full architecture, Sheets schema, and phased build plan for
  the Telegram bot + forecasting layer this dashboard is the frontend for.
