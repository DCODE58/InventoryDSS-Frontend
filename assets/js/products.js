let currentProducts = [];
let productsSearchTerm = '';
let productsRendered = false;
let productsLoadSeq = 0;
let savingProduct = false;
const deletingIds = new Set();

const $p = (id) => document.getElementById(id);

async function loadProducts(silent = false) {
    const seq = ++productsLoadSeq;
    const tbody = $p('products-list');
    if (!productsRendered) ui.tableSkeleton(tbody, 6);
    try {
        const products = await api.getProducts();
        if (seq !== productsLoadSeq) return;           // a newer load superseded this one
        currentProducts = products;
        productsRendered = true;
        renderProductsTable();
    } catch (error) {
        if (seq !== productsLoadSeq) return;
        console.error('Error loading products:', error);
        if (!productsRendered) {
            ui.tableState(tbody, 6, { kind: 'error', title: "Products couldn't be loaded", text: ui.errorDetail(error) || 'Check your connection and try again.', actionLabel: 'Try again', onAction: () => loadProducts(false) });
            $p('products-count').textContent = '';
        } else if (!silent) {
            ui.reportError(error, "Couldn't refresh products");
        }
    }
}

function filterProducts(products) {
    const term = productsSearchTerm.trim().toLowerCase();
    if (!term) return products;
    return products.filter((p) => String(p.name ?? '').toLowerCase().includes(term));
}

function renderProductsTable() {
    const tbody = $p('products-list');
    const products = filterProducts(currentProducts);
    const countEl = $p('products-count');
    countEl.textContent = productsSearchTerm.trim()
        ? `${products.length} of ${currentProducts.length} products`
        : `${currentProducts.length} product${currentProducts.length !== 1 ? 's' : ''}`;

    if (!products.length) {
        if (productsSearchTerm.trim()) {
            ui.tableState(tbody, 6, { kind: 'empty', icon: 'fa-magnifying-glass', title: 'No products match your search', text: 'Try a different name or clear the search.' });
        } else {
            ui.tableState(tbody, 6, { kind: 'empty', icon: 'fa-cube', title: 'No products yet', text: 'Add your first product to start tracking stock and sales.', actionLabel: 'Add Product', onAction: () => openProductModal(null, $p('add-product-btn')) });
        }
        return;
    }

    tbody.innerHTML = products.map((p) => {
        const margin = helpers.calculateMargin(p.cost, p.price);
        const marginCell = margin
            ? `<span class="margin-cell">
                   <span class="badge ${helpers.getMarginBadgeClass(margin.percent)}"><i class="fas ${margin.amount < 0 ? 'fa-arrow-trend-down' : 'fa-arrow-trend-up'}" aria-hidden="true"></i>${helpers.formatCurrency(margin.amount)}</span>
                   <small>${margin.percent.toFixed(1)}% of cost</small>
               </span>`
            : '<span class="muted" title="Cost or price is missing or invalid">Unavailable</span>';
        const id = escapeHtml(p.product_id);
        const name = escapeHtml(p.name);
        const nameHtml = helpers.highlight(p.name, productsSearchTerm);
        return `
        <tr>
            <td>${id}</td>
            <td class="cell-name">${nameHtml}</td>
            <td class="num">${helpers.formatCurrency(p.cost)}</td>
            <td class="num">${helpers.formatCurrency(p.price)}</td>
            <td class="num">${marginCell}</td>
            <td class="cell-actions">
                <button type="button" class="btn btn-secondary btn-sm edit-product" data-id="${id}" aria-label="Edit ${name}"><i class="fas fa-pen" aria-hidden="true"></i>Edit</button>
                <button type="button" class="btn btn-danger btn-sm delete-product" data-id="${id}" aria-label="Delete ${name}"${deletingIds.has(String(p.product_id)) ? ' disabled' : ''}><i class="fas fa-trash-can" aria-hidden="true"></i>Delete</button>
            </td>
        </tr>`;
    }).join('');
}

// ─── Modal ───────────────────────────────────────────────────────────────────
function setProductModalMode(isEdit) {
    $p('modal-title').textContent = isEdit ? 'Edit Product' : 'Add Product';
}

function openProductModal(productId = null, opener) {
    const form = $p('product-form');
    ui.clearFieldErrors(form);
    ui.formAlert('product-form-alert', '');

    if (productId !== null && productId !== undefined && productId !== '') {
        const product = currentProducts.find((p) => String(p.product_id) === String(productId));
        if (!product) return;
        setProductModalMode(true);
        $p('product-modal-sub').textContent = `Product ID ${product.product_id}`;
        $p('product-id-edit').value = product.product_id;
        $p('product-name').value = product.name ?? '';
        $p('product-cost').value = product.cost ?? '';
        $p('product-price').value = product.price ?? '';
        $p('product-stock').value = product.stock ?? 0;
    } else {
        setProductModalMode(false);
        $p('product-modal-sub').textContent = 'Stock is saved separately from the product details.';
        $p('product-id-edit').value = '';
        $p('product-name').value = '';
        $p('product-cost').value = '';
        $p('product-price').value = '';
        $p('product-stock').value = 0;
    }
    ui.openModal('product-modal', { opener, focus: 'product-name' });
}

/**
 * Validates the form and shows inline messages. Returns a parsed payload, or
 * null after focusing the first invalid field.
 */
