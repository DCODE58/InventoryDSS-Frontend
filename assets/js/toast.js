class ToastManager {
    constructor() {
        this.container = null;
        this.active    = new Map();   // message+type → toast el (dedup)
        this.MAX_STACK = 5;
        this.init();
    }

    init() {
        this.container = document.querySelector('.toast-container');
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.className = 'toast-container';
            this.container.setAttribute('role', 'region');
            this.container.setAttribute('aria-label', 'Notifications');
            document.body.appendChild(this.container);
        }
    }

    // Default durations per type (ms)
    _duration(type) {
        return { success: 3000, error: 5000, warning: 4000, info: 3000 }[type] ?? 3000;
    }

    _icon(type) {
        return {
            success: 'fa-check-circle',
            error:   'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info:    'fa-info-circle',
        }[type] ?? 'fa-info-circle';
    }

    show(message, type = 'info', duration) {
        const ms = duration ?? this._duration(type);

        // ── Dedup: bump existing toast instead of stacking a duplicate ────────
        const dedupKey = `${type}::${message}`;
        if (this.active.has(dedupKey)) {
            const existing = this.active.get(dedupKey);
            existing._resetTimer(ms);
            existing.el.classList.add('toast-bump');
            setTimeout(() => existing.el.classList.remove('toast-bump'), 300);
            return;
        }

        // ── Max-stack: dismiss oldest if over limit ────────────────────────────
        if (this.active.size >= this.MAX_STACK) {
            const [firstKey, firstEntry] = this.active.entries().next().value;
            this._dismiss(firstEntry.el, firstKey);
        }

        // ── Build element ──────────────────────────────────────────────────────
        const el = document.createElement('div');
        el.className = `toast toast-${type}`;
        el.setAttribute('role', type === 'error' ? 'alert' : 'status');
        el.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');

        el.innerHTML = `
            <i class="fas ${this._icon(type)} toast-type-icon"></i>
            <span class="toast-message">${escapeHtml(message)}</span>
            <i class="fas fa-times toast-close" role="button" aria-label="Dismiss notification" tabindex="0"></i>
            <div class="toast-progress"><div class="toast-progress-bar"></div></div>
        `;

        this.container.appendChild(el);

        // ── Progress bar + timer ───────────────────────────────────────────────
        const bar = el.querySelector('.toast-progress-bar');
        let startTime  = Date.now();
        let remaining  = ms;
        let rafId      = null;
        let paused     = false;

        const tick = () => {
            if (paused) return;
            const elapsed = Date.now() - startTime;
            const pct     = Math.max(0, 1 - elapsed / remaining);
            bar.style.transform = `scaleX(${pct})`;
            if (elapsed >= remaining) { this._dismiss(el, dedupKey); return; }
            rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);

        const resetTimer = (newMs) => {
            remaining  = newMs;
            startTime  = Date.now();
        };

        // ── Pause on hover ─────────────────────────────────────────────────────
        el.addEventListener('mouseenter', () => {
            paused    = true;
            remaining = remaining - (Date.now() - startTime);
            cancelAnimationFrame(rafId);
        });
        el.addEventListener('mouseleave', () => {
            paused    = false;
            startTime = Date.now();
            rafId     = requestAnimationFrame(tick);
        });

        // ── Close button (click + keyboard) ───────────────────────────────────
        const closeBtn = el.querySelector('.toast-close');
        const dismiss  = () => this._dismiss(el, dedupKey);
        closeBtn.addEventListener('click', dismiss);
        closeBtn.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dismiss(); }
        });

        // Store in active map
        this.active.set(dedupKey, { el, _resetTimer: resetTimer });
    }

    _dismiss(el, dedupKey) {
        if (!el.isConnected) return;
        this.active.delete(dedupKey);
        el.style.animation = 'toastOut 0.32s ease forwards';
        setTimeout(() => el.remove(), 320);
    }

    success(msg, duration) { this.show(msg, 'success', duration); }
    error  (msg, duration) { this.show(msg, 'error',   duration); }
    info   (msg, duration) { this.show(msg, 'info',    duration); }
    warning(msg, duration) { this.show(msg, 'warning', duration); }
}

window.toast = new ToastManager();
