let productsList = [];
let priceByProductId = {};
let stockByProductId = {};
let allRecentSales = [];       // unfiltered, as last fetched for the current range
let salesRangeDays = 30;
let salesProductFilter = '';   // '' = all products
let salesSortOrder = 'newest';
let salesPage = 1;
let salesRendered = false;
let salesLoadSeq = 0;
let recordingSale = false;
const SALES_PAGE_SIZE = 10;
const MAX_SALE_QTY = 100000;

const $s = (id) => document.getElementById(id);

async function loadSalesPage(silent = false) {
    await Promise.all([loadProductDropdown(silent), loadRecentSales(silent)]);
}

// ─── Product selector ────────────────────────────────────────────────────────
async function loadProductDropdown(silent = false) {
    const select = $s('product-id');
    if (!productsList.length) select.innerHTML = '<option value="">Loading products…</option>';
    try {
        productsList = await api.getProducts();
        priceByProductId = {};
        stockByProductId = {};
        productsList.forEach((p) => {
            priceByProductId[p.product_id] = helpers.toNumber(p.price);
            stockByProductId[p.product_id] = helpers.toNumber(p.stock);
        });
        renderProductOptions();

        const filterSelect = $s('sales-product-filter');
        if (filterSelect) {
            const keep = salesProductFilter;
            filterSelect.innerHTML = '<option value="">All products</option>' +
                productsList.map((p) => `<option value="${escapeHtml(p.product_id)}">${escapeHtml(p.name)}</option>`).join('');
            filterSelect.value = keep;
        }
        $s('product-id').disabled = false;
    } catch (error) {
        console.error('Failed to load products for sales', error);
        select.innerHTML = '<option value="">Products unavailable</option>';
        select.disabled = true;
        $s('sale-product-hint').textContent = `Products couldn’t be loaded${ui.errorDetail(error) ? ` (${ui.errorDetail(error)})` : ''}. Reload this page to try again.`;
        if (!silent) ui.reportError(error, "Couldn't load products");
    }
}

/** Fills the select, narrowed by the “Find product” box; the current selection always stays available. */
function renderProductOptions() {
    const select = $s('product-id');
    const term = $s('sale-product-search').value.trim().toLowerCase();
    const selected = select.value;
    const matches = productsList.filter((p) =>
        !term || String(p.name ?? '').toLowerCase().includes(term) || String(p.product_id) === selected);
    select.innerHTML = '<option value="">Select product</option>' +
        matches.map((p) => `<option value="${escapeHtml(p.product_id)}">${escapeHtml(p.name)}</option>`).join('');
    select.value = matches.some((p) => String(p.product_id) === selected) ? selected : '';

    const hint = $s('sale-product-hint');
    if (term) hint.textContent = matches.length ? `${matches.length} product${matches.length !== 1 ? 's' : ''} match.` : 'No products match. Clear the search to see all.';
    else hint.textContent = '';
    updateSalePreview();
}

// ─── Preview & validation ────────────────────────────────────────────────────
/** Live total under the form, plus a soft (non-blocking) stock note. */
function updateSalePreview() {
    const preview = $s('sale-preview');
    const qtyHint = $s('quantity-hint');
    const productId = $s('product-id').value;
    const quantity = helpers.toNumber($s('quantity').value);
    const price = priceByProductId[productId];
    const stock = stockByProductId[productId];

    qtyHint.textContent = '';
    if (productId && stock !== null && stock !== undefined) {
        qtyHint.textContent = `Stock on record: ${helpers.formatNumber(stock)} (as last loaded)`;
        if (quantity !== null && quantity > stock) qtyHint.textContent += `. This is more than the stock on record; the server will confirm.`;
    }

    if (!productId || price === null || price === undefined) {
        preview.textContent = 'Choose a product and quantity to see the total.';
        return;
    }
    if (quantity === null || !Number.isInteger(quantity) || quantity <= 0) {
        preview.innerHTML = `Unit price <strong>${escapeHtml(helpers.formatCurrency(price))}</strong>`;
        return;
    }
    preview.innerHTML = `${quantity} × ${escapeHtml(helpers.formatCurrency(price))} = <strong>${escapeHtml(helpers.formatCurrency(quantity * price))}</strong>`;
}

/** Validates the sale form inline, returning a parsed payload or null. */
function validateSaleForm() {
    const form = $s('sales-form');
    ui.clearFieldErrors(form);
    ui.formAlert('sales-form-alert', '');
    const productId = $s('product-id').value;
    const raw = $s('quantity').value.trim();
    const quantity = raw === '' ? null : helpers.toNumber(raw);
    const errors = [];

    if (!productId) errors.push(['product-id', 'Select a product.']);
    if (quantity === null) errors.push(['quantity', raw === '' ? 'Enter a quantity.' : 'Enter a valid number.']);
    else if (!Number.isInteger(quantity) || quantity <= 0) errors.push(['quantity', 'Quantity must be a whole number greater than zero.']);
    else if (quantity > MAX_SALE_QTY) errors.push(['quantity', `That quantity looks too large. Check it (limit ${MAX_SALE_QTY.toLocaleString()}).`]);

    if (errors.length) {
        errors.forEach(([id, msg]) => ui.fieldError(id, msg));
        $s(errors[0][0]).focus();
        return null;
    }
    return { productId, quantity };
}

