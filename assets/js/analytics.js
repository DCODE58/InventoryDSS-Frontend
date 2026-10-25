let analyticsRangeDays = 30;
let revenueTrendChart = null;
let lastBestSellers = []; // full sorted list, for CSV export (not just the top-5 shown)

async function loadAnalytics(silent = false) {
    if (!silent) showSkeleton('analytics');
    try {
        const [products, sales] = await Promise.all([
            api.getProducts(),
            api.getRecentSales(analyticsRangeDays),
        ]);
        renderAnalytics(products, sales);
        if (!silent) toast.success('Analytics loaded');
    } catch (error) {
        console.error('Error loading analytics:', error);
        toast.error('Failed to load analytics');
    }
}

function renderAnalytics(products, sales) {
    const priceById = {};
    const costById = {};
    const productById = {};
    products.forEach(p => {
        priceById[p.product_id] = p.price;
        costById[p.product_id] = p.cost;
        productById[p.product_id] = p;
    });

    // ── KPIs ─────────────────────────────────────────────────────────────
    let totalRevenue = 0, totalCost = 0, totalUnits = 0;
    const revenueByProduct = {};
    const revenueByDay = {};
    const soldProductIds = new Set();

    sales.forEach(sale => {
        const price = priceById[sale.product_id] ?? 0;
        const cost = costById[sale.product_id] ?? 0;
        const revenue = sale.quantity * price;

        totalRevenue += revenue;
        totalCost += sale.quantity * cost;
        totalUnits += sale.quantity;
        soldProductIds.add(String(sale.product_id));

        revenueByProduct[sale.product_name] = (revenueByProduct[sale.product_name] || 0) + revenue;

        const day = new Date(sale.date).toISOString().slice(0, 10);
        revenueByDay[day] = (revenueByDay[day] || 0) + revenue;
    });

    const aov = sales.length > 0 ? totalRevenue / sales.length : 0;
    const grossProfit = totalRevenue - totalCost;

    setText('an-total-revenue', helpers.formatCurrency(totalRevenue));
    setText('an-units-sold', totalUnits.toLocaleString());
    setText('an-aov', helpers.formatCurrency(aov));
    setText('an-gross-profit', helpers.formatCurrency(grossProfit));

    // ── Revenue trend chart ─────────────────────────────────────────────
    renderRevenueTrendChart(revenueByDay);

    // ── Best sellers ─────────────────────────────────────────────────────
    lastBestSellers = Object.entries(revenueByProduct).sort((a, b) => b[1] - a[1]);
    renderRankedList('best-sellers-list', lastBestSellers.slice(0, 5), 'eoq-section',
        'No sales in the selected range');

    // ── Dead stock: products with zero sales in range ──────────────────
    const deadStock = products.filter(p => !soldProductIds.has(String(p.product_id)));
    const deadStockEl = document.getElementById('dead-stock-list');
    if (deadStockEl) {
        deadStockEl.innerHTML = deadStock.length
            ? '<ul>' + deadStock.map(p => `
                <li>
                    <strong>${escapeHtml(p.name)}</strong>
                    <span class="badge badge-warning">${p.stock} in stock</span>
                </li>`).join('') + '</ul>'
            : '<div style="text-align:center;padding:20px;color:var(--muted);">Every product sold at least once in this range</div>';
    }

    // ── Margin leaderboard ───────────────────────────────────────────────
    const margins = products
        .map(p => ({ name: p.name, margin: helpers.calculateMargin(p.cost, p.price) }))
        .filter(m => m.margin !== null)
        .sort((a, b) => b.margin.percent - a.margin.percent);

    renderMarginList('best-margin-list', margins.slice(0, 3), 'badge-success');
    renderMarginList('worst-margin-list', margins.slice(-3).reverse(), 'badge-danger');
}

function renderRankedList(elId, entries, extraClass, emptyMessage) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = entries.length
        ? '<ul>' + entries.map(([name, revenue]) => `
            <li>
                <strong>${escapeHtml(name)}</strong>
                <span>${helpers.formatCurrency(revenue)}</span>
            </li>`).join('') + '</ul>'
        : `<div style="text-align:center;padding:20px;color:var(--muted);">${emptyMessage}</div>`;
}

function renderMarginList(elId, entries, badgeClass) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = entries.length
        ? '<ul>' + entries.map(m => `
            <li>
                <strong>${escapeHtml(m.name)}</strong>
                <span class="badge ${badgeClass}">${m.margin.percent.toFixed(1)}%</span>
            </li>`).join('') + '</ul>'
        : '<div style="text-align:center;padding:20px;color:var(--muted);">Not enough product data</div>';
}

function renderRevenueTrendChart(revenueByDay) {
    const canvas = document.getElementById('revenue-trend-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    if (revenueTrendChart) { revenueTrendChart.destroy(); revenueTrendChart = null; }

    const days = Object.keys(revenueByDay).sort();
    if (!days.length) {
        canvas.parentElement.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--muted);">No sales in the selected range yet</p>';
        return;
    }
    const values = days.map(d => revenueByDay[d]);
    const labels = days.map(d => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));

    const ctx = canvas.getContext('2d');
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    const gradFill = ctx.createLinearGradient(0, 0, 0, 300);
    gradFill.addColorStop(0, isDark ? 'rgba(57,166,132,0.35)' : 'rgba(31,110,92,0.22)');
    gradFill.addColorStop(1, 'rgba(57,166,132,0)');

    const gridColor  = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(31,110,92,0.10)';
    const tickColor  = isDark ? 'rgba(255,255,255,0.55)' : '#6a8799';
    const lineColor  = isDark ? '#39A684' : '#1F6E5C';

    revenueTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Revenue',
                data: values,
                borderColor: lineColor,
                backgroundColor: gradFill,
                fill: true,
                tension: 0.3,
                pointRadius: 3,
                pointBackgroundColor: lineColor,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: { label: (ctx) => helpers.formatCurrency(ctx.parsed.y) },
                },
            },
            scales: {
                y: { grid: { color: gridColor }, ticks: { color: tickColor, callback: v => helpers.formatCurrency(v) } },
                x: { grid: { display: false }, ticks: { color: tickColor } },
            },
        },
    });
}

function exportBestSellersCsv() {
    if (!lastBestSellers.length) {
        toast.warning('No data to export');
        return;
    }
    const header = ['Product', 'Revenue'];
    const rows = lastBestSellers.map(([name, revenue]) => `"${name.replace(/"/g, '""')}",${revenue.toFixed(2)}`);
    const csv = [header.join(','), ...rows].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `best_sellers_${analyticsRangeDays}d_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('analytics-range')?.addEventListener('change', (e) => {
        analyticsRangeDays = parseInt(e.target.value, 10) || 30;
        loadAnalytics(true);
    });
    document.getElementById('analytics-export-btn')?.addEventListener('click', exportBestSellersCsv);
});

window.loadAnalytics = loadAnalytics;
