// ─── Cache ───────────────────────────────────────────────────────────────────
const CACHE_KEYS = {
    PRODUCTS:    'products',
    INVENTORY:   'inventory',
    SALES:       (days) => `sales_${days}`,
    SALES_PREFIX: 'sales_',
    ROP_ALERTS:  'rop_alerts',
    EOQ_SUMMARY: 'eoq_summary',
    FORECAST:    'forecast_all',
};

const cache = new Map();     // key → { data, time }
const inflight = new Map();  // key → Promise (de-dupes concurrent identical GETs)
const epochs = new Map();    // key → number; bumped on invalidation so stale responses never repopulate the cache

function getCached(key, fn, ttl = 10000) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.time < ttl) return Promise.resolve(hit.data);
    if (inflight.has(key)) return inflight.get(key);

    const epoch = epochs.get(key) || 0;
    const p = fn()
        .then((data) => {
            if ((epochs.get(key) || 0) === epoch) cache.set(key, { data, time: Date.now() });
            return data;
        })
        .finally(() => { if (inflight.get(key) === p) inflight.delete(key); });
    inflight.set(key, p);
    return p;
}

/** Invalidate exact keys, or every key starting with a prefix ending in "_". */
function invalidateCache(...keys) {
    keys.forEach((k) => {
        const matches = k.endsWith('_')
            ? [...new Set([...cache.keys(), ...inflight.keys(), ...epochs.keys()])].filter((x) => x.startsWith(k))
            : [k];
        matches.forEach((m) => {
            cache.delete(m);
            inflight.delete(m);
            epochs.set(m, (epochs.get(m) || 0) + 1);
        });
    });
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
class ApiError extends Error {
    constructor(message, { status = null, code = null, ambiguous = false } = {}) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;           // 'timeout' | 'network' | 'http' | 'parse' | 'shape'
        this.ambiguous = ambiguous; // a write may or may not have reached the server
        this.reported = false;      // set once the user has been told (avoids duplicate toasts)
    }
}

async function fetchWithTimeout(resource, options = {}, timeout) {
    const ms = timeout ?? (typeof API_TIMEOUT_MS !== 'undefined' ? API_TIMEOUT_MS : 8000);
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), ms);
    try {
        return await fetch(resource, { ...options, signal: controller.signal });
    } catch (error) {
        if (error.name === 'AbortError') throw new ApiError('Request timed out', { code: 'timeout' });
        throw new ApiError(error.message || 'Network error', { code: 'network' });
    } finally {
        clearTimeout(id);
    }
}

async function handleResponse(response) {
    const text = await response.text();
    let body = null;
    if (text) { try { body = JSON.parse(text); } catch (_) { body = null; } }
    if (!response.ok) {
        const detail = body && (body.error || body.message);
        throw new ApiError(detail || `HTTP ${response.status}`, { status: response.status, code: 'http' });
    }
    if (text && body === null) throw new ApiError('The server sent an unreadable response', { code: 'parse' });
    return body;
}

const expectArray = (name) => (data) => {
    if (!Array.isArray(data)) throw new ApiError(`Unexpected response from ${name}`, { code: 'shape' });
    return data;
};
const expectForecast = (data) => {
    if (!data || typeof data !== 'object' || !Array.isArray(data.labels) || !Array.isArray(data.values)) {
        throw new ApiError('Unexpected response from /sales/forecast/all', { code: 'shape' });
    }
    return data;
};

