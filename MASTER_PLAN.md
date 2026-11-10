# LABBAYK | لَبّيك — CODEX MASTER IMPLEMENTATION PLAN
Version: 1.0 | Web-first Expo MVP | Damascus & Rif Dimashq
Brand: لَبّيك | LABBAYK | «اطلب، والباقي علينا.»
Companion: `DESIGN.md` is the authoritative UI/brand specification.

## Codex operating instructions
You are the lead engineer and product implementer. Inspect repository, existing code, scripts, schema, and environment before changing anything. If empty, scaffold a maintainable monorepo. Implement the complete, working end-to-end MVP, not mock screens. Proceed milestone-by-milestone, run tests and builds, fix regressions, and keep a short status table of completed/verified/open work. Do not claim completion unless proven by tests and a live browser workflow. Do not silently skip hard parts. Never print secrets. Do not deploy publicly, buy services, or enable paid APIs without explicit approval. Prefer zero-cost local development and free tiers where practical. If credentials or provider capabilities are missing, create clear configuration instructions and a real functional local alternative, not a fake success path. Preserve any existing repository features.

## 1. Product scope and non-goals
A customer orders arbitrary lawful everyday goods from a shop or nearby unspecified shop; vetted invite-only drivers accept first-come-first-served, purchase, deliver, collect cash. Platform earns a commission from delivery fee; driver pre-pays internal commission credit and is charged upon completed settlement. Initial service geography Damascus and Rif Dimashq; begin with configurable small active zones. No restaurant marketplace, merchant onboarding, product catalog, online payment gateway, AI assistant, coupons, subscriptions, or complex route optimization in MVP.

## 2. Technology and repository
- Monorepo with `apps/mobile` Expo Router + React Native + TypeScript (Expo Web first, Android/iOS compatible), `apps/admin` React + Vite + TypeScript + Tailwind + shadcn/ui, `packages/shared` types/zod schemas, `packages/design-tokens`, `supabase/migrations`, `supabase/functions`, `tests`.
- Supabase Postgres, Auth, Realtime, Storage, Edge Functions/RPC. All privileged mutations server-side. Database constraints and RLS required.
- Maps: OpenStreetMap-compatible display via web and native adapters, route-distance provider abstraction; avoid relying on public tile/routing endpoints for unrestricted traffic. For local testing provide deterministic route-distance fixture only in explicit developer demo mode, never represent it as a real route quote. Manual addresses and admin-set fee remain possible if routing unavailable.
- Notifications: realtime in-app on web; browser notifications when supported and permission granted; Expo push on supported native builds after configuration. Durable notification inbox always works. Do not assume background push on web.
- Dev commands: documented `install`, `dev:web`, `dev:admin`, `db:reset`, `test`, `lint`, `typecheck`, `build` with workspace runner. Provide `.env.example`, README and local setup.

## 3. Roles and permissions
`customer`, `driver_pending`, `driver`, `super_admin`. Only super_admin can create invites, approve/suspend drivers, configure pricing, override orders, post wallet credit, settle disputes. Driver access requires valid approved status and invite provenance. Never allow client-side role selection to grant privileges. Bootstrap initial super_admin by explicit secure server-side setup, never public signup. Admin session hardening and optional MFA readiness. Enforce permissions in RLS and every server function; test IDOR and cross-role access.

## 4. Customer functional scope
Email/password accounts for customers and drivers, with email OTP verification only at first signup; subsequent sign-ins use the password. Admin signs in using its existing email identity and the privileged `super_admin` role. SMS is outside the current login flow. Saved addresses with map pin/manual address; delivery-zone validation. Free-text items and optional item lines/photos; optional pickup shop pin or unspecified nearby shop; budget ceiling and instructions. Quote and submit, matching, active order timeline, price-change approvals, cash due, driver contact, delivery OTP, history, support issue, cancellation with state-aware policy, rating.

## 5. Driver functional scope
Single-use expiring signed invite, verification, application, admin approval. Online/offline presence and zone eligibility. Incoming offers with timeout, atomic accept, decline, and stale offer handling. Order details, pickup shop selection, price proposal, approval wait, purchase amount + optional receipt photo, route/navigation link, delivery state, cash collection, OTP confirmation, wallet/earnings/history. Drivers cannot self-assign, change platform fees, bypass approval, or post wallet credits.

