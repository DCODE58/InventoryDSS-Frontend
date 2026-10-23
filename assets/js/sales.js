let productsList = [];
let priceByProductId = {};
let salesRangeDays = 30;

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
    } catch (error) {
        console.error('Failed to load products for sales', error);
        document.getElementById('product-id').innerHTML = '<option>Failed to load products</option>';
    }
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
        const sales = await api.getRecentSales(salesRangeDays);
        const tbody = document.getElementById('recent-sales-list');
        const totalEl = document.getElementById('sales-total');

        if (!sales.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;"> No sales recorded yet</td></tr>';
            if (totalEl) totalEl.textContent = '';
            return;
        }

        let totalRevenue = 0;
        tbody.innerHTML = sales.map(sale => {
            // Revenue uses the product's CURRENT price — sale records don't store
            // a historical unit price, so this is an estimate for older sales
            // if the price has since changed.
            const price = priceByProductId[sale.product_id];
            const revenue = (price !== undefined) ? sale.quantity * price : null;
            if (revenue !== null) totalRevenue += revenue;

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
    } catch (error) {
        console.error('Error loading recent sales', error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('sales-form').addEventListener('submit', recordSale);

    const rangeSelect = document.getElementById('sales-range');
    if (rangeSelect) {
        rangeSelect.addEventListener('change', (e) => {
            salesRangeDays = parseInt(e.target.value, 10) || 30;
            loadRecentSales();
        });
    }
});

window.loadSalesPage = loadSalesPage;
