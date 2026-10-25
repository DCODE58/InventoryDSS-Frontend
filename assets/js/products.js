let currentProducts = [];
let productsSearchTerm = '';

async function loadProducts(silent = false) {
    if (!silent) showSkeleton('products');
    try {
        currentProducts = await api.getProducts();
        renderProductsTable(filterProducts(currentProducts));
        if (!silent) toast.success('Products loaded');
    } catch (error) {
        console.error('Error loading products:', error);
        document.getElementById('products-list').innerHTML = '<tr><td colspan="6">Failed to load products</td></tr>';
        if (!silent) toast.error('Failed to load products');
    }
}

function filterProducts(products) {
    const term = productsSearchTerm.trim().toLowerCase();
    if (!term) return products;
    return products.filter(p => p.name.toLowerCase().includes(term));
}

function renderProductsTable(products) {
    const tbody = document.getElementById('products-list');
    if (!products.length) {
        const message = productsSearchTerm
            ? 'No products match your search.'
            : 'No products yet. Click "Add Product" to start.';
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">${message}</td></tr>`;
        return;
    }
    tbody.innerHTML = products.map(p => {
        const margin = helpers.calculateMargin(p.cost, p.price);
        const marginCell = margin
            ? `<span class="badge ${helpers.getMarginBadgeClass(margin.percent)}">
                 ${margin.amount >= 0 ? '🔼' : '🔽'}
                 ${helpers.formatCurrency(margin.amount)} (${margin.percent.toFixed(1)}%)
               </span>`
            : '—';
        return `
        <tr>
            <td>${p.product_id}</td>
            <td>${escapeHtml(p.name)}</td>
            <td>${helpers.formatCurrency(p.cost)}</td>
            <td>${helpers.formatCurrency(p.price)}</td>
            <td>${marginCell}</td>
            <td>
                <button class="btn btn-secondary edit-product" data-id="${p.product_id}">Edit</button>
                <button class="btn btn-danger delete-product" data-id="${p.product_id}">Delete</button>
            </td>
        </tr>
    `;
    }).join('');
    document.querySelectorAll('.edit-product').forEach(btn => btn.addEventListener('click', () => openProductModal(btn.dataset.id)));
    document.querySelectorAll('.delete-product').forEach(btn => btn.addEventListener('click', () => deleteProduct(btn.dataset.id)));
}

function openProductModal(productId = null) {
    const modal = document.getElementById('product-modal');
    const title = document.getElementById('modal-title');
    const idField = document.getElementById('product-id-edit');
    const nameField = document.getElementById('product-name');
    const costField = document.getElementById('product-cost');
    const priceField = document.getElementById('product-price');
    const stockField = document.getElementById('product-stock');
    if (productId) {
        const product = currentProducts.find(p => p.product_id == productId);
        if (!product) return;
        title.textContent = 'Edit Product';
        idField.value = product.product_id;
        nameField.value = product.name;
        costField.value = product.cost;
        priceField.value = product.price;
        stockField.value = product.stock ?? 0;
    } else {
        title.textContent = 'Add Product';
        idField.value = '';
        nameField.value = '';
        costField.value = '';
        priceField.value = '';
        stockField.value = 0;
    }
    modal.classList.remove('hidden');
}

/**
 * Validates the product form before it ever reaches the API. Returns a
 * parsed, trimmed payload on success or null (after showing a toast) on
 * failure — mirrors the checks the backend also enforces, so a bad value
 * gets a specific, immediate message instead of a generic server error.
 */
function validateProductForm() {
    const name = document.getElementById('product-name').value.trim();
    const cost = parseFloat(document.getElementById('product-cost').value);
    const price = parseFloat(document.getElementById('product-price').value);
    const stock = parseInt(document.getElementById('product-stock').value, 10);

    if (!name) {
        toast.warning('Product name is required');
        return null;
    }
    if (name.length > 100) {
        toast.warning('Product name must be under 100 characters');
        return null;
    }
    if (isNaN(cost) || cost < 0) {
        toast.warning('Enter a valid, non-negative cost');
        return null;
    }
    if (isNaN(price) || price < 0) {
        toast.warning('Enter a valid, non-negative price');
        return null;
    }
    if (isNaN(stock) || stock < 0) {
        toast.warning('Enter a valid, non-negative stock quantity');
        return null;
    }
    return { name, cost, price, stock };
}

async function saveProduct(event) {
    event.preventDefault();
    const id = document.getElementById('product-id-edit').value;

    const validated = validateProductForm();
    if (!validated) return;
    const { name, cost, price, stock } = validated;
    const productData = { name, cost, price };

    try {
        let savedId = id;
        if (id) {
            await api.updateProduct(id, productData);
            toast.success('Product updated');
        } else {
            const result = await api.addProduct(productData);
            savedId = result.product_id ?? result.id ?? id;
            toast.success('Product added');
        }
        // Set initial stock via the inventory endpoint
        if (savedId) {
            await api.updateStock(savedId, stock);
        }
        closeModal('product-modal');
        await loadProducts(true);
    } catch (error) {
        toast.error('Failed to save product');
    }
}

async function deleteProduct(id) {
    if (!confirm('Are you sure you want to delete this product?')) return;
    try {
        await api.deleteProduct(id);
        toast.success('Product deleted');
        await loadProducts(true);
    } catch (error) {
        toast.error('Delete failed');
    }
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('add-product-btn').addEventListener('click', () => openProductModal());
    document.getElementById('product-form').addEventListener('submit', saveProduct);
    document.querySelectorAll('.close-modal').forEach(btn => btn.addEventListener('click', (e) => {
        const modal = btn.closest('.modal');
        if (modal) modal.classList.add('hidden');
    }));
    window.addEventListener('click', (e) => { if (e.target.classList.contains('modal')) e.target.classList.add('hidden'); });

    const searchInput = document.getElementById('products-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            productsSearchTerm = e.target.value;
            renderProductsTable(filterProducts(currentProducts));
        });
    }
});

window.loadProducts = loadProducts;
