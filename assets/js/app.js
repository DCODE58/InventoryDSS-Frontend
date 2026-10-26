/* app.js — navigation, drawer, theme and application lifecycle */
const PAGE_TITLES = {
    dashboard: 'Dashboard',
    products:  'Products',
    inventory: 'Inventory',
    sales:     'Sales',
    analytics: 'Analytics',
};
const REFRESH_INTERVAL_MS = 15000;

let currentPage = null;
const loadedPages = {};
let refreshTimer = null;

// ── Page loading ─────────────────────────────────────────────────────────────
const PAGE_LOADERS = {
    dashboard: (silent) => typeof loadDashboard === 'function' && loadDashboard(silent),
    products:  (silent) => typeof loadProducts  === 'function' && loadProducts(silent),
    inventory: (silent) => typeof loadInventory === 'function' && loadInventory(silent),
    sales:     (silent) => typeof loadSalesPage === 'function' && loadSalesPage(silent),
    analytics: (silent) => typeof loadAnalytics === 'function' && loadAnalytics(silent),
};

function pageFromHash() {
    const id = location.hash.replace(/^#/, '');
    return PAGE_TITLES[id] ? id : 'dashboard';
}

function showPage(pageId, { moveFocus = true } = {}) {
    if (!PAGE_TITLES[pageId] || currentPage === pageId) return;
    currentPage = pageId;

    document.querySelectorAll('.page').forEach((p) => p.classList.toggle('hidden', p.id !== pageId));
    document.querySelectorAll('.sidebar-nav a').forEach((a) => {
        if (a.dataset.page === pageId) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
    });
    document.getElementById('topbarTitle').textContent = PAGE_TITLES[pageId];
    document.title = `${PAGE_TITLES[pageId]} | IO-DSS`;
    setDrawerOpen(false, { restoreFocus: false });
    window.scrollTo(0, 0);
    if (moveFocus) document.querySelector(`#${pageId} h1`)?.focus({ preventScroll: true });

    // First visit loads with skeletons; later visits refresh in place without blanking content.
    const silent = !!loadedPages[pageId];
    loadedPages[pageId] = true;
    PAGE_LOADERS[pageId](silent);
}

// ── Drawer (tablet / mobile) ─────────────────────────────────────────────────
const drawerQuery = window.matchMedia('(max-width: 1024px)');

function setDrawerOpen(open, { restoreFocus = true } = {}) {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const toggle = document.getElementById('menuToggle');
    const main = document.getElementById('mainCol');
    if (!sidebar) return;
    const wasOpen = sidebar.classList.contains('open');
    open = open && drawerQuery.matches;

    sidebar.classList.toggle('open', open);
    overlay.classList.toggle('active', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
    // While the drawer is open, the rest of the page is inert (no tabbing behind the overlay).
    main.inert = open;

    if (open) {
        (sidebar.querySelector('[aria-current="page"]') || sidebar.querySelector('a'))?.focus();
    } else if (wasOpen && restoreFocus) {
        toggle.focus();
    }
}

// ── Theme ────────────────────────────────────────────────────────────────────
function applyTheme(theme) {
    theme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('io-dss-theme', theme); } catch (_) {}

    const btn = document.getElementById('themeToggle');
    if (btn) {
        const next = theme === 'dark' ? 'light' : 'dark';
        btn.innerHTML = `<i class="fas ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}" aria-hidden="true"></i>`;
        btn.setAttribute('aria-label', `Switch to ${next} theme`);
        btn.title = `Switch to ${next} theme`;
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0B1120' : '#F2F5F9');
    // Charts read their colours from CSS variables, so they redraw on this event.
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
}

// ── Auto-refresh (dashboard only; sequential, never overlapping) ─────────────
function scheduleRefresh() {
    clearTimeout(refreshTimer);
    if (document.hidden) return;
    refreshTimer = setTimeout(async () => {
        try {
            if (currentPage === 'dashboard' && !document.hidden) await loadDashboard(true);
        } finally {
            scheduleRefresh();
        }
    }, REFRESH_INTERVAL_MS);
}
document.addEventListener('visibilitychange', () => {
    if (document.hidden) { clearTimeout(refreshTimer); return; }
    if (currentPage === 'dashboard') loadDashboard(true);   // catch up after being hidden
    scheduleRefresh();
});

// ── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    let saved = 'dark';
    try { saved = localStorage.getItem('io-dss-theme') || 'dark'; } catch (_) {}
    applyTheme(saved);

    document.getElementById('themeToggle').addEventListener('click', () => {
        applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });

    // Navigation: links change the hash; the hash is the single source of truth.
    window.addEventListener('hashchange', () => showPage(pageFromHash()));
    document.querySelectorAll('.sidebar-nav a').forEach((a) =>
        a.addEventListener('click', () => setDrawerOpen(false, { restoreFocus: false })));   // also covers re-selecting the current page
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-nav]');
        if (!btn) return;
        const page = btn.dataset.nav;
        if (location.hash === `#${page}`) showPage(page); else location.hash = page;
    });

    // Drawer controls
    document.getElementById('menuToggle').addEventListener('click', () => setDrawerOpen(true));
    document.getElementById('drawerClose').addEventListener('click', () => setDrawerOpen(false));
    document.getElementById('sidebarOverlay').addEventListener('click', () => setDrawerOpen(false));
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.getElementById('sidebar').classList.contains('open')) {
            e.preventDefault();
            setDrawerOpen(false);
        }
    });
    drawerQuery.addEventListener('change', (e) => { if (!e.matches) setDrawerOpen(false, { restoreFocus: false }); });

    showPage(pageFromHash(), { moveFocus: false });
    scheduleRefresh();
});
