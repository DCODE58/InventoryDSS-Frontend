window.escapeHtml = function (str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

const helpers = {
    /** Finite number or null (never NaN/Infinity). */
    toNumber(value) {
        if (value === null || value === undefined || value === '') return null;
        const n = typeof value === 'number' ? value : Number(value);
        return Number.isFinite(n) ? n : null;
    },

    /**
     * Parse a timestamp from the API. Timestamps with no timezone marker
     * (e.g. "2026-10-26T10:15:00" or "2026-10-26 10:15:00") are treated as UTC,
     * which is what servers using utcnow() send; the browser would otherwise
     * read them as local time and show them hours off.
     * If your backend stores local time instead, change ASSUME_UTC to false.
     */
    parseDate(value) {
        if (value instanceof Date) return value;
        if (value === null || value === undefined || value === '') return new Date(NaN);
        let str = String(value).trim();
        if (helpers.ASSUME_UTC && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(str)) {
            str = str.replace(' ', 'T') + 'Z';
        }
        return new Date(str);
    },
    ASSUME_UTC: true,

    /** Escape text and wrap case-insensitive matches of `term` in <mark>. */
    highlight(text, term) {
        const str = text === null || text === undefined ? '' : String(text);
        term = (term || '').trim();
        if (!term) return escapeHtml(str);
        const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        let out = '', last = 0, m;
        while ((m = re.exec(str)) !== null) {
            if (m[0] === '') { re.lastIndex++; continue; }
            out += escapeHtml(str.slice(last, m.index)) + '<mark>' + escapeHtml(m[0]) + '</mark>';
            last = m.index + m[0].length;
        }
        return out + escapeHtml(str.slice(last));
    },

    formatDate(dateString) {
        if (!dateString) return '';
        const date = helpers.parseDate(dateString);
        return isNaN(date.getTime()) ? '' : date.toLocaleDateString();
    },

    /** Date + time, down to the second — e.g. "21 Oct 2026, 14:32:07". */
    formatDateTime(dateString) {
        if (!dateString) return '';
        const date = helpers.parseDate(dateString);
        if (isNaN(date.getTime())) return '';
        const datePart = date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
        const timePart = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        return `${datePart}, ${timePart}`;
    },

    formatTime(date) {
        return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    },

    /** "Ksh 1,234.00", or "—" when the amount isn't a finite number. */
    formatCurrency(amount) {
        const n = helpers.toNumber(amount);
        if (n === null) return '—';
        return `Ksh ${n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    },

    formatNumber(value) {
        const n = helpers.toNumber(value);
        return n === null ? '—' : n.toLocaleString('en-KE', { maximumFractionDigits: 0 });
    },

    /** Existing business rule: out of stock ≤ 0, low when at/below reorder point. */
    getStockStatus(stock, reorderPoint) {
        if (stock <= 0) return { text: 'Out of stock', class: 'badge-danger', icon: 'fa-circle-xmark' };
        if (stock <= reorderPoint) return { text: 'Low stock', class: 'badge-warning', icon: 'fa-triangle-exclamation' };
        return { text: 'In stock', class: 'badge-success', icon: 'fa-circle-check' };
    },

    /**
     * Profit margin from cost and price. `percent` is relative to COST (markup),
     * as the app has always calculated it. Returns null if either value is
     * missing/invalid/negative; never returns NaN or Infinity.
     */
    calculateMargin(cost, price) {
        cost = helpers.toNumber(cost);
        price = helpers.toNumber(price);
        if (cost === null || price === null || cost < 0 || price < 0) return null;
        const amount = price - cost;
        const percent = cost > 0 ? (amount / cost) * 100 : (price > 0 ? 100 : 0);
        return { amount, percent };
    },

    /** Badge class for a margin percentage — thin/negative margins read as a warning. */
    getMarginBadgeClass(percent) {
        if (percent <= 0) return 'badge-danger';
        if (percent < 15) return 'badge-warning';
        return 'badge-success';
    },

    /** Days of stock remaining given forecast daily demand. null if demand is missing/0/invalid. */
    getDaysOfStock(stock, dailyDemand) {
        const s = helpers.toNumber(stock);
        const d = helpers.toNumber(dailyDemand);
        if (s === null || d === null || d <= 0) return null;
        return Math.floor(s / d);
    },

    /** Safe CSV cell: quotes, escapes quotes, and defuses spreadsheet formula injection. */
    csvCell(value) {
        let s = value === null || value === undefined ? '' : String(value);
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
        return `"${s.replace(/"/g, '""')}"`;
    },

    downloadCsv(filename, lines) {
        const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    debounce(fn, wait = 200) {
        let t;
        return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
    },

    /** Local YYYY-MM-DD (not UTC), so a sale at 01:00 local lands on its local day. */
    localDayKey(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    },
};