async function recordSale(event) {
    event.preventDefault();
    if (recordingSale) return;                     // block double submit
    const validated = validateSaleForm();
    if (!validated) return;
    const { productId, quantity } = validated;
    const product = productsList.find((p) => String(p.product_id) === String(productId));

    const btn = $s('sale-submit');
    recordingSale = true;
    ui.setBusy(btn, true, 'Recording…');
    try {
        await api.recordSale({ product_id: productId, quantity });
        toast.success(`Sale recorded: ${quantity} × ${product ? product.name : 'product'}`);
        $s('sales-form').reset();
        $s('sale-product-search').value = '';
        ui.formAlert('sales-form-alert', '');
        salesPage = 1;
        await Promise.all([loadProductDropdown(true), loadRecentSales(true)]);
        $s('product-id').focus();
    } catch (error) {
        // Entered values stay in the form so the user can correct or retry.
        const detail = ui.errorDetail(error);
        ui.formAlert('sales-form-alert', `The sale wasn’t recorded${detail ? `: ${detail}` : ''}.` +
            (error.ambiguous ? ' It may still have gone through, so check the sales history before trying again.' : ''));
        ui.reportError(error, 'Failed to record sale');
    } finally {
        recordingSale = false;
        ui.setBusy(btn, false);
    }
}

// ─── History ─────────────────────────────────────────────────────────────────
async function loadRecentSales(silent = false) {
    const seq = ++salesLoadSeq;
    const days = salesRangeDays;
    const tbody = $s('recent-sales-list');
    if (!salesRendered) ui.tableSkeleton(tbody, 5);
    try {
        const sales = await api.getRecentSales(days);
        if (seq !== salesLoadSeq) return;           // user changed range meanwhile; ignore the stale response
        allRecentSales = sales;
        salesRendered = true;
        renderSalesTable();
    } catch (error) {
        if (seq !== salesLoadSeq) return;
        console.error('Error loading recent sales', error);
        if (!salesRendered) {
            ui.tableState(tbody, 5, { kind: 'error', title: "Sales couldn't be loaded", text: ui.errorDetail(error) || 'Check your connection and try again.', actionLabel: 'Try again', onAction: () => loadRecentSales(false) });
            $s('sales-total').innerHTML = '';
            $s('sales-pagination').innerHTML = '';
        } else if (!silent) {
            ui.reportError(error, "Couldn't load sales for that period");
        }
    }
}

function saleTime(sale) { const t = helpers.parseDate(sale.date).getTime(); return isNaN(t) ? 0 : t; }

function getFilteredSortedSales() {
    let sales = allRecentSales;
    if (salesProductFilter) sales = sales.filter((s) => String(s.product_id) === String(salesProductFilter));
    return [...sales].sort((a, b) => salesSortOrder === 'newest' ? saleTime(b) - saleTime(a) : saleTime(a) - saleTime(b));
}

function periodLabel() { return `Last ${salesRangeDays} days`; }

