let currentProducts = [];

async function loadProducts(silent = false) {
    if (!silent) showSkeleton('products');
    try {
        currentProducts = await api.getProducts();
        renderProductsTable(currentProducts);
        if (!silent) toast.success('Products loaded');
    } catch (error) {
        console.error('Error loading products:', error);
        document.getElementById('products-list').innerHTML = '<tr><td colspan="5">Failed to load products</td></tr>';
        if (!silent) toast.error('Failed to load products');
    }
}

function renderProductsTable(products) {
    const tbody = document.getElementById('products-list');
    if (!products.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;"> No products yet. Click "Add Product" to start.</td></tr>';
        return;
    }
    tbody.innerHTML = products.map(p => `
        <tr>
            <td>${p.product_id}</td>
            <td>${escapeHtml(p.name)}</td>
            <td>${helpers.formatCurrency(p.cost)}</td>
            <td>${helpers.formatCurrency(p.price)}</td>
            <td>
                <button class="btn btn-secondary edit-product" data-id="${p.product_id}">Edit</button>
                <button class="btn btn-danger delete-product" data-id="${p.product_id}">Delete</button>
            </td>
        </tr>
    `).join('');
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
    if (productId) {
        const product = currentProducts.find(p => p.product_id == productId);
        if (!product) return;
        title.textContent = 'Edit Product';
        idField.value = product.product_id;
        nameField.value = product.name;
        costField.value = product.cost;
        priceField.value = product.price;
    } else {
        title.textContent = 'Add Product';
        idField.value = '';
        nameField.value = '';
        costField.value = '';
        priceField.value = '';
    }
    modal.classList.remove('hidden');
}

async function saveProduct(event) {
    event.preventDefault();
    const id = document.getElementById('product-id-edit').value;
    const productData = {
        name: document.getElementById('product-name').value,
        cost: parseFloat(document.getElementById('product-cost').value),
        price: parseFloat(document.getElementById('product-price').value)
    };
    try {
        if (id) {
            await api.updateProduct(id, productData);
            toast.success('Product updated');
        } else {
            await api.addProduct(productData);
            toast.success('Product added');
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
});

window.loadProducts = loadProducts;