function validateProductForm() {
    const form = $p('product-form');
    ui.clearFieldErrors(form);
    const errors = [];
    const req = (id, msg) => errors.push([id, msg]);

    const name = $p('product-name').value.trim();
    const costRaw = $p('product-cost').value.trim();
    const priceRaw = $p('product-price').value.trim();
    const stockRaw = $p('product-stock').value.trim();
    const cost = costRaw === '' ? null : helpers.toNumber(costRaw);
    const price = priceRaw === '' ? null : helpers.toNumber(priceRaw);
    const stock = stockRaw === '' ? null : helpers.toNumber(stockRaw);

    if (!name) req('product-name', 'Enter a product name.');
    else if (name.length > 100) req('product-name', 'Product name must be 100 characters or fewer.');

    if (cost === null) req('product-cost', costRaw === '' ? 'Enter the cost.' : 'Enter a valid number.');
    else if (cost < 0) req('product-cost', 'Cost can’t be negative.');

    if (price === null) req('product-price', priceRaw === '' ? 'Enter the selling price.' : 'Enter a valid number.');
    else if (price < 0) req('product-price', 'Selling price can’t be negative.');

    if (stock === null) req('product-stock', stockRaw === '' ? 'Enter the stock quantity (0 if none).' : 'Enter a whole number.');
    else if (!Number.isInteger(stock) || stock < 0) req('product-stock', 'Stock must be a whole number, 0 or more.');

    if (errors.length) {
        errors.forEach(([id, msg]) => ui.fieldError(id, msg));
        ui.formAlert('product-form-alert', `Fix ${errors.length} field${errors.length !== 1 ? 's' : ''} before saving.`);
        $p(errors[0][0]).focus();
        return null;
    }
    ui.formAlert('product-form-alert', '');
    return { name, cost, price, stock };
}

async function saveProduct(event) {
    event.preventDefault();
    if (savingProduct) return;                         // block double submit
    const validated = validateProductForm();
    if (!validated) return;

    const { name, cost, price, stock } = validated;
    const productData = { name, cost, price };
    const btn = $p('product-save');
    let id = $p('product-id-edit').value;
    const wasNew = !id;
    let phase = 'product';

    savingProduct = true;
    ui.setBusy(btn, true, 'Saving…');
    ui.setModalBusy('product-modal', true);
    try {
        if (id) {
            await api.updateProduct(id, productData);
        } else {
            const result = await api.addProduct(productData);
            id = result && (result.product_id ?? result.id) || '';
            if (id) {
                // The product now exists. From here on a retry must UPDATE it, never create it again.
                $p('product-id-edit').value = id;
                setProductModalMode(true);
                $p('product-modal-sub').textContent = `Product ID ${id}`;
            }
        }

        phase = 'stock';
        if (id) {
            await api.updateStock(id, stock);
        }

        ui.setModalBusy('product-modal', false);
        ui.closeModal('product-modal', { force: true });
        if (!id) {
            toast.warning('Product added, but the server didn’t return its ID, so the stock quantity wasn’t saved. Set it from the Inventory page.');
        } else {
            toast.success(wasNew ? 'Product added' : 'Product updated');
        }
        await loadProducts(true);
        if (document.activeElement === document.body) (document.querySelector(`.edit-product[data-id="${CSS.escape(String(id))}"]`) || $p('add-product-btn'))?.focus();
    } catch (error) {
        console.error('Save product failed:', error);
        if (phase === 'stock' && id) {
            // Product saved, stock not: report accurately and keep the dialog (now in edit mode) for a safe retry.
            error.reported = true;
            ui.formAlert('product-form-alert', `The product was ${wasNew ? 'added' : 'updated'}, but its stock quantity couldn’t be saved (${ui.errorDetail(error) || 'unknown error'}). Press Save to retry; the product won’t be duplicated.`);
            toast.warning(`Product ${wasNew ? 'added' : 'updated'}, but its stock wasn’t saved. Press Save to retry.`);
            loadProducts(true);                        // show the saved product behind the dialog
        } else {
            ui.reportError(error, 'Failed to save product');
        }
    } finally {
        savingProduct = false;
        ui.setBusy(btn, false);
        ui.setModalBusy('product-modal', false);
    }
}

async function deleteProduct(id, opener) {
    const key = String(id);
    if (deletingIds.has(key)) return;
    const product = currentProducts.find((p) => String(p.product_id) === key);
    const ok = await ui.confirm({
        title: 'Delete this product?',
        message: `“${product ? product.name : 'This product'}” will be permanently deleted. This can’t be undone. Related inventory and sales records are handled by the server and may be affected.`,
        confirmLabel: 'Delete product',
        opener,
    });
    if (!ok) return;

    deletingIds.add(key);
    renderProductsTable();
    try {
        await api.deleteProduct(id);
        toast.success('Product deleted');
    } catch (error) {
        ui.reportError(error, 'Delete failed');
    } finally {
        deletingIds.delete(key);
    }
    await loadProducts(true);
}

document.addEventListener('DOMContentLoaded', () => {
    $p('add-product-btn').addEventListener('click', (e) => openProductModal(null, e.currentTarget));
    $p('product-form').addEventListener('submit', saveProduct);

    $p('products-list').addEventListener('click', (e) => {
        const edit = e.target.closest('.edit-product');
        if (edit) { openProductModal(edit.dataset.id, edit); return; }
        const del = e.target.closest('.delete-product');
        if (del && !del.disabled) deleteProduct(del.dataset.id, del);
    });

    $p('products-search').addEventListener('input', helpers.debounce((e) => {
        productsSearchTerm = e.target.value;
        if (productsRendered) renderProductsTable();
    }, 150));
});

window.loadProducts = loadProducts;
