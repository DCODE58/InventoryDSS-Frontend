window.escapeHtml = function(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
};

const helpers = {
    formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString();
    },
    /** Date + time, down to the second — e.g. "21 Oct 2026, 14:32:07". */
    formatDateTime(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '';
        const datePart = date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
        const timePart = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        return `${datePart}, ${timePart}`;
    },
    formatCurrency(amount) {
        return `Ksh ${parseFloat(amount).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    },
    getStockStatus(stock, reorderPoint) {
        if (stock <= 0) return { text: 'Out of Stock', class: 'badge-danger' };
        if (stock <= reorderPoint) return { text: 'Low Stock', class: 'badge-warning' };
        return { text: 'In Stock', class: 'badge-success' };
    },

    /** Profit margin from cost and price. Returns null if cost/price aren't valid numbers. */
    calculateMargin(cost, price) {
        cost = parseFloat(cost);
        price = parseFloat(price);
        if (isNaN(cost) || isNaN(price) || cost < 0 || price < 0) return null;
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

    /** Days of stock remaining given a forecasted daily demand. null if demand is 0/unknown. */
    getDaysOfStock(stock, dailyDemand) {
        if (!dailyDemand || dailyDemand <= 0) return null;
        return Math.floor(stock / dailyDemand);
    },
};
