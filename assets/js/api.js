// ─── Cache ───────────────────────────────────────────────────────────────────
const CACHE_KEYS = {
    PRODUCTS:    'products',
    INVENTORY:   'inventory',
    SALES:       (days) => `sales_${days}`,
    ROP_ALERTS:  'rop_alerts',
    EOQ_SUMMARY: 'eoq_summary',
    FORECAST:    'forecast_all',
};

const cache = new Map();

function getCached(key, fn, ttl = 10000) {
    const now = Date.now();
    const cached = cache.get(key);
    if (cached && now - cached.time < ttl) return Promise.resolve(cached.data);
    return fn().then(data => {
        cache.set(key, { data, time: now });
        return data;
    });
}

function invalidateCache(...keys) {
    keys.forEach(k => cache.delete(k));
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
async function fetchWithTimeout(resource, options = {}, timeout = 8000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(resource, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        if (error.name === 'AbortError') throw new Error('Request timed out');
        throw error;
    }
}

async function handleResponse(response) {
    if (!response.ok) {
        let msg = `HTTP ${response.status}`;
        try { const body = await response.json(); msg = body.error || msg; } catch (_) {}
        throw new Error(msg);
    }
    return response.json();
}

// ─── API client ───────────────────────────────────────────────────────────────
const api = {
    async request(endpoint, options = {}) {
        const url = `${API_BASE_URL}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            ...options.headers,
        };
        try {
            const response = await fetchWithTimeout(url, { ...options, headers });
            return await handleResponse(response);
        } catch (error) {
            console.error(`API error [${endpoint}]:`, error.message);
            if (window.toast) {
                const msg = error.message.includes('timed out')
                    ? 'Request timed out. Check your connection.'
                    : error.message || 'Network error';
                toast.error(msg);
            }
            throw error;
        }
    },

    // ── Products ──────────────────────────────────────────────────────────────
    getProducts(ttl = 10000) {
        return getCached(CACHE_KEYS.PRODUCTS, () => this.request('/products/'), ttl);
    },
    addProduct(product) {
        invalidateCache(CACHE_KEYS.PRODUCTS);
        return this.request('/products/', { method: 'POST', body: JSON.stringify(product) });
    },
    updateProduct(id, product) {
        invalidateCache(CACHE_KEYS.PRODUCTS);
        return this.request(`/products/${id}`, { method: 'PUT', body: JSON.stringify(product) });
    },
    deleteProduct(id) {
        invalidateCache(CACHE_KEYS.PRODUCTS, CACHE_KEYS.INVENTORY);
        return this.request(`/products/${id}`, { method: 'DELETE' });
    },

    // ── Inventory ─────────────────────────────────────────────────────────────
    getInventory(ttl = 10000) {
        return getCached(CACHE_KEYS.INVENTORY, () => this.request('/inventory/'), ttl);
    },
    updateStock(productId, stock) {
        invalidateCache(CACHE_KEYS.INVENTORY, CACHE_KEYS.ROP_ALERTS);
        return this.request('/inventory/update', {
            method: 'PUT',
            body: JSON.stringify({ product_id: productId, stock }),
        });
    },

    // ── Sales ─────────────────────────────────────────────────────────────────
    recordSale(sale) {
        invalidateCache(
            CACHE_KEYS.INVENTORY,
            CACHE_KEYS.ROP_ALERTS,
            CACHE_KEYS.FORECAST,
            CACHE_KEYS.SALES(30),
        );
        return this.request('/sales/', { method: 'POST', body: JSON.stringify(sale) });
    },
    getRecentSales(days = 30) {
        return getCached(
            CACHE_KEYS.SALES(days),
            () => this.request(`/sales/recent?days=${days}`),
            5000,
        );
    },

    // ── Optimization / alerts ─────────────────────────────────────────────────
    // GET /api/inventory/alerts  → items where stock ≤ reorder_point
    getROPAlerts() {
        return getCached(
            CACHE_KEYS.ROP_ALERTS,
            () => this.request('/inventory/alerts'),
            5000,
        );
    },

    // GET /api/optimize/summary  → per-product EOQ + ROP summary
    getEOQ() {
        return getCached(
            CACHE_KEYS.EOQ_SUMMARY,
            () => this.request('/optimize/summary'),
            10000,
        );
    },

    // GET /api/sales/forecast/all  → { labels: [...], values: [...] }
    getForecast() {
        return getCached(
            CACHE_KEYS.FORECAST,
            () => this.request('/sales/forecast/all'),
            30000,
        );
    },
};
