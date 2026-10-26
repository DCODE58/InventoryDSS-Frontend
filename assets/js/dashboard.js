// ─── Alert history (persisted in localStorage) ──────────────────────────────
// A local mirror of reorder alerts seen by this browser — NOT a delivery log of
// Telegram messages sent by the backend.
const TG_HISTORY_KEY  = 'io_dss_tg_history';
const TG_CLEARED_KEY  = 'io_dss_tg_cleared_snapshot';
const TG_MAX_ITEMS    = 200;

// The most recent ROP alerts the dashboard has seen, kept in memory so
// "Clear history" can snapshot exactly which breaches were dismissed.
let lastKnownRopAlerts = [];

function getTgHistory() {
    try { return JSON.parse(localStorage.getItem(TG_HISTORY_KEY) || '[]'); }
    catch (_) { return []; }
}
function saveTgHistory(history) {
    try { localStorage.setItem(TG_HISTORY_KEY, JSON.stringify(history.slice(0, TG_MAX_ITEMS))); }
    catch (_) {}
}

/** { product_name: stock } for every breach that was active at the moment of the last "Clear history" click. */
function getClearedSnapshot() {
    try { return JSON.parse(localStorage.getItem(TG_CLEARED_KEY) || '{}'); }
    catch (_) { return {}; }
}

/**
 * Append new ROP alerts to the persistent history.
 *
 * Dedup rule: an alert for the same product is suppressed if one already
 * exists that was recorded within the last 30 minutes AND still has the
 * same stock level. The same alert therefore doesn't stack up on every
 * auto-refresh; if stock changes, a new entry IS recorded.
 *
 * Cleared-breach rule: if the user cleared history while this exact
 * (product, stock) breach was active, it's skipped — it would otherwise
 * reappear on the very next refresh. It comes back only once stock moves.
 */
function mergeTgAlerts(ropAlerts) {
    const history = getTgHistory();
    const clearedSnapshot = getClearedSnapshot();
    const now = new Date();
    const DEDUP_MS = 30 * 60 * 1000;
    let addedAny = false;

    ropAlerts.forEach((alert) => {
        if (clearedSnapshot[alert.product_name] === alert.stock) return;

        const recent = history.find((h) =>
            h.product_name === alert.product_name &&
            h.stock === alert.stock &&
            (now - new Date(h.ts)) < DEDUP_MS
        );
        if (!recent) {
            history.unshift({
                key:           `${alert.product_name}::${now.toISOString()}`,
                product_name:  alert.product_name,
                stock:         alert.stock,
                reorder_point: alert.reorder_point,
                severity:      alert.severity || 'low',
                ts:            now.toISOString(),
            });
            addedAny = true;
        }
    });

    // A genuinely new breach came in — the cleared snapshot is stale now.
    if (addedAny) {
        try { localStorage.removeItem(TG_CLEARED_KEY); } catch (_) {}
    }

    const merged = history.slice(0, TG_MAX_ITEMS);
    saveTgHistory(merged);
    return merged;
}

// ─── Dashboard state ─────────────────────────────────────────────────────────
let dashLoading = null;         // in-flight load (prevents overlapping refreshes)
let dashLastSuccess = null;     // Date of the last load in which EVERY section succeeded
let lastAlertSig = null;        // signature of the alert set last toasted about
let lastForecast = null;        // kept so charts can redraw on theme change
const dashRendered = { alerts: false, stats: false, eoq: false, forecast: false, revenue: false };

const $d = (id) => document.getElementById(id);

function showDashboardSkeletons() {
    if (!dashRendered.alerts)   { $d('rop-alerts-list').innerHTML = ui.skeleton(3); ui.setKpiLoading('reorder-alerts'); $d('telegram-preview').innerHTML = ui.skeleton(2); }
    if (!dashRendered.stats)    { ['total-products', 'low-stock', 'inventory-value'].forEach(ui.setKpiLoading); }
    if (!dashRendered.eoq)      { $d('eoq-list').innerHTML = ui.skeleton(3); }
    if (!dashRendered.forecast) { ui.setKpiLoading('forecast-demand'); ui.chartState('forecast-container', 'loading'); }
    if (!dashRendered.revenue)  { ui.setKpiLoading('revenue-30d'); $d('top-products-list').innerHTML = ui.skeleton(3); }
}

