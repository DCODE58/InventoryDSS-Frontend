let analyticsRangeDays = 30;
let analyticsRendered = false;
let analyticsLoadSeq = 0;
let lastBestSellers = [];      // full sorted list, for CSV export (not just the top 5 shown)
let lastTrend = null;          // { days, values } kept so the chart can redraw on theme change

const $a = (id) => document.getElementById(id);

const AN_LISTS = ['best-sellers-list', 'dead-stock-list', 'best-margin-list', 'worst-margin-list'];
const AN_KPIS = ['an-total-revenue', 'an-units-sold', 'an-aov', 'an-gross-profit'];

async function loadAnalytics(silent = false) {
    const seq = ++analyticsLoadSeq;
    const days = analyticsRangeDays;
    if (!analyticsRendered) {
        AN_LISTS.forEach((id) => { $a(id).innerHTML = ui.skeleton(3); });
        AN_KPIS.forEach(ui.setKpiLoading);
        ui.chartState('trend-container', 'loading');
    }
    try {
        const [products, sales] = await Promise.all([api.getProducts(), api.getRecentSales(days)]);
        if (seq !== analyticsLoadSeq) return;       // range changed while loading; drop the stale response
        renderAnalytics(products, sales, days);
        analyticsRendered = true;
    } catch (error) {
        if (seq !== analyticsLoadSeq) return;
        console.error('Error loading analytics:', error);
        if (!analyticsRendered) {
            AN_KPIS.forEach((id) => ui.setKpi(id, null));
            const retry = { kind: 'error', title: 'Analytics unavailable', text: ui.errorDetail(error) || 'The data could not be loaded.', actionLabel: 'Try again', onAction: () => loadAnalytics(false) };
            AN_LISTS.forEach((id) => ui.renderState($a(id), retry));
            ui.destroyChart('trend');
            ui.chartState('trend-container', 'error', retry);
            lastBestSellers = [];
        } else if (!silent) {
            ui.reportError(error, "Couldn't refresh analytics");
        }
    }
}

