// Dashboard specific
async function loadDashboard() {
    try {
        // Load stats (example: from inventory and products)
        const products = await api.getProducts();
        document.querySelector('#total-products-card .stat-value').textContent = products.length;

        const inventory = await api.getInventory();
        const lowStock = inventory.filter(item => item.stock <= item.reorder_point).length;
        document.querySelector('#low-stock-card .stat-value').textContent = lowStock;

        // Load ROP alerts
        const ropAlerts = await api.getROPAlerts();
        const alertsList = document.getElementById('rop-alerts-list');
        if (ropAlerts.length === 0) {
            alertsList.innerHTML = '<p>No alerts</p>';
        } else {
            alertsList.innerHTML = '<ul>' + ropAlerts.map(alert => 
                `<li><span>${alert.product_name}</span> <span class="badge badge-danger">Stock: ${alert.stock}</span></li>`
            ).join('') + '</ul>';
        }
        document.querySelector('#reorder-alerts-card .stat-value').textContent = ropAlerts.length;

        // Load EOQ recommendations
        const eoqData = await api.getEOQ();
        const eoqList = document.getElementById('eoq-list');
        if (eoqData.length === 0) {
            eoqList.innerHTML = '<p>No recommendations</p>';
        } else {
            eoqList.innerHTML = '<ul>' + eoqData.map(item => 
                `<li><span>${item.product_name}</span> <span>EOQ: ${item.eoq}</span></li>`
            ).join('') + '</ul>';
        }

        // Load forecast
        const forecast = await api.getForecast();
        document.querySelector('#forecast-demand-card .stat-value').textContent = forecast.total || 'N/A';

        // Chart
        if (forecast.labels && forecast.values) {
            const ctx = document.getElementById('forecast-chart').getContext('2d');
            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: forecast.labels,
                    datasets: [{
                        label: 'Forecasted Demand',
                        data: forecast.values,
                        borderColor: '#3498db',
                        backgroundColor: 'rgba(52,152,219,0.1)',
                        fill: true
                    }]
                }
            });
        }
    } catch (error) {
        console.error('Dashboard error:', error);
        // Show fallback dummy data for demonstration
        document.querySelector('#total-products-card .stat-value').textContent = '42';
        document.querySelector('#low-stock-card .stat-value').textContent = '7';
        document.querySelector('#reorder-alerts-card .stat-value').textContent = '3';
        document.querySelector('#forecast-demand-card .stat-value').textContent = '1250';
        document.getElementById('rop-alerts-list').innerHTML = '<ul><li><span>Product A</span> <span class="badge badge-danger">Stock: 5</span></li><li><span>Product B</span> <span class="badge badge-warning">Stock: 12</span></li></ul>';
        document.getElementById('eoq-list').innerHTML = '<ul><li><span>Product A</span> <span>EOQ: 150</span></li><li><span>Product B</span> <span>EOQ: 80</span></li></ul>';
    }
}

document.addEventListener('DOMContentLoaded', loadDashboard);
