let inventoryData = [];
let inventorySearchTerm = '';
let inventoryRendered = false;
let inventoryLoadSeq = 0;
let savingStock = false;
// product_name → forecast daily demand, built from the forecast endpoint
// (which returns per-product totals over `days_ahead`).
let dailyDemandByName = {};

const $i = (id) => document.getElementById(id);

async function loadInventory(silent = false) {
    const seq = ++inventoryLoadSeq;
    const tbody = $i('inventory-list');
    if (!inventoryRendered) ui.tableSkeleton(tbody, 8);
    try {
        const [inventory, forecast] = await Promise.all([
            api.getInventory(),
            api.getForecast().catch(() => null),   // "days left" is a bonus column; don't fail the page without it
        ]);
        if (seq !== inventoryLoadSeq) return;
        inventoryData = inventory;

        dailyDemandByName = {};
        if (forecast) {
            const daysAhead = helpers.toNumber(forecast.days_ahead) || 30;
            forecast.labels.forEach((name, i) => {
                const total = helpers.toNumber(forecast.values[i]);
                if (total !== null) dailyDemandByName[name] = total / daysAhead;
            });
        }
        inventoryRendered = true;
        renderInventoryTable();
    } catch (error) {
        if (seq !== inventoryLoadSeq) return;
        console.error('Error loading inventory:', error);
        if (!inventoryRendered) {
            ui.tableState(tbody, 8, { kind: 'error', title: "Inventory couldn't be loaded", text: ui.errorDetail(error) || 'Check your connection and try again.', actionLabel: 'Try again', onAction: () => loadInventory(false) });
            $i('inventory-count').textContent = '';
        } else if (!silent) {
            ui.reportError(error, "Couldn't refresh inventory");
        }
    }
}

function filterInventory(data) {
    const term = inventorySearchTerm.trim().toLowerCase();
    if (!term) return data;
    return data.filter((item) => String(item.product_name ?? '').toLowerCase().includes(term));
}

function renderInventoryTable() {
    const tbody = $i('inventory-list');
    const data = filterInventory(inventoryData);
    $i('inventory-count').textContent = inventorySearchTerm.trim()
        ? `${data.length} of ${inventoryData.length} items`
        : `${inventoryData.length} item${inventoryData.length !== 1 ? 's' : ''}`;

    if (!data.length) {
        if (inventorySearchTerm.trim()) ui.tableState(tbody, 8, { kind: 'empty', icon: 'fa-magnifying-glass', title: 'No inventory items match your search', text: 'Try a different name or clear the search.' });
        else ui.tableState(tbody, 8, { kind: 'empty', icon: 'fa-warehouse', title: 'No inventory yet', text: 'Add a product and set its stock to see it here.' });
        return;
    }

    tbody.innerHTML = data.map((item) => {
        const status = helpers.getStockStatus(item.stock, item.reorder_point);
        const daysLeft = helpers.getDaysOfStock(item.stock, dailyDemandByName[item.product_name]);
        const daysCell = daysLeft === null
            ? '<span class="muted" title="Not enough forecast demand to estimate">Unavailable</span>'
            : `<span class="${daysLeft <= 3 ? 'text-danger' : (daysLeft <= 7 ? 'text-warning' : '')}" title="Estimate based on forecast demand">~${daysLeft} day${daysLeft !== 1 ? 's' : ''}</span>`;
        const id = escapeHtml(item.product_id);
        const name = escapeHtml(item.product_name);
        return `
            <tr>
                <td>${id}</td>
                <td class="cell-name">${name}</td>
                <td class="num">${escapeHtml(item.stock)}</td>
                <td class="num">${escapeHtml(item.reorder_point)}</td>
                <td class="num">${escapeHtml(item.safety_stock)}</td>
                <td class="num">${daysCell}</td>
                <td><span class="badge ${status.class}"><i class="fas ${status.icon}" aria-hidden="true"></i>${status.text}</span></td>
                <td class="cell-actions"><button type="button" class="btn btn-primary btn-sm update-stock" data-id="${id}" aria-label="Update stock for ${name}">Update</button></td>
            </tr>`;
    }).join('');
}

function openStockModal(productId, opener) {
    const item = inventoryData.find((i) => String(i.product_id) === String(productId));
    ui.clearFieldErrors($i('stock-form'));
    $i('stock-product-id').value = productId;
    $i('stock-product-name').textContent = item ? item.product_name : `Product ${productId}`;
    $i('stock-current').textContent = item && helpers.toNumber(item.stock) !== null ? helpers.formatNumber(item.stock) : 'Unknown';
    $i('new-stock').value = '';
    ui.openModal('stock-modal', { opener, focus: 'new-stock' });
}

async function updateStock(event) {
    event.preventDefault();
    if (savingStock) return;

    const productId = $i('stock-product-id').value;
    const raw = $i('new-stock').value.trim();
    const newStock = raw === '' ? null : helpers.toNumber(raw);
    ui.clearFieldErrors($i('stock-form'));
    if (newStock === null || !Number.isInteger(newStock) || newStock < 0) {
        ui.fieldError('new-stock', raw === '' ? 'Enter the new stock quantity.' : 'Stock must be a whole number, 0 or more.');
        $i('new-stock').focus();
        return;
    }

    const btn = $i('stock-save');
    savingStock = true;
    ui.setBusy(btn, true, 'Updating…');
    ui.setModalBusy('stock-modal', true);
    try {
        await api.updateStock(productId, newStock);           // UI changes only after the server confirms
        ui.setModalBusy('stock-modal', false);
        ui.closeModal('stock-modal', { force: true });
        toast.success('Stock updated');
        await loadInventory(true);
        // The row was re-rendered, so give focus back to the same product's button.
        if (document.activeElement === document.body) document.querySelector(`.update-stock[data-id="${CSS.escape(String(productId))}"]`)?.focus();
        if (typeof loadDashboard === 'function' && !$i('dashboard').classList.contains('hidden')) loadDashboard(true);
    } catch (error) {
        ui.reportError(error, 'Stock update failed');          // dialog stays open with the entered value
    } finally {
        savingStock = false;
        ui.setBusy(btn, false);
        ui.setModalBusy('stock-modal', false);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    $i('stock-form').addEventListener('submit', updateStock);
    $i('inventory-list').addEventListener('click', (e) => {
        const btn = e.target.closest('.update-stock');
        if (btn) openStockModal(btn.dataset.id, btn);
    });
    $i('inventory-search').addEventListener('input', helpers.debounce((e) => {
        inventorySearchTerm = e.target.value;
        if (inventoryRendered) renderInventoryTable();
    }, 150));
});

window.loadInventory = loadInventory;