function renderAnalytics(products, sales, days) {
    const priceById = {}, costById = {};
    products.forEach((p) => {
        priceById[p.product_id] = helpers.toNumber(p.price);
        costById[p.product_id] = helpers.toNumber(p.cost);
    });

    // ── KPIs ─────────────────────────────────────────────────────────────
    let totalRevenue = 0, totalCost = 0, totalUnits = 0, pricedSales = 0, unpricedSales = 0;
    const revenueByProduct = {};
    const revenueByDay = {};
    const soldProductIds = new Set();

    sales.forEach((sale) => {
        const qty = helpers.toNumber(sale.quantity);
        const price = priceById[sale.product_id];
        const when = new Date(sale.date);
        soldProductIds.add(String(sale.product_id));
        if (qty === null) return;
        totalUnits += qty;
        if (price === null || price === undefined || isNaN(when.getTime())) { unpricedSales++; return; }

        const revenue = qty * price;
        pricedSales++;
        totalRevenue += revenue;
        totalCost += qty * (costById[sale.product_id] ?? 0);
        revenueByProduct[sale.product_name] = (revenueByProduct[sale.product_name] || 0) + revenue;
        const day = helpers.localDayKey(when);
        revenueByDay[day] = (revenueByDay[day] || 0) + revenue;
    });

    // Average order value = revenue per sale record that could be priced.
    const aov = pricedSales > 0 ? totalRevenue / pricedSales : null;
    const noSales = sales.length === 0;

    ui.setKpi('an-total-revenue', helpers.formatCurrency(totalRevenue));
    ui.setKpi('an-units-sold', helpers.formatNumber(totalUnits));
    ui.setKpi('an-aov', aov === null ? null : helpers.formatCurrency(aov), 'No sales');
    ui.setKpi('an-gross-profit', helpers.formatCurrency(totalRevenue - totalCost));
    $a('an-period-note').textContent = `Last ${days} days, ${sales.length} sale${sales.length !== 1 ? 's' : ''}`;

    const unpricedNote = $a('analytics-unpriced');
    unpricedNote.classList.toggle('hidden', !unpricedSales);
    if (unpricedSales) unpricedNote.querySelector('span').textContent =
        `${unpricedSales} sale${unpricedSales !== 1 ? 's' : ''} in this period belong to products that no longer have a price on record. They count toward units sold but are left out of revenue, profit and average order value.`;

    // ── Revenue trend ────────────────────────────────────────────────────
    const dayKeys = Object.keys(revenueByDay).sort();
    if (dayKeys.length) {
        // Fill quiet days with a true zero so the line doesn't imply sales on days between.
        const days_ = [];
        const cursor = new Date(`${dayKeys[0]}T00:00:00`);
        const end = new Date(`${dayKeys[dayKeys.length - 1]}T00:00:00`);
        while (cursor <= end) { days_.push(helpers.localDayKey(cursor)); cursor.setDate(cursor.getDate() + 1); }
        lastTrend = { days: days_, values: days_.map((d) => revenueByDay[d] || 0), rangeDays: days };
    } else {
        lastTrend = null;
    }
    renderRevenueTrendChart();

    // ── Best sellers ─────────────────────────────────────────────────────
    lastBestSellers = Object.entries(revenueByProduct).sort((a, b) => b[1] - a[1]);
    renderRankedList('best-sellers-list', lastBestSellers.slice(0, 5), { icon: 'fa-receipt', title: 'No sales in this period', text: 'Revenue rankings appear once sales are recorded.' });

    // ── Products with no recorded sales in range ─────────────────────────
    const deadStock = products.filter((p) => !soldProductIds.has(String(p.product_id)));
    const deadEl = $a('dead-stock-list');
    if (!products.length) {
        ui.renderState(deadEl, { kind: 'empty', title: 'No products yet', text: 'Add products to see which ones aren’t selling.' });
    } else if (!deadStock.length) {
        ui.renderState(deadEl, { kind: 'empty', icon: 'fa-circle-check', title: 'Every product sold', text: `Each product had at least one sale in the last ${days} days.` });
    } else {
        deadEl.innerHTML = '<ul class="row-list">' + deadStock.map((p) => {
            const stock = helpers.toNumber(p.stock);
            return `<li class="row-item sev-low">
                <div class="row-main"><span class="row-name">${escapeHtml(p.name)}</span></div>
                <span class="badge badge-warning"><i class="fas fa-box" aria-hidden="true"></i>${stock === null ? 'Stock unknown' : `${helpers.formatNumber(stock)} in stock`}</span>
            </li>`;
        }).join('') + '</ul>';
    }

    // ── Margin leaderboards (current price vs cost) ──────────────────────
    const margins = products
        .map((p) => ({ name: p.name, margin: helpers.calculateMargin(p.cost, p.price) }))
        .filter((m) => m.margin !== null)
        .sort((a, b) => b.margin.percent - a.margin.percent);
    const best = margins.slice(0, 3);
    const worst = margins.slice(Math.max(3, margins.length - 3)).reverse();   // never repeats a product shown in "highest"
    renderMarginList('best-margin-list', best, 'badge-success', 'Add products with prices to compare margins.');
    renderMarginList('worst-margin-list', worst, 'badge-danger', margins.length > 3 ? 'Not enough products to compare.' : 'Needs more than three products to compare.');

    if (noSales) $a('an-period-note').textContent = `No sales in the last ${days} days`;
}

function renderRankedList(elId, entries, emptyOpts) {
    const el = $a(elId);
    if (!entries.length) { ui.renderState(el, { kind: 'empty', ...emptyOpts }); return; }
    el.innerHTML = '<ol class="row-list" style="list-style:none;padding:0;margin:0">' + entries.map(([name, revenue], i) => `
        <li class="row-item">
            <div class="row-main"><span class="row-rank" aria-hidden="true">${i + 1}</span><span class="row-name">${escapeHtml(name)}</span></div>
            <span class="row-value">${escapeHtml(helpers.formatCurrency(revenue))}</span>
        </li>`).join('') + '</ol>';
}

