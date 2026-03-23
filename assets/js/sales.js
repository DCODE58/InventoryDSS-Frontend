let productsList = [];

async function loadSalesPage(silent = false) {
    if (!silent) showSkeleton('sales');
    await Promise.all([loadProductDropdown(), loadRecentSales()]);
    if (!silent) toast.success('Sales page ready');
}

async function loadProductDropdown() {
    try {
        productsList = await api.getProducts();
        const select = document.getElementById('product-id');
        select.innerHTML = '<option value="">Select Product</option>' + productsList.map(p => `<option value="${p.product_id}">${escapeHtml(p.name)}</option>`).join('');
    } catch (error) {
        console.error('Failed to load products for sales', error);
        document.getElementById('product-id').innerHTML = '<option>Failed to load products</option>';
    }
}

async function recordSale(event) {
    event.preventDefault();
    const productId = document.getElementById('product-id').value;
    const quantity = parseInt(document.getElementById('quantity').value, 10);
    if (!productId || !quantity) {
        toast.warning('Please select product and quantity');
        return;
    }
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
        const sales = await api.getRecentSales(30);
        const tbody = document.getElementById('recent-sales-list');
        if (!sales.length) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">📭 No sales recorded yet</td></tr>';
            return;
        }
        tbody.innerHTML = sales.map(sale => `
            <tr>
                <td>${sale.sale_id}</td>
                <td>${escapeHtml(sale.product_name)}</td>
                <td>${sale.quantity}</td>
                <td>${helpers.formatDate(sale.date)}</td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading recent sales', error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('sales-form').addEventListener('submit', recordSale);
});

window.loadSalesPage = loadSalesPage;