## 6. Admin full control (mandatory)
Super Admin manages users, drivers, invites, zones, orders, matching, pricing, per-order purchase amount, delivery fee (including 0), driver commission (percentage or fixed), customer discounts, platform-funded credits, dispatch, cancellation, disputes, wallet top-ups, corrections, financial reports and audit. Pricing overrides work globally, by zone, and on individual orders. Every sensitive edit captures reason, old/new values, actor, time, and order version. After customer or driver has committed, a material increase or earnings decrease requires explicit affected-party approval before progression; admin authority does not bypass consent. After settlement, never mutate original ledger rows: issue reversal/adjustment entries with traceability.

## 7. Pricing engine
Config versioned: `base_fee`, `included_km`, `rate_per_extra_km`, `minimum_fee`, optional `maximum_fee`, rounding increment, zone surcharge, quote TTL, route provider and distance source. Formula: `clamp(round(base_fee + max(0, route_km-included_km)*rate_per_extra_km + surcharge), min,max)` with configurable rounding. `per_order_override > zone_override > global_rule` for delivery fee; purchase actual is a separate monetary component. Route length is pickup-to-dropoff road distance; optional driver-to-pickup fee only if explicitly configured and displayed. Unspecified pickup: estimate clearly marked provisional; once shop pinned, recompute and require approval if changed. Store pricing rule version, distance, route source, quote timestamps, fee breakdown, admin overrides and consent snapshot. No retroactive price recalculation on old orders.

## 8. Order state machine
`draft -> quoted -> searching -> accepted -> shopping_pending_approval? -> shopping -> purchased -> delivering -> delivered -> settled`; terminal `cancelled`, `expired`, `disputed` where applicable. Define allowed transitions by role and guards in server domain layer; store append-only order events. Order cancellation after purchase becomes an exception/dispute requiring human resolution. Driver acceptance must be a single atomic compare-and-set in Postgres with unique accepted driver per order and offer expiry check. Reassignment revokes old driver access. Idempotency keys on create, accept, purchase confirmation, delivery completion, and settlement.

## 9. Purchase budget and approval policies
Support low/normal/high risk tiers configured by admin, based on purchase ceiling, category, and driver purchase exposure. Low-risk may proceed within approved ceiling; normal requires customer-set budget; high requires admin approval or an explicitly arranged payment mechanism before purchase. Never instruct drivers to front unlimited cash. Proposed changes to item price, delivery fee, or purchase ceiling generate a versioned approval request with deadline, approve/reject, notification and server enforcement. Customer sees exact final cash amount before driver purchases when known. Support unavailable items, substitutions only with customer approval.

## 10. Cash and finance accounting
All monetary values stored as integer smallest supported unit (configurable SYP denomination) with explicit currency; never float. Separate: goods purchase cost, delivery fee, discount funding source, cash collected, driver gross delivery earnings, platform commission, wallet commission credit, settlement adjustments. Cash physically collected by driver; goods purchase reimbursement is not platform revenue. On settlement: platform commission debited from prepaid driver commission credit once, driver net delivery fee computed, and order marked settled atomically. If balance insufficient, policy must block new offers and flag any already-accepted order for admin resolution; never silently make negative credit. No auto-refund claim for cash payments. Wallet ledger append-only: `credit_topup`, `commission_debit`, `reversal`, `manual_adjustment`; each with reference, actor, reason, idempotency key, timestamp. Admin can adjust with documented journal entries, never overwrite. Include reconciliation report: cash collected vs goods vs delivery vs commission. Discounts must specify who bears the cost; cannot silently reduce driver share.

## 11. Database schema and migrations
At minimum: `profiles`, `roles` or secure role claims mapping, `driver_invites`, `driver_profiles`, `driver_documents`, `driver_presence`, `service_zones`, `addresses`, `orders`, `order_items`, `order_images`, `order_offers`, `order_events`, `pricing_rules`, `pricing_zone_overrides`, `order_pricing_snapshots`, `order_price_overrides`, `price_approval_requests`, `wallet_accounts`, `wallet_ledger`, `cash_settlements`, `disputes`, `notifications`, `ratings`, `admin_audit_log`, `idempotency_keys`. Define foreign keys, unique indexes, check constraints, time-based indexes, status constraints, immutable ledger protections, and transaction-safe RPCs. Sensitive identity docs in private storage, short-lived signed URLs and role-specific access. Do not expose raw service role keys to browser/mobile.

## 12. Server endpoints and RPC contracts
Implement and document typed contracts (Zod): auth/profile; invite issue/revoke/redeem; driver application/approve/suspend/presence; zones/addresses; order draft/quote/create/list/get/cancel; offer fanout/accept/decline/expire; pickup set; price proposal/approve/reject; shopping purchase record; status transition; delivery OTP verify; settle; wallet topup/adjust/reconcile; admin override; disputes; notifications. Prefer Postgres RPC for concurrency-sensitive operations. Validate server input, auth, ownership, version and idempotency. Realtime channels must be scoped and authorized; notification fanout must not leak customer phone/address to unassigned drivers.

