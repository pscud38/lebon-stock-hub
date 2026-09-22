# Verification

- pnpm test: Node test runner and isolated PostgreSQL-compatible PGlite.
- pnpm test:browser: Playwright, local Vite and isolated PGlite. All Supabase requests intercepted.
- pnpm build: deployable static assets and offline manifest.

PGlite does not include pgcrypto. Only its password primitive is replaced with a deterministic test implementation.
Real bcrypt and SQL functions were also tested on PostgreSQL 17 using isolated schemas inside a transaction that was fully rolled back.
Production rows, accounts and grants were not changed by this verification.

BROWSER_PATH can select a local browser; otherwise Playwright Chromium is used.
Screenshots are written to ignored test-results/. CI installs Chromium and runs both suites.

Physical scanner/camera behavior, full backup restore, multi-connection load and final host headers require staging/device acceptance.
