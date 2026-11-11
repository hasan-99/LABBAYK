# LABBAYK implementation roadmap

## Platform decision

- Customer and driver experience: one Expo Router + React Native app, developed and released for web first, then Android/iOS from the same application code.
- Admin experience: separate responsive React + Vite web app.
- Shared contracts and design tokens: workspace packages, kept free of browser-only dependencies so native can use them.
- Backend: Supabase Postgres/Auth/Realtime/Storage and server-side functions. Do not connect a Supabase project until its ownership for LABBAYK is confirmed.
- Development order: verify each milestone's acceptance gate before calling it complete. Keep real customer, driver, and financial operations server-confirmed.

## Phases and milestones

| Phase | Milestones | Outcome |
|---|---|---|
| 0. Project foundation | M0 | Repository, runtime, package layout, provider decisions, local setup and working development servers. |
| 1. Brand and application shells | M1 | RTL design tokens, brand assets, shared primitives, customer/driver navigation and responsive admin shell. |
| 2. Identity and service setup | M2 | Email/password accounts with signup-only confirmation code, invite-only drivers, admin roles, service zones and saved addresses with authorization. |
| 3. Customer order lifecycle | M3–M4 | Quotes, order creation, atomic driver matching, purchase approvals, delivery proof and durable notifications. |
| 4. Operations console | M5 | Admin order dispatch, pricing and overrides, user/driver management and audit history. |
| 5. Cash and commission controls | M6 | Append-only wallet ledger, settlement, corrections, reconciliation and disputes. |
| 6. Reliability and handoff | M7 | Security, RTL/accessibility, offline recovery, reconnect, browser end-to-end checks, builds and setup handoff. |

## Phase work slices and acceptance gates

### Phase 0 — M0: Project foundation

1. Inspect repository and environment; preserve planning documents and scripts.
2. Establish the Expo + React Native Web customer/driver app, separate React admin app, and typed shared workspace packages.
3. Document install, local development, build and provider setup commands.
4. Confirm the intended Supabase project, email sender and route-distance approach before using external credentials or modifying an external database.

**Gate:** clean install; customer web, admin web and Expo native targets start; architecture and external setup gaps are documented.

### Phase 1 — M1: Brand and shells

1. Implement the approved Midnight Lime tokens and original editable SVG logo.
2. Build accessible shared controls and network/sync feedback patterns.
3. Build Arabic RTL customer and driver shells with responsive mobile navigation.
4. Build the admin shell with compact navigation, real-data empty states and responsive table/card patterns.

**Gate:** no template branding remains in app entry screens; all shell navigation works; visual review at 375px and 1440px; no controls imply unavailable backend work has succeeded.

### Phase 2 — M2: Identity and service setup

1. Model profile, roles, invite provenance, driver applications and service zones.
2. Use email and password for customers and drivers; verify their email once during signup and provide password recovery. Admins request a one-time email link with account creation disabled, then pass a server-checked `super_admin` role gate. Do not enable SMS unless a provider is chosen.
3. Add invite redemption, admin driver review, address CRUD and zone validation.
4. Add RLS and role/ownership checks; verify cross-role access is denied.

**Gate:** customer and approved driver journeys work with real sessions; invite reuse/expiry and authorization checks pass.

### Phase 3 — M3/M4: Order lifecycle

1. Define typed order, quote, pricing snapshot, offer, event and idempotency contracts.
2. Implement fee calculation, route abstraction, manual address fallback and explicit provisional quotes.
3. Create orders and fan out offers; make acceptance atomic and first-driver-wins.
4. Implement pickup selection, purchase recording, customer price approvals, status tracking, OTP delivery confirmation and notifications.
5. Persist offline drafts, reconcile uncertain submissions, and never report unconfirmed server actions as complete.

**Gate:** full customer-to-driver order journey works; one of two racing drivers wins; changed prices require consent; stale/offline and retry cases reconcile safely.

### Phase 4 — M5: Operations console

1. Build live dispatch, order search and detailed order workspace.
2. Manage drivers, invites, service zones and customer support cases.
3. Configure global and zone pricing, then guarded per-order adjustments.
4. Capture before/after values, reasons, actor, timestamp and affected-party approvals in an immutable audit trail.

**Gate:** all admin actions are permission-checked and auditable; no post-settlement rewrite of financial history.

### Phase 5 — M6: Cash and commission