## 13. Dispatch and real-time
Offer eligible approved online drivers in configured radius/zone. Use server-owned eligibility and order offers with expiry; first successful atomic accept wins, other offers revoked. Realtime subscriptions update customer/driver/admin; reconnect and re-fetch authoritative state after disconnection. Fallback if no driver accepts: retry wider configured zone, then expire or escalate to admin. Avoid unbounded polling; clean up subscriptions. Location updates only during active assigned order with explicit consent and retention policy.

## 14. Notifications
Durable in-app notifications for new offers, accepted orders, approval requests, price changes, cancellations, status updates, wallet events, admin exceptions. Push adapter optional by platform and configuration. Respect permission and delivery limitations; no reliance on push as source of truth. Deduplicate by event ID and mark read.

## 15. UI implementation
Follow `DESIGN.md` screen by screen: C01–C12, D01–D08, A01–A13, including shared component library, RTL, Midnight Lime tokens, responsive behavior, accessible forms, and meaningful loading/error/empty states. Build customer and driver role-specific navigation in same Expo app; admin separate web dashboard. No inert buttons, placeholder metrics or fake live maps. Seed demo data only in explicitly marked local development fixtures, not live screens.

## 16. Security, privacy, and operational controls
RLS deny by default; role-specific grants, auth checks for Edge Functions and RPC, signed invite tokens hashed at rest, rate limits for OTP/invite/order creation, anti-spam order limits, server-calculated money, secure file MIME/size validation, private storage, audit trails, CSRF/session considerations for admin, no credentials in logs, sensitive data minimization. Define document retention and location sharing consent. Enforce prohibited-goods policy and safe dispute handling. Validate legal/business requirements in Syria before commercial launch; do not assert compliance automatically.

## 17. Testing matrix (must implement)
Unit: pricing including 0 override, min/max, zone precedence, rounding, quote expiry; state transitions; commission/discount math; approval guards. Integration: customer create -> offers -> two-driver simultaneous accept (exactly one winner) -> price approval -> purchase -> OTP -> settle once; cancel pre/post purchase; no drivers; wallet insufficient; admin price override before/after acceptance and after settlement (journal only); invite reuse/expiry; RLS/IDOR; reconnect; route provider outage. E2E browser: Customer and Driver Expo Web + Admin Vite, mobile 375px and desktop 1440px, Arabic RTL, critical flow screenshots. Build/typecheck/lint/test and report exact pass counts and remaining blockers. No test-only shortcuts in real business logic.

## 18. Milestones and acceptance gates
M0 Repository inspection, architecture, environment and README. Gate: all dev servers start.
M1 Design tokens, logo SVG, shared UI and responsive shells. Gate: visual QA and RTL screenshots.
M2 Auth, roles, invites, driver approval, zones and addresses. Gate: permissions verified.
M3 Orders, quotes, routing abstraction, matching and atomic acceptance. Gate: concurrency tests pass.
M4 Shopping, price approvals, tracking states, delivery OTP and notifications. Gate: customer/driver journey works.
M5 Admin comprehensive management, global/zone/order pricing overrides, dispatch and audit. Gate: all controls functional.
M6 Wallet ledger, cash settlements, corrections, reconciliation and disputes. Gate: financial invariants pass.
M7 E2E regression, accessibility, offline/reconnect, security checks, web build and handoff. Gate: real browser end-to-end scenario complete with evidence.
At every milestone: update `IMPLEMENTATION_STATUS.md` with Done/Verified/Open, commands and results; never mark unverified items complete. Continue through milestones unless blocked by essential external credentials, then document blocker and work on independent sections.

## 19. Definition of Done
- Customer creates real order and sees correct quoted/estimated fee.
- Approved invite-only driver receives offer and accepts; concurrent second acceptance loses.
- Driver records shop and goods, customer approves required changes, driver delivers, cash handoff confirmed, order settles once.
- Admin can change global, zone, and individual-order delivery fees, goods amount, discounts and commission with versioned audit and consent guardrails.
- Wallet commission debit, topup and corrections are ledger-backed and reconciled.
- Full web app and admin dashboard functional, responsive, RTL, built and tested.
- Source, migrations, `.env.example`, setup instructions, and status report provided.
- No mock-only critical paths, unauthorized data access, fabricated business data, or silent monetary changes.

