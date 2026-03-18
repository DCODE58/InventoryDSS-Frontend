```markdown
# Smart Inventory Optimization DSS - Frontend

<p align="center">
  <img src="assets/images/logo.png" alt="IO-DSS Logo" width="200"/>
</p>

The **Smart Inventory Optimization Decision Support System (IO-DSS)** frontend is a responsive web application that provides a user-friendly interface for managing products, tracking inventory, recording sales, and visualizing optimization insights. It communicates with a Flask-based backend API to perform real-time calculations and display alerts.

---

## ✨ Features

- **Dashboard** – Overview of key metrics: total products, low stock items, reorder alerts, and forecasted demand.
- **Product Management** – Add, edit, and delete products with cost and price details.
- **Inventory Tracking** – View current stock levels, reorder points, and safety stock; update stock quantities.
- **Sales Recording** – (Optional integration) Record sales to automatically update inventory and trigger alerts.
- **Optimization Insights** – Display Reorder Point (ROP) alerts and Economic Order Quantity (EOQ) recommendations.
- **Forecast Charts** – Visualize demand forecasts using moving averages.
- **Telegram Alerts** – Receive real‑time notifications when stock falls below reorder point (handled by backend, but displayed in UI).

---

## 🛠️ Technology Stack

| Component          | Technology                     |
|--------------------|--------------------------------|
| **Markup**         | HTML5                          |
| **Styling**        | CSS3 (with custom components)  |
| **Logic**          | JavaScript (ES6)               |
| **Icons**          | Font Awesome 6                 |
| **Charts**         | Chart.js                       |
| **HTTP Client**    | Fetch API (wrapped in `api.js`)|
| **Hosting**        | Netlify / GitHub Pages         |

---

## 📁 Folder Structure

```
frontend/
│
├── index.html              # Landing page (redirects to dashboard)
├── dashboard.html          # Main dashboard with KPIs and charts
├── products.html           # Product management page
├── inventory.html          # Inventory view and stock updates
├── reports.html            # Reports and analytics page
│
├── assets/
│   ├── css/
│   │   ├── styles.css       # Global styles
│   │   ├── dashboard.css    # Dashboard-specific styles
│   │   └── components.css   # Navbar, sidebar, modal styles
│   ├── js/
│   │   ├── app.js           # Main initialization
│   │   ├── api.js           # API wrapper for backend calls
│   │   ├── dashboard.js     # Dashboard logic
│   │   ├── inventory.js     # Inventory page logic
│   │   ├── products.js      # Product CRUD logic
│   │   └── reports.js       # Reports & charts logic
│   ├── images/
│   │   └── logo.png         # Project logo
│   └── icons/
│       └── icons.svg        # (Optional) SVG icon sprite
│
├── components/
│   ├── navbar.html          # Reusable navigation bar
│   ├── sidebar.html         # Reusable sidebar menu
│   └── modal.html           # Generic modal template
│
├── utils/
│   ├── helpers.js           # Utility functions (formatting, etc.)
│   └── constants.js         # Global constants (alert levels, defaults)
│
├── config/
│   └── config.js            # Backend API base URL configuration
│
└── README.md                # This file
```

---

## 🚀 Getting Started

### Prerequisites
- A modern web browser (Chrome, Firefox, Edge, etc.)
- Backend API running (see [IO-DSS Backend Repository](#))
- (Optional) A web server for local development (e.g., Live Server extension in VS Code)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/io-dss-frontend.git
   cd io-dss-frontend
   ```

2. **Configure the backend API URL**
   Open `config/config.js` and set the correct endpoint:
   ```javascript
   const CONFIG = {
       API_BASE_URL: 'https://your-backend.onrender.com/api'  // Replace with actual backend URL
   };
   ```

3. **Run locally**
   - If you have Python, you can start a simple HTTP server:
     ```bash
     python -m http.server 8000
     ```
   - Or use any static server (Live Server, etc.)
   - Open `http://localhost:8000` in your browser.

### Deployment

#### Deploy to Netlify
1. Push the code to a GitHub repository.
2. Log in to [Netlify](https://app.netlify.com/).
3. Click **"Add new site"** → **"Import an existing project"**.
4. Connect your GitHub repo and select the branch.
5. Build settings are not required (static site). Publish directory should be the root (or `./`).
6. Click **"Deploy site"**.
7. After deployment, update `config.js` with the production backend URL (use environment variables if needed).

#### Deploy to GitHub Pages
1. In your repo, go to **Settings** → **Pages**.
2. Select the branch (e.g., `main`) and folder (`/root`).
3. Save; your site will be published at `https://yourusername.github.io/io-dss-frontend/`.
4. Update `config.js` accordingly.

---

## 📱 Usage Guide

1. **Dashboard**  
   - View summary cards and recent alerts.
   - ROP alerts and EOQ recommendations are loaded automatically from the backend.
   - The forecast chart displays predicted demand for the next 30 days.

2. **Products**  
   - Add a new product by clicking the **"Add Product"** button.
   - Edit or delete existing products using the action buttons.

3. **Inventory**  
   - See current stock levels and status (Normal / Low Stock).
   - Click **"Update"** to adjust stock quantities. If new stock falls below the reorder point, a Telegram alert will be triggered by the backend.

4. **Reports**  
   - View sales history and forecast charts.
   - Optimization parameters (ROP, EOQ) are displayed in a summary.

---

## 🔌 API Integration

All backend communication is handled by `assets/js/api.js`, which exports an `api` object with methods like:

- `api.getProducts()`
- `api.addProduct(product)`
- `api.updateStock(productId, quantity)`
- `api.getROPAlerts()`
- etc.

The base URL is taken from `config/config.js`. Ensure this points to your live backend.

---

## 📸 Screenshots

(Add screenshots of your dashboard, products, inventory pages here.)

---

## 🤝 Contributing

Contributions are welcome! Please open an issue or submit a pull request for any improvements or bug fixes.

---

## 📄 License

This project is licensed under the MIT License – see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgements

- [Chart.js](https://www.chartjs.org/) for beautiful charts.
- [Font Awesome](https://fontawesome.com/) for icons.
- [Flask](https://flask.palletsprojects.com/) for the backend API.

```

This README is detailed, professional, and follows your request: no excessive emojis, but uses simple icons for headings. It includes all necessary sections and can be customized further with actual screenshots and links.