// ─── Stats cards ─────────────────────────────────────────────────────────────
function computeInventoryValue(products, inventory) {
    if (!products) return null;
    const withStock = products.filter((p) => helpers.toNumber(p.stock) !== null);
    if (withStock.length) {
        return withStock.reduce((sum, p) => sum + p.stock * (helpers.toNumber(p.cost) ?? 0), 0);
    }
    // Products carry no stock field → join inventory stock with product cost.
    if (inventory) {
        const costById = {};
        products.forEach((p) => { costById[p.product_id] = helpers.toNumber(p.cost) ?? 0; });
        return inventory.reduce((sum, i) => sum + (helpers.toNumber(i.stock) ?? 0) * (costById[i.product_id] ?? 0), 0);
    }
    return null;
}

async function sectionStats() {
    const [pRes, iRes] = await Promise.allSettled([api.getProducts(), api.getInventory()]);
    const products  = pRes.status === 'fulfilled' ? pRes.value : null;
    const inventory = iRes.status === 'fulfilled' ? iRes.value : null;

    const apply = (id, value) => { if (value !== null || !dashRendered.stats) ui.setKpi(id, value); };
    apply('total-products', products ? helpers.formatNumber(products.length) : null);
    apply('low-stock', inventory
        ? helpers.formatNumber(inventory.filter((i) => {
            const s = helpers.toNumber(i.stock), r = helpers.toNumber(i.reorder_point);
            return s !== null && r !== null && s <= r;
        }).length)
        : null);
    const value = computeInventoryValue(products, inventory);
    apply('inventory-value', value === null ? null : helpers.formatCurrency(value));

    const ok = !!products && !!inventory;
    if (ok) dashRendered.stats = true;
    return ok;
}

// ─── Revenue + top products ──────────────────────────────────────────────────
/**
 * Revenue (current 30d) vs the previous 30d, plus a top-5-by-revenue list.
 * One request for 60 days of sales, split client-side into two windows.
 * Revenue uses each product's CURRENT price (sales don't store a historical
 * unit price), so it is an estimate wherever prices have since changed.
 */
