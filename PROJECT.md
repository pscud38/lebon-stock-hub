# Stock-only architecture

Single-store inventory without sales or Google Sheets.

- index.html, src/app.js, src/style.css: responsive Thai UI.
- src/core.js: validation, RPC errors, CSV, Bangkok dates.
- src/queue.js: IndexedDB documents with immutable ids, account-scoped replay and browser locks.
- supabase/migrations/*_stock_only.sql: schema, restricted RPCs, atomic documents and audit.
- public/sw.js, vite.config.js: versioned static-only cache; API requests bypass caching.
- tests/: PGlite database tests and browser workflows.
- docs/CUTOVER.md: staging, backup, cutover and recovery gates.

## Authentication
Existing username/password accounts are preserved per the owner's instruction.
Migration hashes legacy plaintext passwords with bcrypt without changing the password.
Two UUIDv4 values provide 244 bits of random session-token entropy. Only SHA-256 token hashes are stored in stock_private.
Tokens are stored in browser sessionStorage and expire after eight hours. Logout/password change/suspension revoke sessions.
The server checks account status and role on every request. Five failed login attempts block the account for the remainder of a 15-minute window.

This is legacy-account session authentication, not email-based Supabase Auth.
Public SECURITY INVOKER wrappers call private SECURITY DEFINER implementations which verify the opaque token before dispatch.
The private mutation and actor helpers cannot be called by API roles. Do not expose stock_private through PostgREST.
Direct table/view access and all legacy privileged RPC overloads are revoked from PUBLIC, anon and authenticated.
No client-supplied role/operator is trusted. Staff responses omit costs.

## Integrity
Existing products, transactions, categories, users and preorders rows are retained.
Historical sales columns stay in the database but are excluded from the new API.
Product metadata cannot change stock/cost directly. Archiving requires zero stock.
A document commits all product changes and ledger rows in one transaction. Product rows are locked in sorted order.
UUID plus immutable payload prevents retry duplication. Cancellation reserves the UUID to prevent late writes.
Counts compare expected stock first. Reversal references the original document and may happen once.
Legacy/count corrections use new counts rather than deleting history. Password values are excluded from audits.

## Limits
Supplier incoming-order tracking, multi-warehouse transfers, scheduled backups and multi-connection load testing are not part of this code change.
The read-only production inspection found zero preorders; any subsequently created orders need reconciliation before cutover.
Backup/restore and production cutover are pending deployment gates. Production is not secured by a draft PR alone.
