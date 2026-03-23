class ToastManager {
    constructor() {
        this.container = null;
        this.init();
    }

    init() {
        if (!document.querySelector('.toast-container')) {
            const container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
            this.container = container;
        } else {
            this.container = document.querySelector('.toast-container');
        }
    }

    show(message, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        let icon = '';
        switch (type) {
            case 'success':
                icon = 'fa-check-circle';
                break;
            case 'error':
                icon = 'fa-exclamation-circle';
                break;
            case 'warning':
                icon = 'fa-exclamation-triangle';
                break;
            default:
                icon = 'fa-info-circle';
        }

        toast.innerHTML = `
            <i class="fas ${icon}"></i>
            <span class="toast-message">${escapeHtml(message)}</span>
            <i class="fas fa-times toast-close"></i>
        `;

        this.container.appendChild(toast);

        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => this.dismiss(toast));

        setTimeout(() => this.dismiss(toast), duration);
    }

    dismiss(toast) {
        toast.style.animation = 'fadeOut 0.3s forwards';
        setTimeout(() => toast.remove(), 300);
    }

    success(msg) {
        this.show(msg, 'success');
    }

    error(msg) {
        this.show(msg, 'error');
    }

    info(msg) {
        this.show(msg, 'info');
    }

    warning(msg) {
        this.show(msg, 'warning');
    }
}

// Make toast globally available
window.toast = new ToastManager();