async function sectionRevenue() {
    const revenueEl = $d('revenue-30d');
    const deltaEl = $d('revenue-delta');
    const topListEl = $d('top-products-list');
    try {
        const [sales, products] = await Promise.all([api.getRecentSales(60), api.getProducts()]);
        const priceById = {};
        products.forEach((p) => { priceById[p.product_id] = helpers.toNumber(p.price); });

        const now = Date.now();
        const DAY_MS = 86400000;
        let current = 0, previous = 0, unpriced = 0;
        const revenueByProduct = {};

        sales.forEach((sale) => {
            const price = priceById[sale.product_id];
            const qty = helpers.toNumber(sale.quantity);
            const when = new Date(sale.date).getTime();
            if (price === null || price === undefined || qty === null || isNaN(when)) { unpriced++; return; }
            const revenue = qty * price;
            const ageDays = (now - when) / DAY_MS;
            if (ageDays <= 30) {
                current += revenue;
                revenueByProduct[sale.product_name] = (revenueByProduct[sale.product_name] || 0) + revenue;
            } else if (ageDays <= 60) {
                previous += revenue;
            }
        });

        ui.setKpi('revenue-30d', helpers.formatCurrency(current));
        if (previous > 0) {
            const pct = ((current - previous) / previous) * 100;
            const up = pct >= 0;
            deltaEl.textContent = `${up ? '▲ Up' : '▼ Down'} ${Math.abs(pct).toFixed(1)}% vs previous 30 days`;
            deltaEl.className = `stat-delta ${up ? 'up' : 'down'}`;
        } else {
            deltaEl.textContent = current > 0 ? 'No prior-period sales to compare' : '';
            deltaEl.className = 'stat-delta';
        }

        const top5 = Object.entries(revenueByProduct).sort((a, b) => b[1] - a[1]).slice(0, 5);
        if (!top5.length) {
            ui.renderState(topListEl, { kind: 'empty', icon: 'fa-receipt', title: 'No sales in the last 30 days', text: 'Record a sale to see your top products here.' });
        } else {
            topListEl.innerHTML = '<ol class="row-list" style="list-style:none;padding:0;margin:0">' + top5.map(([name, revenue], i) => `
                <li class="row-item">
                    <div class="row-main"><span class="row-rank" aria-hidden="true">${i + 1}</span><span class="row-name">${escapeHtml(name)}</span></div>
                    <span class="row-value">${helpers.formatCurrency(revenue)}</span>
                </li>`).join('') + '</ol>' +
                (unpriced ? `<p class="card-foot">${unpriced} sale${unpriced !== 1 ? 's' : ''} for products no longer in the catalogue ${unpriced !== 1 ? 'are' : 'is'} left out.</p>` : '');
        }
        dashRendered.revenue = true;
        return true;
    } catch (error) {
        console.error('Revenue/top-products update failed:', error);
        if (!dashRendered.revenue) {
            ui.setKpi('revenue-30d', null);
            deltaEl.textContent = '';
            ui.renderState(topListEl, { kind: 'error', title: 'Top products unavailable', text: 'The sales data could not be loaded.', actionLabel: 'Try again', onAction: () => loadDashboard(false) });
        }
        return false;
    }
}

// ─── ROP alerts panel ────────────────────────────────────────────────────────
function alertSignature(alerts) {
    return alerts.map((a) => `${a.product_name}:${a.stock}`).sort().join('|');
}

function renderRopAlerts(alerts) {
    const container = $d('rop-alerts-list');
    if (!alerts.length) {
        ui.renderState(container, { kind: 'empty', icon: 'fa-circle-check', title: 'No reorder alerts', text: 'Every product is above its reorder point.' });
        return;
    }
    container.innerHTML = '<ul class="row-list">' + alerts.map((alert) => {
        const critical = alert.severity === 'critical';
        return `<li class="row-item ${critical ? 'sev-critical' : 'sev-low'}">
            <div class="row-main"><span class="row-name">${escapeHtml(alert.product_name)}</span></div>
            <div class="row-meta">
                <span class="badge ${critical ? 'badge-danger' : 'badge-warning'}"><i class="fas ${critical ? 'fa-circle-exclamation' : 'fa-triangle-exclamation'}" aria-hidden="true"></i>${critical ? 'Critical' : 'Low stock'}</span>
                <span>Stock <strong>${escapeHtml(alert.stock)}</strong></span>
                <span>Reorder point <strong>${escapeHtml(alert.reorder_point)}</strong></span>
            </div>
        </li>`;
    }).join('') + '</ul>';
}

async function sectionAlerts() {
    try {
        const alerts = await api.getROPAlerts();
        renderRopAlerts(alerts);
        ui.setKpi('reorder-alerts', helpers.formatNumber(alerts.length));
        renderTelegramFeed(alerts);

        // Only warn when the set of alerts actually changed.
        const sig = alertSignature(alerts);
        if (alerts.length && sig !== lastAlertSig) toast.warning(`${alerts.length} product${alerts.length !== 1 ? 's' : ''} need reordering`);
        lastAlertSig = sig;
        dashRendered.alerts = true;
        return true;
    } catch (error) {
        console.error('ROP alerts failed:', error);
        if (!dashRendered.alerts) {
            ui.renderState($d('rop-alerts-list'), { kind: 'error', title: 'Alerts unavailable', text: 'Reorder alerts could not be loaded.', actionLabel: 'Try again', onAction: () => loadDashboard(false) });
            ui.setKpi('reorder-alerts', null);
            renderTelegramFeed(null);   // still show locally stored history
        }
        return false;
    }
}

