let forecastChart = null;

// ─── Telegram alert history (persisted in localStorage) ───────────────────
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
 * same stock level.  This means:
 *  - The same alert won't stack up on every 10-second auto-refresh.
 *  - If stock changes (restocked then drops again), a new entry IS recorded
 *    with the correct new timestamp.
 *
 * Cleared-breach rule: if the user cleared history while this exact
 * (product, stock) breach was active, it's skipped entirely — it would
 * otherwise reappear on the very next refresh, since the underlying low-stock
 * condition hasn't changed. It only comes back once the stock actually moves.
 */
function mergeTgAlerts(ropAlerts) {
    const history = getTgHistory();
    const clearedSnapshot = getClearedSnapshot();
    const now = new Date();
    const DEDUP_MS = 30 * 60 * 1000; // 30 minutes
    let addedAny = false;

    ropAlerts.forEach(alert => {
        if (clearedSnapshot[alert.product_name] === alert.stock) return;

        const recent = history.find(h =>
            h.product_name === alert.product_name &&
            h.stock        === alert.stock &&
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

    // A genuinely new breach came in — the cleared snapshot is stale now,
    // so drop it rather than let it keep suppressing unrelated future alerts.
    if (addedAny) {
        try { localStorage.removeItem(TG_CLEARED_KEY); } catch (_) {}
    }

    const merged = history.slice(0, TG_MAX_ITEMS);
    saveTgHistory(merged);
    return merged;
}

// ─── Stats cards ──────────────────────────────────────────────────────────────
async function updateStatsOnly(ropAlerts) {
    try {
        const [products, inventory] = await Promise.all([
            api.getProducts(),
            api.getInventory(),
        ]);
        document.getElementById('total-products').textContent = products.length;
        const lowStock = inventory.filter(i => i.stock <= i.reorder_point).length;
        document.getElementById('low-stock').textContent = lowStock;
        document.getElementById('reorder-alerts').textContent = ropAlerts.length;

        // Inventory value = Σ(stock × cost) across all products
        const invValue = products.reduce((sum, p) => sum + (p.stock || 0) * (p.cost || 0), 0);
        const invValueEl = document.getElementById('inventory-value');
        if (invValueEl) invValueEl.textContent = helpers.formatCurrency(invValue);
    } catch (error) {
        console.error('Stats update failed:', error);
    }
}

/**
 * Revenue (current 30d) vs the previous 30d, plus a top-5-by-revenue list.
 * Pulls 60 days of sales in one request and splits it client-side into two
 * windows, rather than two separate API calls.
 * Revenue uses each product's CURRENT price (sales don't store a historical
 * unit price), so this is an estimate wherever prices have since changed.
 */
async function updateRevenueAndTopProducts() {
    const revenueEl = document.getElementById('revenue-30d');
    const deltaEl = document.getElementById('revenue-delta');
    const topListEl = document.getElementById('top-products-list');

    try {
        const [sales, products] = await Promise.all([
            api.getRecentSales(60),
            api.getProducts(),
        ]);
        const priceById = {};
        products.forEach(p => { priceById[p.product_id] = p.price; });

        const now = Date.now();
        const DAY_MS = 86400000;
        let current = 0, previous = 0;
        const revenueByProduct = {};

        sales.forEach(sale => {
            const price = priceById[sale.product_id] ?? 0;
            const revenue = sale.quantity * price;
            const ageDays = (now - new Date(sale.date).getTime()) / DAY_MS;

            if (ageDays <= 30) {
                current += revenue;
                revenueByProduct[sale.product_name] = (revenueByProduct[sale.product_name] || 0) + revenue;
            } else if (ageDays <= 60) {
                previous += revenue;
            }
        });

        if (revenueEl) revenueEl.textContent = helpers.formatCurrency(current);

        if (deltaEl) {
            if (previous > 0) {
                const pct = ((current - previous) / previous) * 100;
                const up = pct >= 0;
                deltaEl.textContent = `${up ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}% vs previous 30d`;
                deltaEl.className = `stat-delta ${up ? 'up' : 'down'}`;
            } else {
                deltaEl.textContent = current > 0 ? 'No prior-period data to compare' : '';
                deltaEl.className = 'stat-delta';
            }
        }

        if (topListEl) {
            const top5 = Object.entries(revenueByProduct)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);
            if (!top5.length) {
                topListEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);">No sales in the last 30 days</div>';
            } else {
                topListEl.innerHTML = '<ul>' + top5.map(([name, revenue]) => `
                    <li>
                        <strong>${escapeHtml(name)}</strong>
                        <span>${helpers.formatCurrency(revenue)}</span>
                    </li>`).join('') + '</ul>';
            }
        }
    } catch (error) {
        console.error('Revenue/top-products update failed:', error);
        if (revenueEl) revenueEl.textContent = '—';
    }
}

// ─── ROP alerts panel ────────────────────────────────────────────────────────
async function updateROPOnly(ropAlerts, silent = false) {
    document.getElementById('rop-error')?.classList.add('hidden');
    const container = document.getElementById('rop-alerts-list');
    if (!ropAlerts || ropAlerts.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);">✅ No alerts — stock levels are healthy</div>';
        return;
    }
    container.innerHTML = '<ul>' + ropAlerts.map(alert => {
        const badgeClass = alert.severity === 'critical' ? 'badge-danger' : 'badge-warning';
        return `<li>
            <strong>${escapeHtml(alert.product_name)}</strong>
            <span>
                <span class="badge ${badgeClass}">Stock: ${alert.stock}</span>
                &nbsp;ROP: ${alert.reorder_point}
            </span>
        </li>`;
    }).join('') + '</ul>';
    if (!silent) toast.warning(`${ropAlerts.length} product(s) need reordering`);
}

