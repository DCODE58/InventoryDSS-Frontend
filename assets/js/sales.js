let productsList = [];
let priceByProductId = {};
let allRecentSales = [];       // unfiltered, as last fetched for the current range
let salesRangeDays = 30;
let salesProductFilter = '';   // '' = all products
let salesSortOrder = 'newest';
let salesPage = 1;
const SALES_PAGE_SIZE = 10;

async function loadSalesPage(silent = false) {
    if (!silent) showSkeleton('sales');
    await Promise.all([loadProductDropdown(), loadRecentSales()]);
    if (!silent) toast.success('Sales page ready');
}

async function loadProductDropdown() {
    try {
        productsList = await api.getProducts();
        priceByProductId = {};
        productsList.forEach(p => { priceByProductId[p.product_id] = p.price; });

        const select = document.getElementById('product-id');
        select.innerHTML = '<option value="">Select Product</option>' + productsList.map(p => `<option value="${p.product_id}">${escapeHtml(p.name)}</option>`).join('');

        const filterSelect = document.getElementById('sales-product-filter');
        if (filterSelect) {
            filterSelect.innerHTML = '<option value="">All products</option>' + productsList.map(p => `<option value="${p.product_id}">${escapeHtml(p.name)}</option>`).join('');
        }
    } catch (error) {
        console.error('Failed to load products for sales', error);
        document.getElementById('product-id').innerHTML = '<option>Failed to load products</option>';
    }
}

/** Live "Total: Ksh X" preview under the quantity field, updated as the user types/selects. */
function updateSalePreview() {
    const previewEl = document.getElementById('sale-preview');
    if (!previewEl) return;

    const productId = document.getElementById('product-id').value;
    const quantity = parseInt(document.getElementById('quantity').value, 10);
    const price = priceByProductId[productId];

    if (!productId || price === undefined) {
        previewEl.textContent = '';
        return;
    }
    if (isNaN(quantity) || quantity <= 0) {
        previewEl.innerHTML = `Unit price: <strong>${helpers.formatCurrency(price)}</strong>`;
        return;
    }
    previewEl.innerHTML = `${quantity} × ${helpers.formatCurrency(price)} = <strong>${helpers.formatCurrency(quantity * price)}</strong>`;
}

/** Validates the sale form, returning a parsed payload or null (after a toast) on failure. */
function validateSaleForm() {
    const productId = document.getElementById('product-id').value;
    const quantity = parseInt(document.getElementById('quantity').value, 10);

    if (!productId) {
        toast.warning('Please select a product');
        return null;
    }
    if (isNaN(quantity) || quantity <= 0) {
        toast.warning('Enter a valid quantity greater than zero');
        return null;
    }
    if (quantity > 100000) {
        toast.warning('That quantity looks too large — please check it');
        return null;
    }
    return { productId, quantity };
}

async function recordSale(event) {
    event.preventDefault();
    const validated = validateSaleForm();
    if (!validated) return;
    const { productId, quantity } = validated;

    try {
        await api.recordSale({ product_id: productId, quantity });
        toast.success('Sale recorded');
        document.getElementById('sales-form').reset();
        updateSalePreview();
        salesPage = 1;
        await loadRecentSales();
        if (typeof loadDashboard === 'function' && !document.getElementById('dashboard').classList.contains('hidden')) {
            loadDashboard(true);
        }
    } catch (error) {
        toast.error('Failed to record sale');
    }
}

async function loadRecentSales() {
    try {
        allRecentSales = await api.getRecentSales(salesRangeDays);
        renderSalesTable();
    } catch (error) {
        console.error('Error loading recent sales', error);
    }
}

function getFilteredSortedSales() {
    let sales = allRecentSales;
    if (salesProductFilter) {
        sales = sales.filter(s => String(s.product_id) === String(salesProductFilter));
    }
    sales = [...sales].sort((a, b) => {
        const diff = new Date(a.date) - new Date(b.date);
        return salesSortOrder === 'newest' ? -diff : diff;
    });
    return sales;
}

