let forecastChart = null;

async function updateStatsOnly(ropAlerts) {
    try {
        const [products, inventory] = await Promise.all([api.getProducts(), api.getInventory()]);
        document.getElementById('total-products').textContent = products.length;
        const lowStock = inventory.filter(item => item.stock <= item.reorder_point).length;
        document.getElementById('low-stock').textContent = lowStock;
        document.getElementById('reorder-alerts').textContent = ropAlerts.length;
    } catch (error) { console.error('Stats update failed', error); }
}

async function updateROPOnly(ropAlerts, silent = false) {
    const container = document.getElementById('rop-alerts-list');
    if (!ropAlerts || ropAlerts.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px;">✅ No alerts – stock levels are healthy</div>';
    } else {
        container.innerHTML = '<ul>' + ropAlerts.map(alert => `
            <li><strong>${escapeHtml(alert.product_name)}</strong> <span class="badge badge-danger">Stock: ${alert.stock}</span></li>
        `).join('') + '</ul>';
    }
    updateTelegramPreview(ropAlerts);
    if (ropAlerts.length > 0 && !silent) {
        toast.warning(`${ropAlerts.length} product(s) are low on stock`);
    }
}

async function updateEOQOnly() {
    try {
        const eoq = await api.getEOQ();
        const container = document.getElementById('eoq-list');
        if (!eoq || eoq.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:20px;">📊 No EOQ recommendations available</div>';
        } else {
            container.innerHTML = '<ul>' + eoq.map(item => `
                <li><strong>${escapeHtml(item.product_name)}</strong> <span>EOQ: ${Math.round(item.eoq)} units</span></li>
            `).join('') + '</ul>';
        }
    } catch (error) { console.error('EOQ update failed', error); }
}

function updateTelegramPreview(alerts) {
    const previewDiv = document.getElementById('telegram-preview');
    if (!previewDiv) return;
    if (alerts && alerts.length > 0) {
        previewDiv.innerHTML = `
            <div style="background:#f0f2f5; padding:10px; border-radius:8px;">
                <i class="fab fa-telegram" style="color:#0088cc;"></i>
                <strong>Last alerts:</strong>
                <ul style="margin:5px 0 0 20px;">
                    ${alerts.slice(0,3).map(a => `<li>${escapeHtml(a.product_name)} (stock: ${a.stock})</li>`).join('')}
                </ul>
            </div>
        `;
    } else {
        previewDiv.innerHTML = '<div style="background:#f0f2f5; padding:10px; border-radius:8px;"><i class="fab fa-telegram" style="color:#0088cc;"></i> No active alerts</div>';
    }
}

async function loadDashboard(silent = false) {
    if (!silent) showSkeleton('dashboard');
    try {
        const ropAlerts = await api.getROPAlerts();
        await Promise.all([
            updateStatsOnly(ropAlerts),
            updateROPOnly(ropAlerts, silent),
            updateEOQOnly(),
            (async () => {
                const forecast = await api.getForecast();
                const canvas = document.getElementById('forecast-chart');
                if (!canvas) return;
                const ctx = canvas.getContext('2d');
                if (forecastChart) { forecastChart.destroy(); forecastChart = null; }
                if (forecast.labels && forecast.values) {
                    forecastChart = new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: forecast.labels,
                            datasets: [{
                                label: 'Forecasted Demand (units)',
                                data: forecast.values,
                                borderColor: '#3498db',
                                backgroundColor: 'rgba(52,152,219,0.1)',
                                fill: true,
                                tension: 0.3
                            }]
                        },
                        options: { responsive: true, maintainAspectRatio: true }
                    });
                } else {
                    canvas.parentElement.innerHTML = '<p>Forecast data unavailable</p>';
                }
            })()
        ]);
    } catch (error) {
        console.error('Dashboard error:', error);
        if (!silent) toast.error('Failed to load dashboard data');
        document.getElementById('rop-error')?.classList.remove('hidden');
        document.getElementById('eoq-error')?.classList.remove('hidden');
    }
}

window.loadDashboard = loadDashboard;