// ─── EOQ panel ───────────────────────────────────────────────────────────────
async function updateEOQOnly() {
    try {
        document.getElementById('eoq-error')?.classList.add('hidden');
        const summary = await api.getEOQ();
        const container = document.getElementById('eoq-list');
        if (!summary || summary.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);">No EOQ data available</div>';
            return;
        }
        container.innerHTML = '<ul>' + summary.map(item => `
            <li>
                <strong>${escapeHtml(item.product_name)}</strong>
                <span>EOQ: ${Math.round(item.eoq)} units</span>
            </li>`).join('') + '</ul>';
    } catch (error) {
        console.error('EOQ update failed:', error);
        document.getElementById('eoq-error')?.classList.remove('hidden');
    }
}

// ─── Forecast chart ───────────────────────────────────────────────────────────
async function updateForecast() {
    try {
        const forecast = await api.getForecast();
        const total = Array.isArray(forecast.values)
            ? forecast.values.reduce((sum, v) => sum + v, 0)
            : 0;
        const demandEl = document.getElementById('forecast-demand');
        if (demandEl) demandEl.textContent = Math.round(total);

        const canvas = document.getElementById('forecast-chart');
        if (!canvas) return;

        if (!forecast.labels || !forecast.values || forecast.labels.length === 0) {
            canvas.parentElement.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--muted);">No sales data yet — forecast will appear after sales are recorded</p>';
            return;
        }

        if (forecastChart) { forecastChart.destroy(); forecastChart = null; }

        const ctx    = canvas.getContext('2d');
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        // Teal brand color, matching --brand in both themes — #39A684 (dark) / #1F6E5C (light)
        const gradFill = ctx.createLinearGradient(0, 0, 0, 300);
        gradFill.addColorStop(0, isDark ? 'rgba(57,166,132,0.80)' : 'rgba(31,110,92,0.72)');
        gradFill.addColorStop(1, isDark ? 'rgba(57,166,132,0.22)' : 'rgba(31,110,92,0.16)');

        const gridColor  = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(31,110,92,0.10)';
        const tickColor  = isDark ? 'rgba(255,255,255,0.55)' : '#6a8799';
        const labelColor = isDark ? 'rgba(255,255,255,0.70)' : '#4a6275';

        forecastChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: forecast.labels,
                datasets: [{
                    label: 'Forecasted demand — next 30 days (units)',
                    data: forecast.values,
                    backgroundColor: gradFill,
                    borderColor: isDark ? '#39A684' : 'rgba(31,110,92,0.85)',
                    borderWidth: 1.5,
                    borderRadius: 6,
                    borderSkipped: false,
                    hoverBackgroundColor: isDark ? 'rgba(57,166,132,0.95)' : 'rgba(31,110,92,0.88)',
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                animation: { duration: 700, easing: 'easeOutQuart' },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: isDark ? 'rgba(10,24,42,0.92)' : 'rgba(255,255,255,0.96)',
                        titleColor:  isDark ? '#fff' : '#1a2e42',
                        bodyColor:   isDark ? 'rgba(255,255,255,0.80)' : '#4a6275',
                        borderColor: isDark ? 'rgba(57,166,132,0.40)' : 'rgba(31,110,92,0.28)',
                        borderWidth: 1,
                        cornerRadius: 10,
                        padding: 12,
                        callbacks: { label: ctx => ` ${ctx.parsed.y} units` },
                    },
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid:   { color: gridColor, drawBorder: false },
                        border: { display: false },
                        ticks:  { precision: 0, color: tickColor, font: { size: 11 } },
                        title:  { display: true, text: 'Units', color: labelColor, font: { size: 11, weight: '600' } },
                    },
                    x: {
                        grid:   { display: false },
                        border: { display: false },
                        ticks:  { maxRotation: 30, minRotation: 0, color: tickColor, font: { size: 10 } },
                    },
                },
            },
        });
    } catch (error) {
        console.error('Forecast update failed:', error);
        const demandEl = document.getElementById('forecast-demand');
        if (demandEl) demandEl.textContent = '—';
    }
}

