let inventoryData = [];
let inventorySearchTerm = '';
// Map of product_name -> forecasted daily demand, built from the dashboard
// forecast endpoint (which returns totals per product over `days_ahead`).
let dailyDemandByName = {};

async function loadInventory(silent = false) {
    if (!silent) showSkeleton('inventory');
    try {
        const [inventory, forecast] = await Promise.all([
            api.getInventory(),
            api.getForecast().catch(() => null), // days-left is a bonus column; don't fail the page without it
        ]);
        inventoryData = inventory;

        dailyDemandByName = {};
        if (forecast && Array.isArray(forecast.labels) && Array.isArray(forecast.values)) {
            const daysAhead = forecast.days_ahead || 30;
            forecast.labels.forEach((name, i) => {
                dailyDemandByName[name] = (forecast.values[i] || 0) / daysAhead;
            });
        }

        renderInventoryTable(filterInventory(inventoryData));
        if (!silent) toast.success('Inventory loaded');
    } catch (error) {
        console.error('Error loading inventory:', error);
        document.getElementById('inventory-list').innerHTML = '<tr><td colspan="8">Failed to load inventory</td></tr>';
        if (!silent) toast.error('Failed to load inventory');
    }
}

function filterInventory(data) {
    const term = inventorySearchTerm.trim().toLowerCase();
    if (!term) return data;
    return data.filter(item => item.product_name.toLowerCase().includes(term));
}

function renderInventoryTable(data) {
    const tbody = document.getElementById('inventory-list');
    if (!data.length) {
        const message = inventorySearchTerm
            ? 'No inventory items match your search.'
            : 'No inventory data found. Add products first.';
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;">${message}</td></tr>`;
        return;
    }
    tbody.innerHTML = data.map(item => {
        const status = helpers.getStockStatus(item.stock, item.reorder_point);
        const dailyDemand = dailyDemandByName[item.product_name];
        const daysLeft = helpers.getDaysOfStock(item.stock, dailyDemand);
        const daysLeftCell = daysLeft === null
            ? '<span title="Not enough sales history yet">—</span>'
            : `<span class="${daysLeft <= 3 ? 'text-danger' : (daysLeft <= 7 ? 'text-warning' : '')}">${daysLeft}d</span>`;
        return `
            <tr>
                <td>${item.product_id}</td>
                <td>${escapeHtml(item.product_name)}</td>
                <td>${item.stock}</td>
                <td>${item.reorder_point}</td>
                <td>${item.safety_stock}</td>
                <td>${daysLeftCell}</td>
                <td><span class="badge ${status.class}">${status.text}</span></td>
                <td><button class="btn btn-primary update-stock" data-id="${item.product_id}">Update</button></td>
            </tr>
        `;
    }).join('');
    document.querySelectorAll('.update-stock').forEach(btn => btn.addEventListener('click', () => openStockModal(btn.dataset.id)));
}

function openStockModal(productId) {
    const modal = document.getElementById('stock-modal');
    document.getElementById('stock-product-id').value = productId;
    document.getElementById('new-stock').value = '';
    modal.classList.remove('hidden');
}

async function updateStock(event) {
    event.preventDefault();
    const productId = document.getElementById('stock-product-id').value;
    const newStock = parseInt(document.getElementById('new-stock').value, 10);
    if (isNaN(newStock) || newStock < 0) {
        toast.warning('Enter a valid, non-negative stock quantity');
        return;
    }
    try {
        await api.updateStock(productId, newStock);
        toast.success('Stock updated');
        closeModal('stock-modal');
        await loadInventory(true);
        if (typeof loadDashboard === 'function' && !document.getElementById('dashboard').classList.contains('hidden')) {
            loadDashboard(true);
        }
    } catch (error) {
        toast.error('Update failed');
    }
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('stock-form').addEventListener('submit', updateStock);
    document.querySelectorAll('.close-modal').forEach(btn => btn.addEventListener('click', (e) => {
        const modal = btn.closest('.modal');
        if (modal) modal.classList.add('hidden');
    }));
    window.addEventListener('click', (e) => { if (e.target.classList.contains('modal')) e.target.classList.add('hidden'); });

    const searchInput = document.getElementById('inventory-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            inventorySearchTerm = e.target.value;
            renderInventoryTable(filterInventory(inventoryData));
        });
    }
});

window.loadInventory = loadInventory;
