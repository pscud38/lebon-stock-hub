# Project: Lebon Toy Inventory Stock Management (Lebon Toy Stock Hub)

## Architecture
A 100% Free, Zero-Server-Cost Inventory Stock Management & Profit/Loss Analytics System for "Lebon Toy" (Art Toy, Squishy & Sampheng trend goods).

```
+-------------------------------------------------------------------------------+
|                             CLIENT / FRONTEND                                 |
|  - index.html (Responsive Single Page App, Tailwind CSS CDN)                  |
|  - config.js (Shop configuration, default toy mock data, API storage key)     |
|  - auth.js (Authentication state & Role-Based Access Control: Admin / Staff)  |
|  - api.js (Dual-mode: Google Apps Script REST Fetch & LocalStorage Fallback)  |
|  - app.js (POS scanner orchestration, Live Calculations, Photo Compression)   |
|  - reports.js (Daily/Weekly/Monthly/Custom P&L Analytics, Charts, CSV Export) |
|  - scanner.js (Camera Barcode & QR code scanning via Html5Qrcode)             |
|  - manifest.json & sw.js (PWA Offline caching & Mobile Home Screen)           |
+-------------------------------------------------------------------------------+
                                     |
               HTTP REST (GET/POST)  |  (Offline Fallback: LocalStorage)
                                     v
+-------------------------------------------------------------------------------+
|                       BACKEND / GOOGLE APPS SCRIPT                            |
|  - google-apps-script/Code.gs (doGet / doPost REST-like controller)           |
|  - SpreadsheetApp: Sheets ('Products', 'Transactions', 'Categories', 'Users') |
|  - DriveApp: 'Stock_Receipt_Photos' folder for Base64 image storage           |
+-------------------------------------------------------------------------------+
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | WAC Core Math | Weighted Average Cost formula $((S_{old} \times C_{old}) + (Q_{in} \times C_{in})) / (S_{old} + Q_{in})$ | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Product Profit Recalc on IN | Recalculate profit per unit & margin % when cost changes on IN | M1 | Codebase Survey / GAS |
| 3 | Backend Mock & VM Test Harness | In-memory GAS engine for automated zero-dependency testing | M1 | Test Survey |
| 4 | Barcode & QR Scanner | Camera scanner with Web Audio beep feedback | M2 | ORIGINAL_REQUEST §R1 |
| 5 | Product Search & Category Filter | Search by code/name and 7 toy categories | M2 | ORIGINAL_REQUEST §R1 |
| 6 | Stock In Transaction Flow | Restock items, update stock, log transaction | M2 | ORIGINAL_REQUEST §R1 |
| 7 | Photo Capture & Canvas Compression | Compress receipt images (<200KB) via Canvas before upload | M2 | ORIGINAL_REQUEST §R1 |
| 8 | Google Drive Image Storage | Store photos in `Stock_Receipt_Photos` folder with public view link | M2 | ORIGINAL_REQUEST §R1 |
| 9 | Local Offline Photo Preview | Persist base64 images in LocalStorage for offline demo viewing | M2 | Codebase Survey |
| 10 | Real-time Stock Out Deduction | Immediately deduct stock balance upon sale | M3 | ORIGINAL_REQUEST §R2 |
| 11 | Strict Negative Stock Prevention | Reject Stock Out when $Q_{out} > S_{current}$ with clear Thai error | M3 | ORIGINAL_REQUEST §R2 |
| 12 | Actual Selling Price Input | Flexible sale price per unit for discounts, wholesale, promos | M3 | ORIGINAL_REQUEST §R2 |
| 13 | Real-time POS Profit Preview | Live calculate revenue, cost, profit, and margin % during entry | M3 | ORIGINAL_REQUEST §R2 |
| 14 | Sales Channel & Note Tagging | Record channel (Storefront, TikTok, Shopee, Sample, Damaged) | M3 | ORIGINAL_REQUEST §R2 |
| 15 | Dashboard KPI Summary | Total Inventory Value, Low Stock Alerts, Today Sales & Profit | M4 | ORIGINAL_REQUEST §R3 |
| 16 | Low Stock Alert List | Identify and display products with stock $\le$ minAlert | M4 | ORIGINAL_REQUEST §R3 |
| 17 | Periodic Reporting Filters | Daily, Weekly (7d), Monthly (YYYY-MM), Custom date ranges | M4 | ORIGINAL_REQUEST §R3 |
| 18 | Sales & Profit Trend Chart | Chart.js bar chart comparing Revenue, Cost, and Profit | M4 | ORIGINAL_REQUEST §R3 |
| 19 | Category Profit Donut Chart | Chart.js donut chart showing profit share by toy category | M4 | ORIGINAL_REQUEST §R3 |
| 20 | Top Profit Ranking Table | Product breakdown table sorted descending by profit | M4 | ORIGINAL_REQUEST §R3 |
| 21 | Audit Trail History | Complete log of all transactions with image preview buttons | M4 | ORIGINAL_REQUEST §R3 |
| 22 | UTF-8 with BOM CSV/Excel Export | Export P&L reports with `\uFEFF` BOM for 100% Thai Excel compatibility | M4 | ORIGINAL_REQUEST §R3 |
| 23 | Role-Based Access Control (RBAC) | Admin full access; Staff strictly hidden from cost/profit/reports | M5 | ORIGINAL_REQUEST §R4 |
| 24 | Self Password Change | User changes password with old password verification (min 4 chars) | M5 | ORIGINAL_REQUEST §R4 |
| 25 | Admin Password Reset | Admin resets user password directly | M5 | ORIGINAL_REQUEST §R4 |
| 26 | User Management CRUD | Admin adds, edits roles, and deletes users (protecting main admin) | M5 | ORIGINAL_REQUEST §R4 |
| 27 | 100% Free Static PWA Architecture | Vanilla JS/HTML5, Tailwind CDN, PWA Service Worker, zero build | M5 | ORIGINAL_REQUEST §R5 |
| 28 | Comprehensive 4-Tier E2E Verification | Run 100% E2E test suite (Tiers 1-4) | M6 | ORIGINAL_REQUEST §AC |
| 29 | Adversarial Coverage Hardening | White-box stress testing, corner cases, and edge verification (Tier 5) | M6 | Orchestrator Spec |
| 30 | Forensic Integrity Audit | Systematic audit for authentic logic, zero cheating/dummy facades | M6 | Orchestrator Spec |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Data Engine & WAC Core | WAC math, GAS Code.gs & api.js sync, mock test engine | none | DONE |
| M2 | Stock In & Photo Integration | Scanner, Stock In flow, Canvas compression, Drive upload | M1 | DONE |
| M3 | Stock Out & Sales Engine | Stock Out, negative prevention, actual price, POS live profit | M1 | DONE |
| M4 | Analytics, Reports & Export | Dashboard KPIs, period filters, Chart.js, Thai UTF-8 CSV | M1, M2, M3 | DONE |
| M5 | RBAC, User Security & PWA | Admin/Staff role masking, password management, PWA | M1, M2, M3, M4 | DONE |
| M6 | Final Acceptance & Hardening | Full 4-Tier E2E test pass, Tier 5 adversarial tests, Forensic Audit | M1-M5 | DONE |

## Interface Contracts
### Data Schema (`Products`)
- `ProductID` (String), `ProductName` (String), `Category` (String), `Unit` (String)
- `CostPrice` (Number, WAC), `SalePrice` (Number), `ProfitPerUnit` (Number), `MarginPercent` (Number)
- `CurrentStock` (Integer), `MinAlert` (Integer), `LastUpdated` (ISO DateTime)

### Data Schema (`Transactions`)
- `TransID` (String), `Timestamp` (ISO DateTime), `ProductID` (String), `ProductName` (String)
- `Type` ('IN' | 'OUT' | 'ADJUST'), `Quantity` (Number), `CostPrice` (Number), `SalePrice` (Number)
- `TotalCost` (Number), `TotalRevenue` (Number), `Profit` (Number), `Operator` (String)
- `Note` (String), `ImageUrl` (String)

### WAC Formula Contract
$$\text{New WAC} = \frac{(S_{old} \times C_{old}) + (Q_{in} \times C_{in})}{S_{old} + Q_{in}}$$
- When $S_{old} \le 0$ and $C_{in} > 0$: $\text{New WAC} = C_{in}$
- When $C_{in} = 0$ or undefined: $\text{New WAC} = C_{old}$

### RBAC Masking Contract
- If `user.role !== 'admin'`:
  - `CostPrice`, `TotalCost`, `Profit`, `MarginPercent` must NOT be rendered in UI tables, cards, or POS forms.
  - CSV Export must NOT include cost or profit columns for non-admin users.
  - Reports tab menu is completely hidden.

## Code Layout
- `d:/stock/index.html` — Single Page Application structure & modals
- `d:/stock/styles.css` — Custom CSS, print styles, font imports
- `d:/stock/config.js` — App constants, default mock data, storage keys
- `d:/stock/auth.js` — Authentication & RBAC management
- `d:/stock/api.js` — API service abstraction (GAS REST & LocalStorage fallback)
- `d:/stock/app.js` — UI controller, POS workflows, image compression, live calculations
- `d:/stock/reports.js` — Reporting engine, Chart.js graphs, CSV export
- `d:/stock/scanner.js` — Html5Qrcode camera barcode scanner & Web Audio beeps
- `d:/stock/manifest.json` — PWA web application manifest
- `d:/stock/sw.js` — PWA Service Worker offline cache
- `d:/stock/google-apps-script/Code.gs` — Google Apps Script backend controller
- `d:/stock/tests/` — Automated test suite & mock harnesses
