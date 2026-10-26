class ToastManager {
    constructor() {
        this.container = null;
        this.active = new Map();   // type::message → { el, reset } (dedup)
        this.MAX_STACK = 4;
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

    _duration(type) { return { success: 3500, error: 7000, warning: 6000, info: 4000 }[type] ?? 4000; }
    _icon(type) {
        return { success: 'fa-circle-check', error: 'fa-circle-exclamation', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' }[type] ?? 'fa-circle-info';
    }
    _reducedMotion() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

    show(message, type = 'info', duration) {
        const ms = duration ?? this._duration(type);
        const key = `${type}::${message}`;

        // Same message already on screen → extend it instead of stacking a duplicate.
        const existing = this.active.get(key);
        if (existing) {
            existing.reset(ms);
            existing.el.classList.add('toast-bump');
            setTimeout(() => existing.el.classList.remove('toast-bump'), 300);
            return;
        }
        if (this.active.size >= this.MAX_STACK) {
            const [oldKey, oldEntry] = this.active.entries().next().value;
            this._dismiss(oldEntry.el, oldKey);
        }

        const el = document.createElement('div');
        el.className = `toast toast-${type}`;
        // Errors interrupt; everything else is announced politely.
        el.setAttribute('role', type === 'error' ? 'alert' : 'status');

        const icon = document.createElement('i');
        icon.className = `fas ${this._icon(type)} toast-type-icon`;
        icon.setAttribute('aria-hidden', 'true');

        const text = document.createElement('span');
        text.className = 'toast-message';
        text.textContent = message;

        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'toast-close';
        close.setAttribute('aria-label', 'Dismiss notification');
        close.innerHTML = '<i class="fas fa-xmark" aria-hidden="true"></i>';

        const progress = document.createElement('div');
        progress.className = 'toast-progress';
        const bar = document.createElement('div');
        bar.className = 'toast-progress-bar';
        progress.appendChild(bar);

        el.append(icon, text, close, progress);
        this.container.appendChild(el);

        // Timer with pause on hover/focus.
        let timer = null, remaining = ms, startedAt = Date.now();
        const animateBar = (dur) => {
            if (this._reducedMotion()) { bar.style.display = 'none'; return; }
            bar.style.transition = 'none';
            bar.style.transform = `scaleX(${Math.max(0, dur / ms)})`;
            void bar.offsetWidth;
            bar.style.transition = `transform ${dur}ms linear`;
            bar.style.transform = 'scaleX(0)';
        };
        const start = (dur) => {
            clearTimeout(timer);
            remaining = dur; startedAt = Date.now();
            animateBar(dur);
            timer = setTimeout(() => this._dismiss(el, key), dur);
        };
        const pause = () => {
            clearTimeout(timer);
            remaining -= Date.now() - startedAt;
            const current = getComputedStyle(bar).transform;
            bar.style.transition = 'none';
            bar.style.transform = current === 'none' ? 'scaleX(1)' : current;
        };
        const resume = () => start(Math.max(1000, remaining));

        el.addEventListener('mouseenter', pause);
        el.addEventListener('mouseleave', resume);
        el.addEventListener('focusin', pause);
        el.addEventListener('focusout', resume);
        close.addEventListener('click', () => this._dismiss(el, key));

        start(ms);
        this.active.set(key, { el, reset: (d) => start(d) });
    }

    _dismiss(el, key) {
        if (!el.isConnected) return;
        this.active.delete(key);
        if (this._reducedMotion()) { el.remove(); return; }
        el.classList.add('toast-leaving');
        setTimeout(() => el.remove(), 220);
    }

    success(msg, duration) { this.show(msg, 'success', duration); }
    error(msg, duration)   { this.show(msg, 'error', duration); }
    info(msg, duration)    { this.show(msg, 'info', duration); }
    warning(msg, duration) { this.show(msg, 'warning', duration); }
}

window.toast = new ToastManager();
