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
│   └── helpers.js               # formatDate, formatDateTime, formatCurrency, calculateMargin,
│                                 # getMarginBadgeClass, getDaysOfStock, getStockStatus, escapeHtml
├── assets/
│   ├── css/
│   │   ├── styles.css           # design tokens (colors, type), buttons, badges, forms, toasts
│   │   ├── layout.css            # sidebar, navbar, page grid, tiered responsive breakpoints
│   │   └── components.css        # stat cards, ROP/EOQ panels, Telegram feed, tables, modals
│   ├── js/
│   │   ├── api.js                # fetch wrapper + per-endpoint client (cached, with timeout)
│   │   ├── app.js                 # routing, theme toggle, sidebar open/close, auto-refresh
│   │   ├── dashboard.js            # stats, ROP/EOQ panels, forecast chart, Telegram feed
│   │   ├── products.js             # product CRUD, margin column, search, validation
│   │   ├── inventory.js            # stock levels table, days-left column, search
│   │   ├── sales.js                 # record-sale form, date-range filter, revenue column
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
| GET | `/products/` | list products (includes current `stock`) |
| POST | `/products/` | create product |
| PUT | `/products/:id` | update product |
| DELETE | `/products/:id` | delete product |
| GET | `/inventory/` | stock levels, reorder points, safety stock |
| PUT | `/inventory/update` | set a product's stock quantity |
| POST | `/sales/` | record a sale |
| GET | `/sales/recent?days=N` | recent sales (N = 7/30/90 from the UI) |
| GET | `/inventory/alerts` | items at/under reorder point |
| GET | `/optimize/summary` | per-product EOQ |
| GET | `/sales/forecast/all` | `{ labels, values, days_ahead }` — per-product forecast, used for both the dashboard chart and the Inventory page's "Days Left" column |

All responses are JSON; errors are shown to the user via toast using either the response's
`error` field or a generic message.

## Theming

Light/dark mode is handled by toggling `data-theme="light" | "dark"` on `<html>` (see
`app.js`), with the actual colors defined as CSS custom properties in `styles.css`. To
restyle the whole app, edit the variables at the top of that file rather than hunting
through individual rules. Dark mode uses its own deeper, brighter-accented token set
(not just an inverted light theme) plus a subtle top-highlight gradient on cards.

## Browser-side state

- Theme preference: `localStorage['io-dss-theme']`
- Telegram alert history: `localStorage['io_dss_tg_history']` (deduplicated, capped at 200
  entries) — a client-side mirror of ROP alerts for demo purposes; a real Telegram bot
  integration would replace this with alerts actually sent by your backend.
- Cleared-alert snapshot: `localStorage['io_dss_tg_cleared_snapshot']` — records which
  exact (product, stock) breach was active when "Clear history" was last clicked, so that
  breach doesn't immediately reappear on the next refresh. It resets automatically once a
  genuinely new alert comes in.

## Recent additions (round 2)

- **Alert history "Clear" now actually sticks.** Previously, clearing Telegram alert
  history worked only until the next dashboard refresh — since the underlying low-stock
  condition hadn't changed, the same alert immediately got re-added. A cleared breach is
  now snapshotted and suppressed until the stock actually changes.
- **Profit margin badges** on the Products page now show 🔼 for a profit and 🔽 for a
  loss, alongside the existing color coding.
- **Dark mode revamp**: deeper background, brighter teal/amber/red accents, and a subtle
  top-highlight on cards for a lit-panel feel instead of a flat inversion. The forecast
  chart's color scheme now matches the app's teal brand instead of a generic blue.
- **Fixed a real responsive bug**: a classic CSS Grid gotcha (a grid track won't shrink
  below its content's natural width unless told to) meant wide tables were quietly
  forcing the *entire page* to scroll horizontally on narrow screens, instead of just the
  table scrolling within its own frame. Fixed with `minmax(0, 1fr)` on the grid columns.
- Full responsive pass down to ~240px wide (tested): tiered breakpoints at
  880 / 640 / 420 / 300px progressively shrink padding, font sizes, and the stat grid's
  column count; the "Admin" label hides below 640px (icon stays); tables always scroll
  within their own wrapper rather than the page.

## Recent additions (round 1)

- **Products**: profit margin column (amount + %, color-coded), live search, client-side
  form validation (trim/length/NaN/negative checks) before any request fires.
- **Inventory**: a "Days Left" column (stock ÷ forecasted daily demand, derived from
  `/sales/forecast/all`), live search, validated stock-update form.
- **Sales**: date-range filter (7/30/90 days), a Revenue column and running total per
  range, and full date+time display down to the second — revenue is estimated using each
  product's *current* price, since sale records don't store a historical unit price.
- **Dashboard**: Inventory Value and Revenue (30d) stat cards, a delta vs. the previous
  30-day period, and a Top Products (by revenue) panel.
- Fixed a pre-existing bug where the ROP/EOQ error banners, once shown, never hid
  themselves again on a later successful load.

## Related pieces (from the same project, delivered separately)

- **Backend sync to Google Sheets** via Apps Script (`Code.gs` + `sheets_sync_service.py`)
  — mirrors the backend's own data into a Sheet for reporting/forecasting input.
- **Development blueprint** — full architecture, Sheets schema, and phased build plan for
  the Telegram bot + forecasting layer this dashboard is the frontend for.
