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
    formatCurrency(amount) {
        return `Ksh ${parseFloat(amount).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    },
    getStockStatus(stock, reorderPoint) {
        if (stock <= 0) return { text: 'Out of Stock', class: 'badge-danger' };
        if (stock <= reorderPoint) return { text: 'Low Stock', class: 'badge-warning' };
        return { text: 'In Stock', class: 'badge-success' };
    }
};