// ─── EOQ panel ───────────────────────────────────────────────────────────────
async function sectionEOQ() {
    const container = $d('eoq-list');
    try {
        const summary = await api.getEOQ();
        if (!summary.length) {
            ui.renderState(container, { kind: 'empty', title: 'No EOQ recommendations', text: 'The server returned no economic order quantities.' });
        } else {
            container.innerHTML = '<ul class="row-list">' + summary.map((item) => {
                const eoq = helpers.toNumber(item.eoq);
                return `<li class="row-item">
                    <div class="row-main"><span class="row-name">${escapeHtml(item.product_name)}</span></div>
                    <span class="row-value">${eoq === null ? '<span class="muted">Not available</span>' : `Order ${helpers.formatNumber(Math.round(eoq))} units`}</span>
                </li>`;
            }).join('') + '</ul>';
        }
        dashRendered.eoq = true;
        return true;
    } catch (error) {
        console.error('EOQ update failed:', error);
        if (!dashRendered.eoq) ui.renderState(container, { kind: 'error', title: 'EOQ data unavailable', text: 'Recommendations could not be loaded.', actionLabel: 'Try again', onAction: () => loadDashboard(false) });
        return false;
    }
}

// ─── Forecast chart ──────────────────────────────────────────────────────────
const FORECAST_TOP_N = 12;

function renderForecast(forecast) {
    const horizon = helpers.toNumber(forecast.days_ahead);
    const pairs = forecast.labels
        .map((label, i) => ({ label: String(label), value: helpers.toNumber(forecast.values[i]) }))
        .filter((p) => p.value !== null);

    $d('forecast-note').textContent = horizon ? `Units across all products, next ${horizon} days` : 'Units across all products';
    $d('forecast-sub').textContent = horizon
        ? `Forecast units per product over the next ${horizon} days, as returned by the forecast service.`
        : 'Forecast units per product, as returned by the forecast service.';

    if (!pairs.length) {
        ui.setKpi('forecast-demand', null, 'No data yet');
        ui.destroyChart('forecast');
        ui.chartState('forecast-container', 'empty', { title: 'No forecast yet', text: 'A forecast appears once sales have been recorded.' });
        ui.setChartText({ summaryId: 'forecast-summary', summaryText: '', canvasId: 'forecast-chart', dataId: 'forecast-data' });
        return;
    }

    const total = pairs.reduce((s, p) => s + p.value, 0);
    ui.setKpi('forecast-demand', helpers.formatNumber(Math.round(total)));

    pairs.sort((a, b) => b.value - a.value);
    const shown = pairs.slice(0, FORECAST_TOP_N);
    const unit = horizon ? `units over ${horizon} days` : 'units';

    ui.chartState('forecast-container', 'ready');
    $d('forecast-container').querySelector('.chart-wrapper').style.height = `${Math.max(220, shown.length * 34 + 72)}px`;

    const th = ui.chartTheme();
    ui.mountChart('forecast', $d('forecast-chart'), {
        type: 'bar',
        data: {
            labels: shown.map((p) => p.label),
            datasets: [{
                label: `Forecast demand (${unit})`,
                data: shown.map((p) => p.value),
                backgroundColor: ui.alpha(th.accent, 0.78),
                hoverBackgroundColor: th.accentHover,
                borderRadius: 4,
                maxBarThickness: 22,
            }],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            animation: ui.reducedMotion() ? false : { duration: 450 },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: th.tooltipBg, titleColor: th.strong, bodyColor: th.text,
                    borderColor: th.border, borderWidth: 1, padding: 10, cornerRadius: 8,
                    callbacks: { label: (c) => ` ${helpers.formatNumber(Math.round(c.parsed.x))} ${unit}` },
                },
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: { color: th.grid }, border: { display: false },
                    ticks: { color: th.muted, precision: 0, font: { family: th.font } },
                    title: { display: true, text: `Forecast demand (${unit})`, color: th.text, font: { family: th.font } },
                },
                y: {
                    grid: { display: false }, border: { display: false },
                    ticks: {
                        color: th.text, autoSkip: false, font: { family: th.font },
                        callback(v) { const l = this.getLabelForValue(v); return l.length > 24 ? `${l.slice(0, 23)}…` : l; },
                    },
                },
            },
        },
    });

    const top3 = shown.slice(0, 3).map((p) => `${p.label} (${helpers.formatNumber(Math.round(p.value))})`).join(', ');
    ui.setChartText({
        summaryId: 'forecast-summary',
        summaryText: `Forecast demand totals ${helpers.formatNumber(Math.round(total))} ${unit} across ${pairs.length} product${pairs.length !== 1 ? 's' : ''}. Highest: ${top3}.` +
            (pairs.length > shown.length ? ` The chart shows the top ${shown.length}; the table lists all ${pairs.length}.` : ''),
        canvasId: 'forecast-chart',
        dataId: 'forecast-data',
        headers: ['Product', `Forecast (${unit})`],
        rows: pairs.map((p) => [p.label, helpers.formatNumber(Math.round(p.value))]),
    });
}