## 20. Codex kickoff command
Read `DESIGN.md` and `MASTER_PLAN.md` completely. Inspect the repository. Produce a short implementation map, then execute M0 through M7 with real code and migrations. Prioritize a working Expo Web + Admin web workflow. Keep the Midnight Lime palette and Arabic brand exact. Run validation after each milestone and finish with a concise verified checklist and any genuine blockers. Do not ask for routine implementation choices; use documented defaults. Ask only when credentials, legal decisions, or irreversible external actions genuinely require owner input.

---
## MANDATORY: Syria Low-Connectivity Reliability (P0)
The Damascus/Rif Dimashq rollout assumes slow, intermittent, high-latency and expensive mobile internet. This is a launch-blocking engineering requirement, not a stretch feature. Implement and verify across Expo Web/PWA and prepare equivalent native adapters.

### Operation policy
- Offline-capable: compose/edit orders and addresses as local drafts, read previously synced active-order summary, instructions, address, customer contact and last-known status. Label all cached statuses with last-sync time. Persist locally using IndexedDB on web (and SQLite or an equivalent durable native store later). Never store credentials or unnecessary sensitive information in plain local storage.
- Server-confirmed only: create/publish order, driver first-accept, price approval, admin override, payment/commission ledger changes, wallet top-ups, driver assignment and final delivery settlement. Never show these as completed until authoritative server acknowledgement. Do not queue stale first-accept offers for later acceptance.
- For create-order when response is lost, retain one stable client-generated operation ID and query its status before retry; enforce unique idempotency key in DB. Never duplicate orders. Draft may remain pending with explicit user status.
- Delivery proof offline: collect local proof/time and display 'Pending synchronization — not yet confirmed'; upon reconnect validate current order state, authorization and version, then commit atomically or show conflict for admin resolution. Never automatically claim cash settlement happened solely from local data.
- Use server-owned state transitions, optimistic concurrency/version checks, atomic first-accept transaction, unique ledger event constraints and auditable reversals. Financial operations must be idempotent.

### Network layer
- Centralize request client with timeouts, abort, capped exponential backoff with jitter only for safe/idempotent operations; honor Retry-After; never retry authorization/validation failures blindly. Handle offline, slow, timeout, captive portal and Supabase downtime distinctly.
- Cache-first or stale-while-revalidate for non-sensitive static data; stale-labeled cache for active order details. Use request deduplication, pagination, compact JSON responses, minimal columns, compressed assets, lazy routes, responsive compressed images and no heavy maps on initial load.
- Realtime reconnect with resubscription and server snapshot reconciliation; fallback to adaptive polling only while relevant screens are visible, pause in background, and avoid redundant subscriptions. Server timestamps determine offer expiry, not device clock.
- Browser online/offline event alone does not prove backend reachability. Use a lightweight authenticated health/read check when needed.
- Maps must degrade to textual addresses, landmarks, telephone and optional external navigation link. Never block ordering because map tiles fail. Allow manual pin correction and save address text.
- Provide explicit 'Offline', 'Weak connection', 'Sending', 'Awaiting server confirmation', 'Synced', 'Outdated' and 'Retry' states in Arabic; never silently drop input. Never imply order is dispatched until server confirms.
- Web PWA service worker may cache app shell/static assets but must not cache authenticated API responses indiscriminately. Web background sync/push are best effort, not guaranteed, especially when browser closed. Native background behaviors require separate platform validation.

### Reliability and performance acceptance gates
- Simulate 2G/slow 3G, 500–1500ms latency, 5–20% packet loss, intermittent 15–120s outages, backend timeouts, repeated taps, tab refresh, device clock skew and reconnect after order state changed.
- Customer can draft offline, refresh and recover it; no accidental submission. Duplicate submission with identical key produces exactly one order.
- Two drivers racing to accept results in exactly one winner; stale/offline driver sees rejection and refreshed state.
- Offline proof/settlement remains visibly pending and cannot double-credit or double-charge on reconnect.
- Admin override while driver offline reconciles to latest authorized price; old cached quote cannot be used for financial settlement.
- Last-known order details are readable offline with clear stale marker. Text fallback works without maps.
- Test PWA hard refresh with cached shell, no connectivity, and return online. Measure cold-start JS bytes, request payload sizes, p50/p95 key-action latency under throttling, retry rates, reconnect time and sync conflicts; record baselines and regressions in IMPLEMENTATION_STATUS.md.
- Provide configurable network profiles and a reproducible browser network-throttling test procedure, plus automated integration tests for idempotency, conflict handling and reconnect.

### Implementation sequencing
Build local persistence, explicit sync states, idempotent server commands and reconnect logic alongside core order workflows, not as a post-launch patch. Document platform-specific Web vs Android/iOS limitations. Do not claim full offline transactions or guaranteed notifications when disconnected.
