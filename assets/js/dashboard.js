let forecastChart = null;

// ─── Telegram alert history (persisted in localStorage) ───────────────────
const TG_HISTORY_KEY = 'io_dss_tg_history';
const TG_MAX_ITEMS   = 200;

function getTgHistory() {
    try { return JSON.parse(localStorage.getItem(TG_HISTORY_KEY) || '[]'); }
    catch (_) { return []; }
}
function saveTgHistory(history) {
    try { localStorage.setItem(TG_HISTORY_KEY, JSON.stringify(history.slice(0, TG_MAX_ITEMS))); }
    catch (_) {}
}

/**
 * Append new ROP alerts to the persistent history (deduped within same minute).
 * Returns the full merged history.
 */
function mergeTgAlerts(ropAlerts) {
    const history = getTgHistory();
    const now     = new Date();
    const nowMin  = now.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:MM"

    ropAlerts.forEach(alert => {
        const key = `${alert.product_name}::${nowMin}`;
        const already = history.some(h => h.key === key);
        if (!already) {
            history.unshift({
                key,
                product_name: alert.product_name,
                stock:        alert.stock,
                reorder_point: alert.reorder_point,
                severity:     alert.severity || 'low',
                ts:           now.toISOString(),
            });
        }
    });

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
    } catch (error) {
        console.error('Stats update failed:', error);
    }
}

// ─── ROP alerts panel ────────────────────────────────────────────────────────
async function updateROPOnly(ropAlerts, silent = false) {
    const container = document.getElementById('rop-alerts-list');

    if (!ropAlerts || ropAlerts.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);">✅ No alerts — stock levels are healthy</div>';
        return;
    }

    container.innerHTML = '<ul>' + ropAlerts.map(alert => {
        const badgeClass = alert.severity === 'critical' ? 'badge-danger' : 'badge-warning';
        return `
            <li>
                <strong>${escapeHtml(alert.product_name)}</strong>
                <span>
                    <span class="badge ${badgeClass}">Stock: ${alert.stock}</span>
                    &nbsp;ROP: ${alert.reorder_point}
                </span>
            </li>`;
    }).join('') + '</ul>';

    if (!silent) {
        toast.warning(`${ropAlerts.length} product(s) need reordering`);
    }
}

// ─── EOQ panel ───────────────────────────────────────────────────────────────
async function updateEOQOnly() {
    try {
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

        // Populate forecast-demand stat card
        const total = Array.isArray(forecast.values)
            ? forecast.values.reduce((sum, v) => sum + v, 0)
            : 0;
        const demandEl = document.getElementById('forecast-demand');
        if (demandEl) demandEl.textContent = Math.round(total);

        const canvas = document.getElementById('forecast-chart');
        if (!canvas) return;

        if (!forecast.labels || !forecast.values || forecast.labels.length === 0) {
            canvas.parentElement.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--text-muted);">No sales data yet — forecast will appear after sales are recorded</p>';
            return;
        }

        if (forecastChart) { forecastChart.destroy(); forecastChart = null; }

        const ctx = canvas.getContext('2d');
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        // Gradient fill for bars
        const gradFill = ctx.createLinearGradient(0, 0, 0, 300);
        gradFill.addColorStop(0,   isDark ? 'rgba(52,152,219,0.80)' : 'rgba(52,152,219,0.72)');
        gradFill.addColorStop(1,   isDark ? 'rgba(41,128,185,0.25)' : 'rgba(41,128,185,0.18)');

        const gridColor  = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(52,152,219,0.10)';
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
                    borderColor: isDark ? '#3498db' : 'rgba(52,152,219,0.85)',
                    borderWidth: 1.5,
                    borderRadius: 6,
                    borderSkipped: false,
                    hoverBackgroundColor: isDark ? 'rgba(52,152,219,0.95)' : 'rgba(52,152,219,0.88)',
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                animation: {
                    duration: 700,
                    easing: 'easeOutQuart',
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: isDark ? 'rgba(10,24,42,0.92)' : 'rgba(255,255,255,0.96)',
                        titleColor:  isDark ? '#fff' : '#1a2e42',
                        bodyColor:   isDark ? 'rgba(255,255,255,0.80)' : '#4a6275',
                        borderColor: isDark ? 'rgba(52,152,219,0.40)' : 'rgba(52,152,219,0.28)',
                        borderWidth: 1,
                        cornerRadius: 10,
                        padding: 12,
                        callbacks: {
                            label: ctx => ` ${ctx.parsed.y} units`,
                        },
                    },
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: gridColor,
                            drawBorder: false,
                        },
                        border: { display: false },
                        ticks: {
                            precision: 0,
                            color: tickColor,
                            font: { size: 11 },
                        },
                        title: {
                            display: true,
                            text: 'Units',
                            color: labelColor,
                            font: { size: 11, weight: '600' },
                        },
                    },
                    x: {
                        grid: { display: false },
                        border: { display: false },
                        ticks: {
                            maxRotation: 30,
                            minRotation: 0,
                            color: tickColor,
                            font: { size: 10 },
                        },
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

// ─── Telegram alert feed (all history) ───────────────────────────────────────
function renderTelegramFeed(ropAlerts) {
    // Merge current alerts into history
    const history = ropAlerts && ropAlerts.length > 0
        ? mergeTgAlerts(ropAlerts)
        : getTgHistory();

    const previewDiv = document.getElementById('telegram-preview');
    if (!previewDiv) return;

    if (!history.length) {
        previewDiv.innerHTML = `<div class="tg-empty"><i class="fab fa-telegram" style="color:#0088cc;font-size:1.5rem;"></i><br><br>No alerts sent yet</div>`;
        return;
    }

    previewDiv.innerHTML = `<div class="telegram-feed">` + history.map(h => {
        const severityIcon  = h.severity === 'critical' ? '🔴' : '🟡';
        const timeStr       = formatTgTime(h.ts);
        return `
            <div class="tg-alert-item">
                <span class="tg-icon"><i class="fab fa-telegram"></i></span>
                <span class="tg-body">
                    ${severityIcon} <strong>${escapeHtml(h.product_name)}</strong> —
                    stock <strong>${h.stock}</strong>, ROP <strong>${h.reorder_point}</strong>
                </span>
                <span class="tg-time">${timeStr}</span>
            </div>`;
    }).join('') + `</div>`;
}

function formatTgTime(isoStr) {
    if (!isoStr) return '';
    try {
        const d = new Date(isoStr);
        const now = new Date();
        const diffMs = now - d;
        if (diffMs < 60000)          return 'just now';
        if (diffMs < 3600000)        return `${Math.floor(diffMs/60000)}m ago`;
        if (diffMs < 86400000)       return `${Math.floor(diffMs/3600000)}h ago`;
        return d.toLocaleDateString(undefined, { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
    } catch (_) { return ''; }
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