async function sectionForecast() {
    try {
        lastForecast = await api.getForecast();
        renderForecast(lastForecast);
        dashRendered.forecast = true;
        return true;
    } catch (error) {
        console.error('Forecast update failed:', error);
        if (!dashRendered.forecast) {
            ui.setKpi('forecast-demand', null);
            ui.destroyChart('forecast');
            ui.chartState('forecast-container', 'error', { title: 'Forecast unavailable', text: 'The forecast could not be loaded.', actionLabel: 'Try again', onAction: () => loadDashboard(false) });
            ui.setChartText({ summaryId: 'forecast-summary', summaryText: '', canvasId: 'forecast-chart', dataId: 'forecast-data' });
        }
        return false;
    }
}

// ─── Alert history feed ──────────────────────────────────────────────────────
/** Pass the live alerts to merge them into history, or null to just show stored history. */
function renderTelegramFeed(ropAlerts) {
    if (ropAlerts) lastKnownRopAlerts = ropAlerts;
    const history = (ropAlerts && ropAlerts.length > 0) ? mergeTgAlerts(ropAlerts) : getTgHistory();

    const box = $d('telegram-preview');
    if (!box) return;

    if (!history.length) {
        ui.renderState(box, { kind: 'empty', icon: 'fa-bell-slash', title: 'No alerts recorded yet', text: 'Reorder alerts seen on this dashboard will be listed here.' });
        return;
    }

    box.innerHTML = `
        <div class="feed-toolbar">
            <span class="feed-count">${history.length} alert${history.length !== 1 ? 's' : ''} recorded in this browser</span>
            <button type="button" class="btn btn-secondary btn-sm" data-action="clear-history"><i class="fas fa-trash-can" aria-hidden="true"></i>Clear history</button>
        </div>
        <ul class="feed">
            ${history.map((h) => {
                const critical = h.severity === 'critical';
                return `<li class="feed-item">
                    <span class="feed-icon" aria-hidden="true"><i class="fab fa-telegram"></i></span>
                    <div class="feed-body">
                        <strong>${escapeHtml(h.product_name)}</strong>
                        <div class="feed-detail">Stock ${escapeHtml(h.stock)}, reorder point ${escapeHtml(h.reorder_point)}</div>
                    </div>
                    <span class="badge ${critical ? 'badge-danger' : 'badge-warning'}"><i class="fas ${critical ? 'fa-circle-exclamation' : 'fa-triangle-exclamation'}" aria-hidden="true"></i>${critical ? 'Critical' : 'Low stock'}</span>
                    <time class="feed-time" datetime="${escapeHtml(h.ts)}" title="${escapeHtml(formatTgTimeFull(h.ts))}">${escapeHtml(formatTgTimeRelative(h.ts))}</time>
                </li>`;
            }).join('')}
        </ul>`;
}

