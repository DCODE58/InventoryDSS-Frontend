let forecastChart = null;

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
        container.innerHTML = '<div style="text-align:center;padding:20px;">No alerts — stock levels are healthy</div>';
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

    updateTelegramPreview(ropAlerts);

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
            container.innerHTML = '<div style="text-align:center;padding:20px;">📊 No EOQ data available</div>';
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

        // Populate forecast-demand stat card (total across all products)
        const total = Array.isArray(forecast.values)
            ? forecast.values.reduce((sum, v) => sum + v, 0)
            : 0;
        const demandEl = document.getElementById('forecast-demand');
        if (demandEl) demandEl.textContent = Math.round(total);

        const canvas = document.getElementById('forecast-chart');
        if (!canvas) return;

        if (!forecast.labels || !forecast.values || forecast.labels.length === 0) {
            canvas.parentElement.innerHTML = '<p style="text-align:center;padding:20px;">📊 No sales data yet — forecast will appear after sales are recorded</p>';
            return;
        }

        if (forecastChart) { forecastChart.destroy(); forecastChart = null; }

        forecastChart = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: forecast.labels,
                datasets: [{
                    label: 'Forecasted demand — next 30 days (units)',
                    data: forecast.values,
                    backgroundColor: 'rgba(52,152,219,0.6)',
                    borderColor: '#3498db',
                    borderWidth: 1,
                    borderRadius: 4,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => ` ${ctx.parsed.y} units`,
                        },
                    },
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { precision: 0 },
                        title: { display: true, text: 'Units' },
                    },
                    x: {
                        ticks: {
                            maxRotation: 30,
                            minRotation: 0,
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

// ─── Telegram preview ────────────────────────────────────────────────────────
function updateTelegramPreview(alerts) {
    const previewDiv = document.getElementById('telegram-preview');
    if (!previewDiv) return;

    if (alerts && alerts.length > 0) {
        previewDiv.innerHTML = `
            <div style="background:#f0f2f5;padding:10px;border-radius:8px;">
                <i class="fab fa-telegram" style="color:#0088cc;"></i>
                <strong>Active alerts sent:</strong>
                <ul style="margin:5px 0 0 20px;">
                    ${alerts.slice(0, 3).map(a =>
                        `<li>${escapeHtml(a.product_name)} — stock: ${a.stock}, ROP: ${a.reorder_point}</li>`
                    ).join('')}
                    ${alerts.length > 3 ? `<li>…and ${alerts.length - 3} more</li>` : ''}
                </ul>
            </div>`;
    } else {
        previewDiv.innerHTML = `
            <div style="background:#f0f2f5;padding:10px;border-radius:8px;">
                <i class="fab fa-telegram" style="color:#0088cc;"></i> No active alerts
            </div>`;
    }
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
    } catch (error) {
        console.error('Dashboard load error:', error);
        if (!silent) toast.error('Failed to load dashboard data');
        document.getElementById('rop-error')?.classList.remove('hidden');
        document.getElementById('eoq-error')?.classList.remove('hidden');
    }
}

window.loadDashboard = loadDashboard;