function renderSalesTable() {
    const tbody = document.getElementById('recent-sales-list');
    const totalEl = document.getElementById('sales-total');
    const paginationEl = document.getElementById('sales-pagination');

    const sales = getFilteredSortedSales();

    if (!sales.length) {
        const message = salesProductFilter ? 'No sales for this product in the selected range.' : 'No sales recorded yet';
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">${message}</td></tr>`;
        if (totalEl) totalEl.textContent = '';
        if (paginationEl) paginationEl.innerHTML = '';
        return;
    }

    let totalRevenue = 0;
    sales.forEach(sale => {
        const price = priceByProductId[sale.product_id];
        if (price !== undefined) totalRevenue += sale.quantity * price;
    });

    const totalPages = Math.max(1, Math.ceil(sales.length / SALES_PAGE_SIZE));
    salesPage = Math.min(salesPage, totalPages);
    const pageSales = sales.slice((salesPage - 1) * SALES_PAGE_SIZE, salesPage * SALES_PAGE_SIZE);

    tbody.innerHTML = pageSales.map(sale => {
        // Revenue uses the product's CURRENT price — sale records don't store a
        // historical unit price, so this is an estimate if the price has changed since.
        const price = priceByProductId[sale.product_id];
        const revenue = (price !== undefined) ? sale.quantity * price : null;
        return `
            <tr>
                <td>${sale.sale_id}</td>
                <td>${escapeHtml(sale.product_name)}</td>
                <td>${sale.quantity}</td>
                <td>${revenue !== null ? helpers.formatCurrency(revenue) : '—'}</td>
                <td>${helpers.formatDateTime(sale.date)}</td>
            </tr>
        `;
    }).join('');

    if (totalEl) {
        totalEl.textContent = `${sales.length} sale${sales.length !== 1 ? 's' : ''} · ${helpers.formatCurrency(totalRevenue)} total revenue (est.)`;
    }

    if (paginationEl) {
        if (totalPages <= 1) {
            paginationEl.innerHTML = '';
        } else {
            paginationEl.innerHTML = `
                <button type="button" id="sales-prev-page" ${salesPage === 1 ? 'disabled' : ''}>&larr; Prev</button>
                <span>Page ${salesPage} of ${totalPages}</span>
                <button type="button" id="sales-next-page" ${salesPage === totalPages ? 'disabled' : ''}>Next &rarr;</button>
            `;
            document.getElementById('sales-prev-page')?.addEventListener('click', () => { salesPage--; renderSalesTable(); });
            document.getElementById('sales-next-page')?.addEventListener('click', () => { salesPage++; renderSalesTable(); });
        }
    }
}

/** Exports the currently filtered/sorted sales (all pages, not just the visible one) as a CSV download. */
function exportSalesCsv() {
    const sales = getFilteredSortedSales();
    if (!sales.length) {
        toast.warning('No sales to export');
        return;
    }
    const header = ['Sale ID', 'Product', 'Quantity', 'Revenue (est.)', 'Date'];
    const rows = sales.map(sale => {
        const price = priceByProductId[sale.product_id];
        const revenue = (price !== undefined) ? (sale.quantity * price).toFixed(2) : '';
        // Quote fields that might contain commas (product names); escape embedded quotes.
        const safeName = `"${(sale.product_name || '').replace(/"/g, '""')}"`;
        return [sale.sale_id, safeName, sale.quantity, revenue, sale.date].join(',');
    });
    const csv = [header.join(','), ...rows].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales_${salesRangeDays}d_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('sales-form').addEventListener('submit', recordSale);
    document.getElementById('product-id')?.addEventListener('change', updateSalePreview);
    document.getElementById('quantity')?.addEventListener('input', updateSalePreview);

    document.getElementById('sales-range')?.addEventListener('change', (e) => {
        salesRangeDays = parseInt(e.target.value, 10) || 30;
        salesPage = 1;
        loadRecentSales();
    });
    document.getElementById('sales-product-filter')?.addEventListener('change', (e) => {
        salesProductFilter = e.target.value;
        salesPage = 1;
        renderSalesTable();
    });
    document.getElementById('sales-sort')?.addEventListener('change', (e) => {
        salesSortOrder = e.target.value;
        salesPage = 1;
        renderSalesTable();
    });
    document.getElementById('sales-export-btn')?.addEventListener('click', exportSalesCsv);
});

window.loadSalesPage = loadSalesPage;