async function clearTgHistory(opener) {
    const ok = await ui.confirm({
        title: 'Clear alert history?',
        message: 'This removes the alert history stored in this browser. Alerts that are still active will not reappear until their stock level changes.',
        confirmLabel: 'Clear history',
        opener,
    });
    if (!ok) return;

    // Remember exactly which breaches were active right now so they don't
    // immediately repopulate the (now-empty) history on the next refresh.
    const snapshot = {};
    lastKnownRopAlerts.forEach((a) => { snapshot[a.product_name] = a.stock; });
    try { localStorage.setItem(TG_CLEARED_KEY, JSON.stringify(snapshot)); } catch (_) {}
    try { localStorage.removeItem(TG_HISTORY_KEY); } catch (_) {}
    renderTelegramFeed([]);
    toast.info('Alert history cleared');
}
window.clearTgHistory = clearTgHistory;

/** "X min/h ago" for recent entries; full date for anything older than 24 h. */
function formatTgTimeRelative(isoStr) {
    if (!isoStr) return '—';
    const diffMs = Date.now() - new Date(isoStr).getTime();
    if (isNaN(diffMs)) return '—';
    if (diffMs < 0) return formatTgTimeFull(isoStr);
    if (diffMs <     60_000) return 'just now';
    if (diffMs <  3_600_000) return `${Math.floor(diffMs / 60_000)} min ago`;
    if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)} h ago`;
    return formatTgTimeFull(isoStr);
}
function formatTgTimeFull(isoStr) {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── Main loader ─────────────────────────────────────────────────────────────
function setDashStatus(allOk) {
    const el = $d('dash-status');
    if (!el) return;
    el.classList.toggle('is-warning', !allOk);
    if (allOk) {
        el.innerHTML = `<i class="fas fa-circle-check" aria-hidden="true"></i>Updated ${helpers.formatTime(dashLastSuccess)}`;
    } else {
        el.innerHTML = `<i class="fas fa-triangle-exclamation" aria-hidden="true"></i>Some data couldn't be refreshed` +
            (dashLastSuccess ? `. Last full update ${helpers.formatTime(dashLastSuccess)}` : '');
    }
}

/** Never throws. Overlapping calls share the in-flight load. */
function loadDashboard(silent = false) {
    if (dashLoading) return dashLoading;
    dashLoading = (async () => {
        showDashboardSkeletons();
        const results = await Promise.all([sectionAlerts(), sectionStats(), sectionEOQ(), sectionForecast(), sectionRevenue()]);
        const allOk = results.every(Boolean);
        if (allOk) dashLastSuccess = new Date();
        setDashStatus(allOk);
        if (!allOk && !silent) toast.error('Some dashboard data could not be loaded. Check your connection and try again.');
        return allOk;
    })().finally(() => { dashLoading = null; });
    return dashLoading;
}
window.loadDashboard = loadDashboard;

document.addEventListener('DOMContentLoaded', () => {
    $d('dash-refresh').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        if (btn.disabled) return;
        ui.setBusy(btn, true, 'Refreshing…');
        invalidateCache(CACHE_KEYS.PRODUCTS, CACHE_KEYS.INVENTORY, CACHE_KEYS.SALES_PREFIX, CACHE_KEYS.ROP_ALERTS, CACHE_KEYS.EOQ_SUMMARY, CACHE_KEYS.FORECAST);
        const ok = await loadDashboard(false);
        ui.setBusy(btn, false);
        if (ok) toast.success('Dashboard refreshed');
    });
    $d('telegram-preview').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="clear-history"]');
        if (btn) clearTgHistory(btn);
    });
    window.addEventListener('themechange', () => { if (lastForecast && dashRendered.forecast) renderForecast(lastForecast); });
});