// ─── Telegram alert feed ──────────────────────────────────────────────────────
function renderTelegramFeed(ropAlerts) {
    lastKnownRopAlerts = ropAlerts || [];
    const history = (ropAlerts && ropAlerts.length > 0)
        ? mergeTgAlerts(ropAlerts)
        : getTgHistory();

    const previewDiv = document.getElementById('telegram-preview');
    if (!previewDiv) return;

    if (!history.length) {
        previewDiv.innerHTML = `
            <div class="tg-empty">
                <i class="fab fa-telegram" style="color:#0088cc;font-size:1.5rem;"></i><br><br>
                No alerts sent yet
            </div>`;
        return;
    }

    previewDiv.innerHTML = `
        <div class="tg-toolbar">
            <span class="tg-count">${history.length} alert${history.length !== 1 ? 's' : ''} recorded</span>
            <button class="tg-clear-btn" onclick="clearTgHistory()" title="Clear all history">
                <i class="fas fa-trash-alt"></i> Clear history
            </button>
        </div>
        <div class="telegram-feed">
            ${history.map(h => {
                return `
                    <div class="tg-alert-item">
                        <span class="tg-icon"><i class="fab fa-telegram"></i></span>
                        <span class="tg-body">
                            <strong>${escapeHtml(h.product_name)}</strong> —
                            stock <strong>${h.stock}</strong>, ROP <strong>${h.reorder_point}</strong>
                        </span>
                    </div>`;
            }).join('')}
        </div>`;
}

function clearTgHistory() {
    if (!confirm('Clear all Telegram alert history?')) return;

    // Remember exactly which breaches were active right now, so they don't
    // immediately repopulate the (now-empty) history on the next refresh.
    const snapshot = {};
    lastKnownRopAlerts.forEach(a => { snapshot[a.product_name] = a.stock; });
    try { localStorage.setItem(TG_CLEARED_KEY, JSON.stringify(snapshot)); } catch (_) {}

    localStorage.removeItem(TG_HISTORY_KEY);
    renderTelegramFeed([]);
    toast.info('Telegram alert history cleared');
}
window.clearTgHistory = clearTgHistory;

/**
 * Human-readable relative time.
 * Shows "X min/h ago" for recent entries; full date for anything older than 24 h.
 * This way old entries stored from a previous session NEVER say "just now".
 */
function formatTgTimeRelative(isoStr) {
    if (!isoStr) return '—';
    try {
        const diffMs = Date.now() - new Date(isoStr).getTime();
        if (isNaN(diffMs) || diffMs < 0) return formatTgTimeFull(isoStr);
        if (diffMs <     60_000) return 'just now';
        if (diffMs <  3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
        if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
        return formatTgTimeFull(isoStr);   // older than 24 h — show full date
    } catch (_) { return '—'; }
}

/** Full localised date + time string, used for entries > 24 h old and tooltips. */
function formatTgTimeFull(isoStr) {
    if (!isoStr) return '—';
    try {
        return new Date(isoStr).toLocaleString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    } catch (_) { return isoStr; }
}

// ─── Main loader ──────────────────────────────────────────────────────────────
async function loadDashboard(silent = false) {
    if (!silent) showSkeleton('dashboard');
    try {
        const ropAlerts = await api.getROPAlerts();
        await Promise.all([
            updateStatsOnly(ropAlerts),
            updateROPOnly(ropAlerts, silent),
            updateEOQOnly(),
            updateForecast(),
            updateRevenueAndTopProducts(),
        ]);
        renderTelegramFeed(ropAlerts);
    } catch (error) {
        console.error('Dashboard load error:', error);
        if (!silent) toast.error('Failed to load dashboard data');
        document.getElementById('rop-error')?.classList.remove('hidden');
        document.getElementById('eoq-error')?.classList.remove('hidden');
        renderTelegramFeed([]);
    }
}

window.loadDashboard = loadDashboard;
