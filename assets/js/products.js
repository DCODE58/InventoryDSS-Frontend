let currentPage = null;
let loadedPages  = {};
let refreshInterval = null;

// ── Skeleton placeholders ────────────────────────────────────────────────────
function showSkeleton(pageId) {
    const skeletons = {
        dashboard: ['rop-alerts-list','eoq-list'],
        products:  ['products-list'],
        inventory: ['inventory-list'],
        sales:     ['product-id','recent-sales-list'],
    };
    (skeletons[pageId] || []).forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = id === 'product-id'
            ? '<option>Loading products…</option>'
            : '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
    });
}
window.showSkeleton = showSkeleton;

function loadPageData(pageId) {
    showSkeleton(pageId);
    switch (pageId) {
        case 'dashboard': if (typeof loadDashboard === 'function') loadDashboard();    break;
        case 'products':  if (typeof loadProducts  === 'function') loadProducts();     break;
        case 'inventory': if (typeof loadInventory === 'function') loadInventory();    break;
        case 'sales':     if (typeof loadSalesPage === 'function') loadSalesPage();    break;
    }
}
function refreshPageData(pageId) {
    switch (pageId) {
        case 'dashboard': if (typeof loadDashboard === 'function') loadDashboard(true);  break;
        case 'products':  if (typeof loadProducts  === 'function') loadProducts(true);   break;
        case 'inventory': if (typeof loadInventory === 'function') loadInventory(true);  break;
        case 'sales':     if (typeof loadSalesPage === 'function') loadSalesPage(true);  break;
    }
}

function showPage(pageId) {
    if (currentPage === pageId) return;
    currentPage = pageId;
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    document.getElementById(pageId)?.classList.remove('hidden');
    document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active'));
    document.querySelector(`.sidebar a[data-page="${pageId}"]`)?.parentElement.classList.add('active');
    if (!loadedPages[pageId]) { loadPageData(pageId);    loadedPages[pageId] = true; }
    else                      { refreshPageData(pageId); }
}

// ── Auto-refresh dashboard ───────────────────────────────────────────────────
function startAutoRefresh() {
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(() => {
        const dash = document.getElementById('dashboard');
        if (dash && !dash.classList.contains('hidden') && !document.hidden)
            if (typeof loadDashboard === 'function') loadDashboard(true);
    }, 10000);
}
function stopAutoRefresh() { clearInterval(refreshInterval); refreshInterval = null; }
document.addEventListener('visibilitychange', () =>
    document.hidden ? stopAutoRefresh() : startAutoRefresh()
);

// ── Sidebar open/close helper ────────────────────────────────────────────────
function setSidebarOpen(sidebar, menuToggle, overlay, open) {
    if (open) {
        sidebar.classList.add('open');
        overlay.classList.add('active');
        menuToggle.innerHTML = '<i class="fas fa-times"></i>';
    } else {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
        menuToggle.innerHTML = '<i class="fas fa-bars"></i>';
    }
}

// ── Theme toggle ─────────────────────────────────────────────────────────────
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('io-dss-theme', theme);
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    if (theme === 'light') {
        btn.innerHTML = '<i class="fas fa-moon"></i>';
        btn.title = 'Switch to dark mode';
    } else {
        btn.innerHTML = '<i class="fas fa-sun"></i>';
        btn.title = 'Switch to light mode';
    }
}

// ── DOMContentLoaded ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

    // Restore saved theme — default is now 'light'
    const savedTheme = localStorage.getItem('io-dss-theme') || 'light';
    applyTheme(savedTheme);

    // Theme toggle button
    document.getElementById('themeToggle')?.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        applyTheme(current === 'dark' ? 'light' : 'dark');
    });

    // Page nav links
    document.querySelectorAll('[data-page]').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            const page = link.getAttribute('data-page');
            if (page) {
                showPage(page);
                // Close sidebar on mobile after navigation
                const sidebar    = document.querySelector('.sidebar');
                const menuToggle = document.getElementById('menuToggle');
                const overlay    = document.getElementById('sidebarOverlay');
                if (sidebar?.classList.contains('open'))
                    setSidebarOpen(sidebar, menuToggle, overlay, false);
            }
        });
    });

    // Hamburger / X toggle
    const menuToggle = document.getElementById('menuToggle');
    const sidebar    = document.querySelector('.sidebar');
    const overlay    = document.getElementById('sidebarOverlay');

    if (menuToggle && sidebar && overlay) {
        menuToggle.addEventListener('click', e => {
            e.stopPropagation();
            setSidebarOpen(sidebar, menuToggle, overlay, !sidebar.classList.contains('open'));
        });
        overlay.addEventListener('click', () => setSidebarOpen(sidebar, menuToggle, overlay, false));
    }

    showPage('dashboard');
    startAutoRefresh();
});
