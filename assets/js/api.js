// Cache keys
const CACHE_KEYS = {
    PRODUCTS: 'products',
    INVENTORY: 'inventory',
    SALES: (days) => `sales_${days}`,
    ROP_ALERTS: 'rop_alerts',
    EOQ: 'eoq',
    FORECAST: 'forecast'
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

function invalidateCache(key) {
    cache.delete(key);
}

async function fetchWithTimeout(resource, options = {}, timeout = 8000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(resource, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        if (error.name === 'AbortError') throw new Error('Request timeout');
        throw error;
    }
}

async function handleResponse(response) {
    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
    }
    return response.json();
}

const api = {
    async request(endpoint, options = {}) {
        const url = `${API_BASE_URL}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            ...options.headers
        };
        try {
            const response = await fetchWithTimeout(url, { ...options, headers });
            return await handleResponse(response);
        } catch (error) {
            console.error('API request failed:', error);
            if (window.toast) {
                let msg = error.message || 'Network error';
                if (msg.includes('timeout')) msg = 'Request timed out. Please check your connection.';
                toast.error(msg);
            }
            throw error;
        }
    },

    getProducts(cacheTTL = 10000) {
        return getCached(CACHE_KEYS.PRODUCTS, () => this.request('/products'), cacheTTL);
    },
    addProduct(product) {
        invalidateCache(CACHE_KEYS.PRODUCTS);
        return this.request('/products', { method: 'POST', body: JSON.stringify(product) });
    },
    updateProduct(id, product) {
        invalidateCache(CACHE_KEYS.PRODUCTS);
        return this.request(`/products/${id}`, { method: 'PUT', body: JSON.stringify(product) });
    },
    deleteProduct(id) {
        invalidateCache(CACHE_KEYS.PRODUCTS);
        return this.request(`/products/${id}`, { method: 'DELETE' });
    },

    getInventory(cacheTTL = 10000) {
        return getCached(CACHE_KEYS.INVENTORY, () => this.request('/inventory'), cacheTTL);
    },
    updateStock(productId, stock) {
        invalidateCache(CACHE_KEYS.INVENTORY);
        return this.request('/inventory/update', { method: 'PUT', body: JSON.stringify({ product_id: productId, stock }) });
    },

    recordSale(sale) {
        invalidateCache(CACHE_KEYS.INVENTORY);
        invalidateCache(CACHE_KEYS.PRODUCTS);
        return this.request('/sales', { method: 'POST', body: JSON.stringify(sale) });
    },
    getRecentSales(days = 30) {
        return getCached(CACHE_KEYS.SALES(days), () => this.request(`/sales/recent?days=${days}`), 5000);
    },

    getROPAlerts() {
        return getCached(CACHE_KEYS.ROP_ALERTS, () => this.request('/optimize/rop'), 5000);
    },
    getEOQ() {
        return getCached(CACHE_KEYS.EOQ, () => this.request('/optimize/eoq'), 10000);
    },
    getForecast() {
        return getCached(CACHE_KEYS.FORECAST, () => this.request('/optimize/forecast'), 30000);
    }
};