function renderSalesTable(focusAfter) {
    const tbody = $s('recent-sales-list');
    const totalEl = $s('sales-total');
    const paginationEl = $s('sales-pagination');
    const sales = getFilteredSortedSales();

    if (!sales.length) {
        const filtered = !!salesProductFilter && allRecentSales.length > 0;
        ui.tableState(tbody, 5, filtered
            ? { kind: 'empty', icon: 'fa-filter', title: 'No sales for this product', text: `Nothing was sold in the ${periodLabel().toLowerCase()}. Pick another product or a longer period.` }
            : { kind: 'empty', icon: 'fa-receipt', title: 'No sales in this period', text: `No sales were recorded in the ${periodLabel().toLowerCase()}.` });
        totalEl.innerHTML = `<span class="period-chip"><i class="fas fa-calendar" aria-hidden="true"></i>${periodLabel()}</span><span>0 sales</span>`;
        paginationEl.innerHTML = '';
        return;
    }

    let totalRevenue = 0, unpriced = 0;
    sales.forEach((sale) => {
        const price = priceByProductId[sale.product_id];
        const qty = helpers.toNumber(sale.quantity);
        if (price === null || price === undefined || qty === null) unpriced++;
        else totalRevenue += qty * price;
    });

    const totalPages = Math.max(1, Math.ceil(sales.length / SALES_PAGE_SIZE));
    salesPage = Math.min(Math.max(1, salesPage), totalPages);
    const pageSales = sales.slice((salesPage - 1) * SALES_PAGE_SIZE, salesPage * SALES_PAGE_SIZE);

    tbody.innerHTML = pageSales.map((sale) => {
        const price = priceByProductId[sale.product_id];
        const qty = helpers.toNumber(sale.quantity);
        const revenue = (price !== null && price !== undefined && qty !== null) ? qty * price : null;
        return `
            <tr>
                <td>${escapeHtml(sale.sale_id)}</td>
                <td class="cell-name">${escapeHtml(sale.product_name)}</td>
                <td class="num">${escapeHtml(sale.quantity)}</td>
                <td class="num">${revenue !== null ? helpers.formatCurrency(revenue) : '<span class="muted" title="Product no longer has a current price">Unavailable</span>'}</td>
                <td>${escapeHtml(helpers.formatDateTime(sale.date))}</td>
            </tr>`;
    }).join('');

    const productName = salesProductFilter ? (productsList.find((p) => String(p.product_id) === String(salesProductFilter))?.name) : null;
    totalEl.innerHTML =
        `<span class="period-chip"><i class="fas fa-calendar" aria-hidden="true"></i>${periodLabel()}</span>` +
        (productName ? `<span>Product: <strong>${escapeHtml(productName)}</strong></span>` : '') +
        `<span><strong>${sales.length}</strong> sale${sales.length !== 1 ? 's' : ''}</span>` +
        `<span><strong>${escapeHtml(helpers.formatCurrency(totalRevenue))}</strong> estimated revenue</span>` +
        (unpriced ? `<span class="muted">${unpriced} sale${unpriced !== 1 ? 's' : ''} without a current price left out</span>` : '');

    if (totalPages <= 1) {
        paginationEl.innerHTML = '';
    } else {
        paginationEl.innerHTML = `
            <button type="button" class="btn btn-secondary btn-sm" data-page-step="-1" aria-label="Previous page"${salesPage === 1 ? ' disabled' : ''}><i class="fas fa-arrow-left" aria-hidden="true"></i>Prev</button>
            <span aria-live="polite">Page ${salesPage} of ${totalPages}</span>
            <button type="button" class="btn btn-secondary btn-sm" data-page-step="1" aria-label="Next page"${salesPage === totalPages ? ' disabled' : ''}>Next<i class="fas fa-arrow-right" aria-hidden="true"></i></button>`;
        if (focusAfter) {
            const want = paginationEl.querySelector(`[data-page-step="${focusAfter}"]`);
            (want && !want.disabled ? want : paginationEl.querySelector('button:not(:disabled)'))?.focus();
        }
    }
}

/** Exports the currently filtered/sorted sales (all pages, not just the visible one). */
function exportSalesCsv() {
    const sales = getFilteredSortedSales();
    if (!sales.length) { toast.warning('No sales to export'); return; }
    const header = ['Sale ID', 'Product', 'Quantity', 'Revenue (est.)', 'Date'].map(helpers.csvCell).join(',');
    const rows = sales.map((sale) => {
        const price = priceByProductId[sale.product_id];
        const qty = helpers.toNumber(sale.quantity);
        const revenue = (price !== null && price !== undefined && qty !== null) ? (qty * price).toFixed(2) : '';
        return [sale.sale_id, sale.product_name, sale.quantity, revenue, sale.date].map(helpers.csvCell).join(',');
    });
    helpers.downloadCsv(`sales_${salesRangeDays}d_${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows]);
    toast.success(`Exported ${sales.length} sale${sales.length !== 1 ? 's' : ''} to CSV`);
}

document.addEventListener('DOMContentLoaded', () => {
    $s('sales-form').addEventListener('submit', recordSale);
    $s('product-id').addEventListener('change', () => { ui.fieldError('product-id', ''); updateSalePreview(); });
    $s('quantity').addEventListener('input', () => { ui.fieldError('quantity', ''); updateSalePreview(); });
    $s('sale-product-search').addEventListener('input', helpers.debounce(renderProductOptions, 120));

    $s('sales-range').addEventListener('change', (e) => {
        salesRangeDays = parseInt(e.target.value, 10) || 30;
        salesPage = 1;
        loadRecentSales(false);
    });
    $s('sales-product-filter').addEventListener('change', (e) => { salesProductFilter = e.target.value; salesPage = 1; renderSalesTable(); });
    $s('sales-sort').addEventListener('change', (e) => { salesSortOrder = e.target.value; salesPage = 1; renderSalesTable(); });
    $s('sales-export-btn').addEventListener('click', exportSalesCsv);
    $s('sales-pagination').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-page-step]');
        if (!btn || btn.disabled) return;
        const step = parseInt(btn.dataset.pageStep, 10);
        salesPage += step;
        renderSalesTable(step);
    });
});

window.loadSalesPage = loadSalesPage;
