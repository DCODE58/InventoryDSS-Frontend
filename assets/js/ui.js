/* ui.js — shared UI behaviour: states, busy buttons, form errors, modals,
   confirm dialog, chart theming/summaries and consistent error reporting. */
(function () {
    const $ = (id) => document.getElementById(id);
    const ui = { $ };

    /* ── Skeletons & state panels ──────────────────────────────────────── */
    ui.skeleton = (n = 3) =>
        '<div role="status"><span class="sr-only">Loading…</span>' +
        Array.from({ length: n }, () => '<div class="skeleton" aria-hidden="true"></div>').join('') + '</div>';

    /**
     * Fill `container` with an empty / error / warning panel.
     * opts: { kind, icon, title, text, actionLabel, onAction, compact }
     */
    ui.renderState = (container, opts) => {
        if (!container) return;
        const { kind = 'empty', title = '', text = '', actionLabel, onAction, compact = true } = opts;
        const icon = opts.icon || { empty: 'fa-inbox', error: 'fa-triangle-exclamation', warning: 'fa-circle-info' }[kind] || 'fa-inbox';
        container.innerHTML =
            `<div class="state state-${kind}${compact ? ' compact' : ''}"${kind === 'error' ? ' role="alert"' : ''}>` +
            `<span class="state-icon" aria-hidden="true"><i class="fas ${icon}"></i></span>` +
            `<p class="state-title">${escapeHtml(title)}</p>` +
            (text ? `<p class="state-text">${escapeHtml(text)}</p>` : '') +
            (actionLabel ? `<button type="button" class="btn btn-secondary btn-sm state-action">${escapeHtml(actionLabel)}</button>` : '') +
            '</div>';
        if (actionLabel && onAction) container.querySelector('.state-action').addEventListener('click', onAction);
    };

    /** Same, but as a single full-width table row. */
    ui.tableState = (tbody, cols, opts) => {
        if (!tbody) return;
        tbody.innerHTML = `<tr><td colspan="${cols}" class="cell-state"></td></tr>`;
        ui.renderState(tbody.querySelector('td'), { compact: false, ...opts });
    };
    ui.tableSkeleton = (tbody, cols, rows = 4) => {
        if (!tbody) return;
        tbody.innerHTML = `<tr><td colspan="${cols}" class="cell-state" style="padding:16px">${ui.skeleton(rows)}</td></tr>`;
    };

    /* ── KPI values ────────────────────────────────────────────────────── */
    ui.setKpi = (id, value, fallback) => {
        const el = $(id);
        if (!el) return;
        el.classList.remove('is-unavailable', 'is-loading');
        el.removeAttribute('title');
        if (value === null || value === undefined) {
            el.textContent = fallback || 'Unavailable';
            el.classList.add('is-unavailable');
            if (!fallback) el.title = 'This metric could not be loaded';
        } else {
            el.textContent = value;
        }
    };
    ui.setKpiLoading = (id) => {
        const el = $(id);
        if (!el) return;
        el.classList.remove('is-unavailable');
        el.classList.add('is-loading');
        el.textContent = '';
    };

    /* ── Busy buttons ──────────────────────────────────────────────────── */
    ui.setBusy = (btn, busy, busyLabel) => {
        if (!btn) return;
        if (busy) {
            if (btn.dataset.idleHtml === undefined) btn.dataset.idleHtml = btn.innerHTML;
            btn.disabled = true;
            btn.setAttribute('aria-busy', 'true');
            btn.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>${escapeHtml(busyLabel || 'Working…')}</span>`;
        } else {
            if (btn.dataset.idleHtml !== undefined) { btn.innerHTML = btn.dataset.idleHtml; delete btn.dataset.idleHtml; }
            btn.disabled = false;
            btn.removeAttribute('aria-busy');
        }
    };

    /* ── Inline form validation ────────────────────────────────────────── */
    ui.fieldError = (inputId, message) => {
        const input = $(inputId);
        const err = $(`${inputId}-error`);
        if (input) { if (message) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); }
        if (err) { err.textContent = message || ''; err.classList.toggle('hidden', !message); }
    };
    ui.clearFieldErrors = (form) => {
        form.querySelectorAll('[aria-invalid]').forEach((i) => i.removeAttribute('aria-invalid'));
        form.querySelectorAll('.field-error').forEach((e) => { e.textContent = ''; e.classList.add('hidden'); });
    };
    ui.formAlert = (id, message) => {
        const box = $(id);
        if (!box) return;
        box.classList.toggle('hidden', !message);
        const span = box.querySelector('span');
        if (span) span.textContent = message || '';
    };

    /* ── Modals ────────────────────────────────────────────────────────── */
    const stack = [];
    const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    const focusables = (root) => [...root.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);

    function syncInert() {
        const app = $('app');
        if (app) app.inert = stack.length > 0;
        stack.forEach((m, i) => { m.el.inert = i !== stack.length - 1; });
        document.body.classList.toggle('modal-open', stack.length > 0);
    }

    ui.openModal = (id, { opener, focus } = {}) => {
        const el = $(id);
        if (!el || stack.some((m) => m.el === el)) return;
        stack.push({ el, opener: opener || document.activeElement });
        el.classList.remove('hidden');
        syncInert();
        const target = (typeof focus === 'string' ? $(focus) : focus) || focusables(el.querySelector('.modal-panel'))[0];
        if (target) target.focus();
    };

    ui.isModalBusy = (el) => el.dataset.busy === '1';
    ui.setModalBusy = (id, busy) => { const el = $(id); if (el) el.dataset.busy = busy ? '1' : '0'; };

    ui.closeModal = (id, { force = false } = {}) => {
        const el = $(id);
        const idx = stack.findIndex((m) => m.el === el);
        if (idx === -1) return false;
        if (!force && ui.isModalBusy(el)) return false;
        const [{ opener }] = stack.splice(idx, 1);
        el.classList.add('hidden');
        el.dataset.busy = '0';
        syncInert();
        if (typeof el._onClose === 'function') { const cb = el._onClose; el._onClose = null; cb(); }
        // Return focus to whatever opened the dialog; fall back to the page heading if it was re-rendered away.
        const back = opener && opener.isConnected && opener.offsetParent !== null ? opener : document.querySelector('.page:not(.hidden) h1');
        if (back) back.focus();
        return true;
    };

    ui.isModalOpen = (id) => stack.some((m) => m.el === $(id));

    document.addEventListener('keydown', (e) => {
        if (!stack.length) return;
        const top = stack[stack.length - 1].el;
        if (e.key === 'Escape') {
            e.preventDefault();
            ui.closeModal(top.id);
        } else if (e.key === 'Tab') {
            const items = focusables(top.querySelector('.modal-panel'));
            if (!items.length) return;
            const first = items[0], last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            else if (!top.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
        }
    });
    document.addEventListener('click', (e) => {
        const closeBtn = e.target.closest('.close-modal');
        if (closeBtn) { const m = closeBtn.closest('.modal'); if (m) ui.closeModal(m.id); return; }
        if (e.target.classList && e.target.classList.contains('modal') && e.target.dataset.backdropClose === 'true') ui.closeModal(e.target.id);
    });

    /** Promise-based confirmation dialog. Resolves true only on explicit confirm. */
    ui.confirm = ({ title, message, confirmLabel = 'Delete', tone = 'danger', opener }) =>
        new Promise((resolve) => {
            const modal = $('confirm-modal');
            const ok = $('confirm-ok'), cancel = $('confirm-cancel');
            $('confirm-title').textContent = title;
            $('confirm-message').textContent = message;
            ok.textContent = confirmLabel;
            ok.className = `btn ${tone === 'danger' ? 'btn-danger-solid' : 'btn-primary'}`;
            let settled = false;
            const done = (value) => {
                if (settled) return;
                settled = true;
                ok.onclick = cancel.onclick = null;
                ui.closeModal('confirm-modal', { force: true });
                resolve(value);
            };
            ok.onclick = () => done(true);
            cancel.onclick = () => done(false);
            modal._onClose = () => done(false);
            ui.openModal('confirm-modal', { opener, focus: cancel });
        });

    /* ── Error reporting (one toast per failed request) ───────────────── */
    ui.errorDetail = (err) => {
        if (!err) return '';
        if (err.code === 'timeout') return 'the request timed out';
        if (err.code === 'network') return 'the server could not be reached';
        return err.message || '';
    };
    ui.reportError = (err, fallback = 'Something went wrong') => {
        if (err && err.reported) return;
        if (err) err.reported = true;
        const detail = ui.errorDetail(err);
        let msg = detail ? `${fallback}: ${detail}` : fallback;
        if (err && err.ambiguous) msg += '. It may still have been processed — refresh to check before retrying.';
        toast.error(msg);
    };

    /* ── Charts ────────────────────────────────────────────────────────── */
    const charts = {};
    ui.alpha = (hex, a) => {
        const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
        if (!m) return hex;
        const n = parseInt(m[1], 16);
        return `rgba(${n >> 16 & 255}, ${n >> 8 & 255}, ${n & 255}, ${a})`;
    };
    ui.chartTheme = () => {
        const cs = getComputedStyle(document.documentElement);
        const v = (n) => cs.getPropertyValue(n).trim();
        return {
            text: v('--text-2'), muted: v('--text-muted'), strong: v('--text'),
            grid: v('--chart-grid'), accent: v('--accent'), accentHover: v('--accent-hover'),
            tooltipBg: v('--raised'), border: v('--border-strong'), font: v('--font-body'),
        };
    };
    ui.reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    ui.hasChartLib = () => typeof Chart !== 'undefined';

    ui.mountChart = (key, canvas, config) => {
        if (charts[key]) { charts[key].destroy(); delete charts[key]; }
        if (!ui.hasChartLib() || !canvas) return null;
        charts[key] = new Chart(canvas.getContext('2d'), config);
        return charts[key];
    };
    ui.destroyChart = (key) => { if (charts[key]) { charts[key].destroy(); delete charts[key]; } };
    ui.hasChart = (key) => !!charts[key];

    /** state: 'ready' shows the canvas; anything else shows a panel in .chart-state. */
    ui.chartState = (containerId, state, opts = {}) => {
        const box = $(containerId);
        if (!box) return;
        const wrapper = box.querySelector('.chart-wrapper');
        const slot = box.querySelector('.chart-state');
        const ready = state === 'ready';
        wrapper.classList.toggle('hidden', !ready);
        slot.classList.toggle('hidden', ready);
        if (ready) { slot.innerHTML = ''; return; }
        if (state === 'loading') slot.innerHTML = ui.skeleton(5);
        else ui.renderState(slot, { kind: state === 'error' ? 'error' : 'empty', compact: false, ...opts });
    };

    /** Text equivalent: one-sentence summary + collapsible data table. */
    ui.setChartText = ({ summaryId, summaryText, canvasId, dataId, headers = [], rows = [] }) => {
        if (summaryId && $(summaryId)) $(summaryId).textContent = summaryText || '';
        if (canvasId && $(canvasId)) $(canvasId).setAttribute('aria-label', summaryText || '');
        const det = dataId && $(dataId);
        if (!det) return;
        if (!rows.length) { det.hidden = true; det.innerHTML = ''; return; }
        const open = det.open;
        det.hidden = false;
        det.innerHTML =
            '<summary>View chart data as a table</summary><div class="table-wrapper" tabindex="0" role="region" aria-label="Chart data"><table class="data-table"><thead><tr>' +
            headers.map((h, i) => `<th scope="col"${i ? ' class="num"' : ''}>${escapeHtml(h)}</th>`).join('') +
            '</tr></thead><tbody>' +
            rows.map((r) => '<tr>' + r.map((c, i) => `<td${i ? ' class="num"' : ''}>${escapeHtml(c)}</td>`).join('') + '</tr>').join('') +
            '</tbody></table></div>';
        det.open = open;
    };

    window.ui = ui;
})();