function renderMarginList(elId, entries, badgeClass, emptyText) {
    const el = $a(elId);
    if (!entries.length) { ui.renderState(el, { kind: 'empty', icon: 'fa-chart-column', title: 'Nothing to show', text: emptyText }); return; }
    el.innerHTML = '<ul class="row-list">' + entries.map((m) => `
        <li class="row-item">
            <div class="row-main"><span class="row-name">${escapeHtml(m.name)}</span></div>
            <div class="row-meta"><span class="muted">${escapeHtml(helpers.formatCurrency(m.margin.amount))} profit</span>
            <span class="badge ${badgeClass}">${m.margin.percent.toFixed(1)}% of cost</span></div>
        </li>`).join('') + '</ul>';
}

function renderRevenueTrendChart() {
    if (!lastTrend) {
        ui.destroyChart('trend');
        ui.chartState('trend-container', 'empty', { title: 'No sales in this period', text: 'The trend appears once sales are recorded.' });
        ui.setChartText({ summaryId: 'trend-summary', summaryText: '', canvasId: 'revenue-trend-chart', dataId: 'trend-data' });
        return;
    }
    if (!ui.hasChartLib()) {
        ui.chartState('trend-container', 'error', { title: 'Chart unavailable', text: 'The chart library failed to load. The data table below still has the figures.' });
    } else {
        ui.chartState('trend-container', 'ready');
    }

    const { days, values } = lastTrend;
    const labels = days.map((d) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
    const th = ui.chartTheme();
    ui.mountChart('trend', $a('revenue-trend-chart'), {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Estimated revenue',
                data: values,
                borderColor: th.accent,
                backgroundColor: ui.alpha(th.accent, 0.14),
                fill: true,
                cubicInterpolationMode: 'monotone',
                borderWidth: 2,
                pointRadius: values.length > 31 ? 0 : 3,
                pointHoverRadius: 5,
                pointBackgroundColor: th.accent,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: ui.reducedMotion() ? false : { duration: 450 },
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: th.tooltipBg, titleColor: th.strong, bodyColor: th.text,
                    borderColor: th.border, borderWidth: 1, padding: 10, cornerRadius: 8,
                    callbacks: { label: (c) => ` ${helpers.formatCurrency(c.parsed.y)} (est.)` },
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: th.grid }, border: { display: false },
                    ticks: { color: th.muted, font: { family: th.font }, callback: (v) => helpers.formatNumber(v) },
                    title: { display: true, text: 'Estimated revenue (Ksh)', color: th.text, font: { family: th.font } },
                },
                x: {
                    grid: { display: false }, border: { display: false },
                    ticks: { color: th.muted, font: { family: th.font }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
                    title: { display: true, text: 'Day', color: th.text, font: { family: th.font } },
                },
            },
        },
    });

    const total = values.reduce((s, v) => s + v, 0);
    const peakIdx = values.indexOf(Math.max(...values));
    ui.setChartText({
        summaryId: 'trend-summary',
        summaryText: `Estimated revenue of ${helpers.formatCurrency(total)} across ${values.length} day${values.length !== 1 ? 's' : ''}, from ${labels[0]} to ${labels[labels.length - 1]}. Highest day: ${labels[peakIdx]} at ${helpers.formatCurrency(values[peakIdx])}.`,
        canvasId: 'revenue-trend-chart',
        dataId: 'trend-data',
        headers: ['Day', 'Estimated revenue'],
        rows: days.map((d, i) => [labels[i], helpers.formatCurrency(values[i])]),
    });
}

function exportBestSellersCsv() {
    if (!lastBestSellers.length) { toast.warning('No data to export'); return; }
    const header = ['Product', 'Revenue (est.)'].map(helpers.csvCell).join(',');
    const rows = lastBestSellers.map(([name, revenue]) => `${helpers.csvCell(name)},${revenue.toFixed(2)}`);
    helpers.downloadCsv(`best_sellers_${analyticsRangeDays}d_${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows]);
    toast.success('Best sellers exported to CSV');
}

document.addEventListener('DOMContentLoaded', () => {
    $a('analytics-range').addEventListener('change', (e) => {
        analyticsRangeDays = parseInt(e.target.value, 10) || 30;
        loadAnalytics(false);
    });
    $a('analytics-export-btn').addEventListener('click', exportBestSellersCsv);
    window.addEventListener('themechange', () => { if (analyticsRendered) renderRevenueTrendChart(); });
});

window.loadAnalytics = loadAnalytics;