// Related caches to drop after each kind of change (run whether the call succeeded or not,
// because a timed-out write may still have been applied).
const AFTER_PRODUCT_CHANGE = [CACHE_KEYS.PRODUCTS, CACHE_KEYS.INVENTORY, CACHE_KEYS.ROP_ALERTS, CACHE_KEYS.EOQ_SUMMARY, CACHE_KEYS.FORECAST, CACHE_KEYS.SALES_PREFIX];
const AFTER_STOCK_CHANGE   = [CACHE_KEYS.PRODUCTS, CACHE_KEYS.INVENTORY, CACHE_KEYS.ROP_ALERTS, CACHE_KEYS.EOQ_SUMMARY];
const AFTER_SALE           = [CACHE_KEYS.PRODUCTS, CACHE_KEYS.INVENTORY, CACHE_KEYS.ROP_ALERTS, CACHE_KEYS.EOQ_SUMMARY, CACHE_KEYS.FORECAST, CACHE_KEYS.SALES_PREFIX];

// ─── API client ───────────────────────────────────────────────────────────────
const api = {
    /** Centralised request wrapper. Throws ApiError; never shows UI (callers use ui.reportError). */
    async request(endpoint, options = {}) {
        const url = `${API_BASE_URL}${endpoint}`;
        const method = (options.method || 'GET').toUpperCase();
        const headers = {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            ...options.headers,
        };
        try {
            const response = await fetchWithTimeout(url, { ...options, headers });
            return await handleResponse(response);
        } catch (error) {
            if (method !== 'GET' && (error.code === 'timeout' || error.code === 'network')) error.ambiguous = true;
            console.error(`API error [${method} ${endpoint}]:`, error.message);
            throw error;
        }
    },

    async mutate(endpoint, options, invalidate) {
        try { return await this.request(endpoint, options); }
        finally { invalidateCache(...invalidate); }
    },

    // ── Products ──────────────────────────────────────────────────────────────
    getProducts(ttl = 10000) {
        return getCached(CACHE_KEYS.PRODUCTS, () => this.request('/products/').then(expectArray('/products/')), ttl);
    },
    addProduct(product) {
        return this.mutate('/products/', { method: 'POST', body: JSON.stringify(product) }, AFTER_PRODUCT_CHANGE);
    },
    updateProduct(id, product) {
        return this.mutate(`/products/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(product) }, AFTER_PRODUCT_CHANGE);
    },
    deleteProduct(id) {
        return this.mutate(`/products/${encodeURIComponent(id)}`, { method: 'DELETE' }, AFTER_PRODUCT_CHANGE);
    },

    // ── Inventory ─────────────────────────────────────────────────────────────
    getInventory(ttl = 10000) {
        return getCached(CACHE_KEYS.INVENTORY, () => this.request('/inventory/').then(expectArray('/inventory/')), ttl);
    },
    updateStock(productId, stock) {
        return this.mutate('/inventory/update', {
            method: 'PUT',
            body: JSON.stringify({ product_id: productId, stock }),
        }, AFTER_STOCK_CHANGE);
    },

    // ── Sales ─────────────────────────────────────────────────────────────────
    recordSale(sale) {
        return this.mutate('/sales/', { method: 'POST', body: JSON.stringify(sale) }, AFTER_SALE);
    },
    getRecentSales(days = 30) {
        return getCached(
            CACHE_KEYS.SALES(days),
            () => this.request(`/sales/recent?days=${encodeURIComponent(days)}`).then(expectArray('/sales/recent')),
            5000,
        );
    },

    // ── Optimization / alerts ─────────────────────────────────────────────────
    // GET /inventory/alerts  → items where stock ≤ reorder_point
    getROPAlerts() {
        return getCached(CACHE_KEYS.ROP_ALERTS, () => this.request('/inventory/alerts').then(expectArray('/inventory/alerts')), 5000);
    },
    // GET /optimize/summary  → per-product EOQ summary
    getEOQ() {
        return getCached(CACHE_KEYS.EOQ_SUMMARY, () => this.request('/optimize/summary').then(expectArray('/optimize/summary')), 10000);
    },
    // GET /sales/forecast/all  → { labels: [product names], values: [forecast units], days_ahead? }
    getForecast() {
        return getCached(CACHE_KEYS.FORECAST, () => this.request('/sales/forecast/all').then(expectForecast), 30000);
    },
};
