# E2E Test Infra: Lebon Toy Inventory Stock Management

## Test Philosophy
- Opaque-box, requirement-driven. No dependency on implementation design.
- Methodology: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial + Real-World Workload Testing.
- 100% Free & Local: Uses Node 24 native test runner (`node:test`, `node:assert`, `node:vm`) with zero paid external dependencies.

## Feature Inventory
| # | Feature | Source | Tier 1 | Tier 2 | Tier 3 |
|---|---------|--------|:------:|:------:|:------:|
| 1 | WAC Calculation & Stock In | ORIGINAL_REQUEST §R1 | 6 | 4 | ✓ |
| 2 | Barcode / QR Scan & Product Lookup | ORIGINAL_REQUEST §R1 | 5 | 2 | ✓ |
| 3 | Receipt Photo Capture & Drive Link | ORIGINAL_REQUEST §R1 | 5 | 2 | ✓ |
| 4 | Stock Out & Real-Time Deduction | ORIGINAL_REQUEST §R2 | 5 | 3 | ✓ |
| 5 | Negative Stock Prevention | ORIGINAL_REQUEST §R2 | 5 | 3 | ✓ |
| 6 | Actual Selling Price & Live Profit | ORIGINAL_REQUEST §R2 | 5 | 2 | ✓ |
| 7 | Dashboard KPIs & Low Stock Alerts | ORIGINAL_REQUEST §R3 | 5 | 2 | ✓ |
| 8 | Periodic Reporting & Trend Charts | ORIGINAL_REQUEST §R3 | 5 | 2 | ✓ |
| 9 | UTF-8 with BOM CSV/Excel Export | ORIGINAL_REQUEST §R3 | 5 | 2 | ✓ |
| 10 | RBAC Admin vs Staff Cost Masking | ORIGINAL_REQUEST §R4 | 5 | 2 | ✓ |
| 11 | User Management & Password Change | ORIGINAL_REQUEST §R4 | 5 | 2 | ✓ |
| 12 | Static PWA & Offline Cache | ORIGINAL_REQUEST §R5 | 5 | 2 | ✓ |

## Test Architecture
- Test runner: `node --test tests/**/*.test.js`
- Test structure:
  - `tests/mocks/gas-mock.js`: In-Memory SpreadsheetApp, DriveApp, ContentService, Utilities
  - `tests/unit/wac-calculation.test.js`: WAC mathematical precision and edge cases
  - `tests/unit/gas-backend.test.js`: Code.gs execution in VM sandbox with mock Google Sheets/Drive
  - `tests/unit/rbac-auth.test.js`: Auth & Staff cost/profit masking
  - `tests/unit/reports-csv.test.js`: P&L math, date filters, UTF-8 BOM CSV export
  - `tests/integration/api-service.test.js`: api.js testing with mock backend & LocalStorage fallback
  - `tests/integration/multi-lot-workflow.test.js`: Multi-lot restock and sale lifecycle
  - `tests/e2e/lebon-toy-workload.test.js`: 5 real-world Lebon Toy retail workload scenarios
  - `tests/run-all.js`: Unified runner producing TAP/spec summary output

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Art Toy Blind Box Restock Rush | Stock In, WAC recalculation, receipt photo link, barcode lookup | Medium |
| 2 | Promotional & Flash Sale | Stock Out, Actual Price override, live profit calculation, stock decrement | Medium |
| 3 | TikTok Live Wholesale Bulk Order | Stock Out, Wholesale discounted price, reason note tagging | Medium |
| 4 | Display Sample & Damaged Write-Off | Stock Out @ ฿0 sale price, negative profit (loss), P&L reconciliation | High |
| 5 | End-of-Day Closing & Financial Audit | Daily P&L report, Low Stock list, UTF-8 CSV download, Admin vs Staff check | High |

## Coverage Thresholds
- Tier 1: ≥5 per feature across R1-R5 (Total ≥ 28 tests)
- Tier 2: ≥12 boundary and corner cases
- Tier 3: ≥4 pairwise & cross-feature workflows
- Tier 4: ≥5 realistic application scenarios
- Tier 5: Adversarial edge cases & white-box coverage hardening