1. Implement integer minor-unit money contracts and explicit currency.
2. Add immutable commission-credit ledger, verified top-ups, debits, reversals and manual adjustments.
3. Settle cash orders once and prevent silent negative driver credit.
4. Provide reconciliation and dispute workflows that separate goods, delivery income, driver share and platform commission.

**Gate:** duplicate settlement is impossible; ledgers reconcile; corrections are traceable journal entries.

### Phase 6 — M7: Reliability and handoff

1. Complete end-to-end coverage and security checks for order, permissions and money invariants.
2. Check Arabic RTL, keyboard/screen-reader operation, contrast, responsive layouts and reduced motion.
3. Exercise offline drafts, slow connections, timeouts, refresh and reconnect reconciliation.
4. Produce verified web builds, setup documentation and an accurate open-items report.

**Gate:** reproducible browser journey completes; critical offline and access-control cases are verified; reports list exact commands, outcomes and any remaining provider/legal blockers.

## Current execution position

M0 is locally verified: workspace installation, production web builds, and TypeScript checks succeeded. The Supabase project `LABBAYK` is in `hasan-99` / `eu-central-1`; the Expo web app and React/Vite admin console use the project's publishable key. M2 has live identity, roles, driver invites/review, zones, and saved addresses with RLS. Customer and driver use email/password with a signup-only confirmation code and password recovery; driver access additionally requires an invite and admin approval. Admin sign-in sends a one-time email magic link without allowing account creation; the app checks the `super_admin` role before opening the console. The local confirmation template uses `{{ .Token }}`; hosted Gmail SMTP now delivers signup confirmation codes and admin magic links to the connected Gmail account. Broader email-provider deliverability remains unverified. Phone auth and Twilio are disabled and not required. Customer/driver order flows, admin dispatch and Realtime are implemented; the purchase ceiling, above-budget approval, post-purchase confirmation, delivery OTP, and append-only order events are live. Delivery-code secrets are excluded from authenticated SELECT. The owner chose manual per-order road-distance pricing until a map provider is selected: the app now requires an admin quote with a reason, customer approval, and an audited immutable price before dispatch. M4 includes durable notifications with per-user RLS and Realtime. M5 includes reasoned pricing/commission controls, live operations overview, admin audit, driver review, dispatch/cancellation, invites, disputes, admin account search and reasoned profile edits; Auth-level suspension/restoration is deployed through a JWT-verified Edge Function. Existing access tokens may remain usable until expiry. M6 includes the owner-approved 40% commission on delivery only, cash-on-delivery settlement, wallet balance guards, a date-filtered cash reconciliation RPC/report, audited append-only wallet entry reversals, and idempotent reasoned manual positive/negative wallet adjustments. Cash-settlement reversal now uses append-only reversal records and a compensating wallet entry; reconciliation excludes reversed settlements. Settlements still rely on an administrator confirming cash receipt; there is no payment processor or automated payment proof. Current verification: `pnpm typecheck`, `pnpm build:web`, `pnpm build:admin`, and app lints pass (lint has existing warnings); five workflow scenarios and quote approval/rejection/security checks ran in rollback-only transactions; reconciliation returned expected totals in a rolled-back fixture and denied the QA customer; the directory returned two accounts to a real admin session, denied a customer and `anon`; profile editing passed an admin rollback test and denied a customer; manual wallet adjustments passed positive, negative, idempotency, insufficient-balance and non-admin rollback checks; cash-settlement reversal passed rollback tests for commission refund, idempotent retry, reconciliation exclusion, resettlement and active-commission protection. Security has only the leaked-password warning and Health is clean. Connectivity monitoring and draft persistence are implemented; reconnect simulation passed, while reopen-offline on a real device remains unverified. Separate customer/driver browser sessions and the admin magic-link role check passed. The user-session image upload passed on web. Broader accessibility review, native image-library testing on real devices, reopen-offline on a real device, and cross-provider email deliverability remain open. Manual per-order delivery quotes remain the owner-approved process until map pricing is chosen.

- Live end-to-end verification on 2026-11-11: manager approved the QA driver, enabled the test zone, and the driver accepted an offer and completed shopping plus delivery-code confirmation. Database verification showed `delivered`; the driver was set offline and the test zone deactivated afterward. The uploaded QA image appeared on the order and the database confirmed one object in the private bucket; the order was then cancelled and the zone deactivated. One small QA object remains associated with that cancelled test order. Five rollback SQL scenarios passed again, local/remote migration histories match at 45/45, and typecheck, Expo web export, admin build, and both lints exited successfully (lint/build retain existing warnings).
