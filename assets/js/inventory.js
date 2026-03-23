let inventoryData = [];

async function loadInventory(silent = false) {
    if (!silent) showSkeleton('inventory');
    try {
        inventoryData = await api.getInventory();
        renderInventoryTable(inventoryData);
        if (!silent) toast.success('Inventory loaded');
    } catch (error) {
        console.error('Error loading inventory:', error);
        document.getElementById('inventory-list').innerHTML = '<tr><td colspan="7">Failed to load inventory</td></tr>';
        if (!silent) toast.error('Failed to load inventory');
    }
}

function renderInventoryTable(data) {
    const tbody = document.getElementById('inventory-list');
    if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">📭 No inventory data found. Add products first.</td></tr>';
        return;
    }
    tbody.innerHTML = data.map(item => {
        const status = helpers.getStockStatus(item.stock, item.reorder_point);
        return `
            <tr>
                <td>${item.product_id}</td>
                <td>${escapeHtml(item.product_name)}</td>
                <td>${item.stock}</td>
                <td>${item.reorder_point}</td>
                <td>${item.safety_stock}</td>
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
    if (isNaN(newStock)) return;
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
});

window.loadInventory = loadInventory;
