let currentPage = null;
let loadedPages = {};
let refreshInterval = null;

function showSkeleton(pageId) {
    const skeletons = {
        dashboard: ['rop-alerts-list', 'eoq-list'],
        products:  ['products-list'],
        inventory: ['inventory-list'],
        sales:     ['product-id', 'recent-sales-list']
    };
    const targets = skeletons[pageId] || [];
    targets.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (id === 'product-id') {
                el.innerHTML = '<option>Loading products...</option>';
            } else {
                el.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
            }
        }
    });
}
window.showSkeleton = showSkeleton;

function loadPageData(pageId) {
    showSkeleton(pageId);
    switch (pageId) {
        case 'dashboard': if (typeof loadDashboard  === 'function') loadDashboard();     break;
        case 'products':  if (typeof loadProducts   === 'function') loadProducts();      break;
        case 'inventory': if (typeof loadInventory  === 'function') loadInventory();     break;
        case 'sales':     if (typeof loadSalesPage  === 'function') loadSalesPage();     break;
    }
}

function refreshPageData(pageId) {
    switch (pageId) {
        case 'dashboard': if (typeof loadDashboard  === 'function') loadDashboard(true);  break;
        case 'products':  if (typeof loadProducts   === 'function') loadProducts(true);   break;
        case 'inventory': if (typeof loadInventory  === 'function') loadInventory(true);  break;
        case 'sales':     if (typeof loadSalesPage  === 'function') loadSalesPage(true);  break;
    }
}

function showPage(pageId) {
    if (currentPage === pageId) return;
    currentPage = pageId;

    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    const targetPage = document.getElementById(pageId);
    if (targetPage) targetPage.classList.remove('hidden');

    document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active'));
    const activeLink = document.querySelector(`.sidebar a[data-page="${pageId}"]`);
    if (activeLink) activeLink.parentElement.classList.add('active');

    if (!loadedPages[pageId]) {
        loadPageData(pageId);
        loadedPages[pageId] = true;
    } else {
        refreshPageData(pageId);
    }
}

function startAutoRefresh() {
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(() => {
        const dashboardPage = document.getElementById('dashboard');
        if (dashboardPage && !dashboardPage.classList.contains('hidden') && !document.hidden) {
            if (typeof loadDashboard === 'function') loadDashboard(true);
        }
    }, 10000);
}
function stopAutoRefresh() {
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = null;
}
document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopAutoRefresh(); else startAutoRefresh();
});

// ── Toggle helper: swap bars ↔ times icon ────────────────────────────────────
function setSidebarOpen(sidebar, menuToggle, open) {
    if (open) {
        sidebar.classList.add('open');
        menuToggle.innerHTML = '<i class="fas fa-times"></i>';
    } else {
        sidebar.classList.remove('open');
        menuToggle.innerHTML = '<i class="fas fa-bars"></i>';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Page navigation
    document.querySelectorAll('[data-page]').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            const page = link.getAttribute('data-page');
            if (page) {
                showPage(page);
                // Close sidebar on mobile after nav
                const sidebar = document.querySelector('.sidebar');
                const menuToggle = document.getElementById('menuToggle');
                if (sidebar && sidebar.classList.contains('open')) {
                    setSidebarOpen(sidebar, menuToggle, false);
                }
            }
        });
    });

    // Hamburger / X toggle
    const menuToggle = document.getElementById('menuToggle');
    const sidebar    = document.querySelector('.sidebar');

    if (menuToggle && sidebar) {
        menuToggle.addEventListener('click', e => {
            e.stopPropagation();
            const isOpen = sidebar.classList.contains('open');
            setSidebarOpen(sidebar, menuToggle, !isOpen);
        });

        // Click outside sidebar → close
        document.body.addEventListener('click', e => {
            if (
                sidebar.classList.contains('open') &&
                !sidebar.contains(e.target) &&
                !menuToggle.contains(e.target)
            ) {
                setSidebarOpen(sidebar, menuToggle, false);
            }
        });
    }

    showPage('dashboard');
    startAutoRefresh();
});
