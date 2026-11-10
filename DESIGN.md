# LABBAYK | لَبّيك — DESIGN SYSTEM & SCREEN SPECIFICATION
Version: 1.0 | Status: Approved brand palette; implementation specification | Locale: Arabic-first RTL
Tagline: «اطلب، والباقي علينا.»

## 0. Design mandate
Build an original, polished, fast delivery product for Damascus and Rif Dimashq. Three experiences: Customer (Expo Web/mobile), Driver (Expo Web/mobile), and Super Admin (responsive web dashboard). Consistent brand, different information density. Design must be functional, accessible, responsive, and fully integrated with real state. Do not reproduce the conceptual image board literally; it is inspiration, not a pixel-perfect source. Never invent real order numbers, driver locations, earnings, or ETA in live UI.

## 1. Approved brand foundation
- Brand: لَبّيك | LABBAYK; slogan: اطلب، والباقي علينا.
- Approved palette (do not change): Background `#0B1411`; Primary `#B7FF30`; Accent `#52D5A0`; White `#FFFFFF`.
- Derived neutral UI tokens (adjust for accessibility only): surface `#1D2B24`; surface-raised `#25382E`; border `#30443A`; muted `#A9B9B0`; overlay `rgba(0,0,0,.60)`.
- Semantic colors (not new brand colors): danger `#FF6B6B`; warning `#F6C76A`; info `#79B8FF`; success `#52D5A0`. Never convey state by color alone.
- Primary text on lime: `#0B1411`. Primary text on dark: `#FFFFFF`. Validate contrast WCAG AA; tune derived tokens as needed, preserve approved colors.
- Typography: Tajawal (Arabic), Inter (Latin/numerals), locally bundled or robust fallbacks. Arabic-first, correct diacritics in brand only. Use tabular numbers for finance, Arabic copy with readable numeric formatting, Syrian pounds (ل.س) as configurable currency.
- Spacing: 4px base; scale 4/8/12/16/20/24/32/40/48. Radii: 8, 12, 16, 24; pill 999. Touch targets >=44px; mobile buttons 48–56px. Iconography: Lucide or consistent compatible RN icon set; 20–24px normal.
- Tone: helpful conversational Syrian Arabic, concise and trustworthy. No exaggerated delivery guarantees. Examples: «شو بدك نجيبلك؟», «عم ندور على دليفري», «السعر بحاجة موافقتك».

## 2. Logo assets and brand usage
Create editable SVG logo variants: Arabic wordmark, bilingual horizontal, monochrome, mark-only app icon. Mark concept: location pin + delivery motion, simplified to read at 32px; avoid overly detailed scooter illustrations in small icon. Provide dark/light/reverse versions, clearspace equal to 0.5× mark height, minimum icon size 24px, and favicon/app-icon exports. Use exact brand text. Existing generated art is a conceptual reference, not a vector source; recreate original vector artwork. Avoid gradients in core icon; gradients allowed only in large promotional graphics. Never stretch or put lime text on white.

## 3. Design tokens and implementation
Provide `packages/design-tokens` with TypeScript token object and CSS custom properties for web, React Native-compatible token export. Include color, typography, spacing, radius, shadow, z-index, animation, breakpoints, and semantic role mappings. Dark theme default; optional accessible light theme only if implemented consistently. Shared component contracts and Storybook or a local UI showcase page for visual review.

## 4. Global UX principles
- Arabic RTL by default across navigation, back arrows, tables, forms, and maps controls; numeric input and phone numbers stay LTR where appropriate.
- Customer and Driver: mobile-first max content width ~480px on desktop preview, but responsive tablet layouts; fixed bottom navigation with safe-area support.
- Admin: sidebar on desktop, collapsible drawer on tablet/mobile; desktop data tables with mobile card fallback.
- All screens support loading skeleton, empty state, validation, offline/network error, retry, permission denied, and success states.
- Show clear timestamps, currency units, delivery fee, purchase budget, final cash due, and whether amounts are estimated or confirmed.
- Never silently alter accepted prices; display approval and audit trail for material changes.
- No fake interactive controls: every button, link, filter, and toggle must be wired to actual behavior or visibly disabled with explanation.
- Accessibility: semantic labels, keyboard navigation, focus rings, reduced-motion support, sufficient contrast, meaningful icon labels, screen-reader status announcements.

## 5. Customer app — navigation and screens
Tabs: الرئيسية | طلباتي | الإشعارات | حسابي. Active order banner always visible when applicable.

### C01 Splash / onboarding
Brand mark, slogan, concise 2–3 screen optional intro, continue; do not block repeat users.
### C02 Authentication
Phone number with Syrian country code default +963 (editable); supported OTP/provider configured in environment. Never fake OTP. Session restore, resend cooldown, errors, sign-out.
### C03 Location permission and address selection
Request foreground geolocation with explanation; manual pin and text entry always available. Map pin, governorate/city/neighborhood, street, landmark, building, floor, notes, phone; validate delivery zone. Save multiple addresses; primary address.
### C04 Home
Greeting, active delivery address, single prominent free-text request composer «شو بدك نجيبلك؟», photo attachment, optional quick category chips (خضرة، لحمة، أغراض، غيره) that only prefill the form, active order summary, service status.
### C05 Create order / request details
Free text (required), optional structured items with quantity/unit, optional photo, pickup mode: specified shop/map pin OR nearby unspecified shop; purchase budget type and max amount, preferred instructions, drop-off address, contact number. Restricted/unsupported items policy surfaced before submission. Autosave draft.
### C06 Pricing and checkout
If shop pinned: road-route distance and confirmed quote validity. If unspecified: clearly labeled estimate pending shop choice. Break down base fee, included km, additional km, zone surcharge, admin override/discount, delivery total; purchases estimate separated from delivery. Cash payment, risk/approval disclosures, consent to terms, confirm CTA. No misleading exact ETA.
### C07 Matching
Searching animation, order ID, elapsed wait, cancel (if allowed), no drivers/timeout fallback, live status updates; duplicate submission protection.
### C08 Active order and tracking
State timeline, driver identity/verified status, contact options (phone; in-app chat only if implemented), map when location available, pickup point, drop-off, purchase approval requests, cash due, issue report. Privacy-limited live location during active delivery only.
### C09 Price approval
Show old/new item cost and delivery fee, reason, budget delta, expiry, approve/reject; block purchase until approval when required. Clear audit of who proposed.
### C10 Delivery completion
Cash due confirmed, handover OTP (or supervised alternative), receipt summary, rate driver, report problem.
### C11 Orders list / details
Active/completed/cancelled filters, status, date, amounts, detail timeline, invoice/receipt view, issue support.
### C12 Profile / settings
Saved addresses, personal details, notifications, privacy, language future-ready, help, logout, account deletion request.

## 6. Driver app — navigation and screens
Tabs: الرئيسية | طلباتي | الرصيد | حسابي. Distinct driver header with Online/Offline status.

### D01 Invitation landing and signup
Signed single-use, expiring invite URL; phone verification; personal name, vehicle, service areas, optional required identity docs with privacy controls; application pending admin approval. Invalid/reused/expired invite states.
### D02 Driver status dashboard
Online toggle gated by approval, valid session, service zone and minimum commission credit. Current balance, today's completed orders and earned delivery fees, active order card. Explain ineligibility.
### D03 Incoming offer
Real-time offer card: pickup area, destination area, estimated/confirmed delivery fee, driver net after commission, expected purchase budget, distance, timer, accept/decline. No sensitive customer contact until accepted. Server-authoritative first acceptance wins.
### D04 Accepted order details
Items and notes, pickup selection if unspecified, contact customer, navigation launch, price proposal, budget/approval state. Prevent unauthorized purchase state transitions.
### D05 Shopping / purchase
Item checklist, record actual amount, optional receipt image, request approval if above authorized ceiling or any price changes needing approval; show clear «لا تشتري قبل الموافقة».
### D06 Delivering
Pickup complete, navigation, contact, active location sharing controls, cash to collect, confirm handoff OTP. Offline retry without duplicate settlement.
### D07 Wallet and earnings
Commission credit balance, transactions, charges, adjustments, earnings from delivery fees, date filters; clarify credit is internal commission ledger not transferable money.
### D08 History and profile
Orders, cancellations, issues, account approval, service zones, vehicle, documents, sign-out.

## 7. Super Admin — IA and screens
Sidebar: Overview, Live Orders, All Orders, Drivers, Customers, Pricing, Zones, Wallets & Settlements, Disputes, Reports, Notifications, Audit Log, Settings.

### A01 Overview
Real KPIs (today orders, active, fulfilled, cancelled, commission revenue, online drivers), period selector, trend chart, unresolved exceptions, quick actions; no fabricated stats.
### A02 Live dispatch
Realtime order board grouped by state, offer/accept timing, driver availability, manual assignment/reassignment with reason, cancellation/resend, view customer/driver contact; map if supported.
### A03 Order list
Search ID/phone, status/date/zone/driver filters, sorting, pagination, export with permissions.
### A04 Order detail (core admin workspace)
Split view: timeline, customer + driver, pickup/dropoff, items, images, route, budget, quotes, purchase actuals, cash due, commission, wallet ledger, disputes. Action bar: edit items/amount, edit delivery fee, discount, override commission, assign driver, pause/cancel/reopen with guards, issue adjustments. Every edit requires reason; show before/after and approval impact.
### A05 Pricing Engine
Global base fee, included km, per-km fee, min/max fee, optional zone surcharge, rounding policy, effective dates, quote expiration; preview calculator and versioned rules. Zone overrides and per-order override priority. Preview before publish; role-gated save.
### A06 Order-specific override dialog
Fields: purchase amount adjustment, delivery fee fixed override (including zero), admin-funded/customer discount, commission percentage/fixed override, reason, effective timing. Side-by-side original/current/proposed, payer impact, driver earnings, approval requirement, confirm. Prevent invalid negative balances and post-settlement silent rewrites.
### A07 Drivers and invites
Invite create/copy/revoke/expiry, applications pending, approve/suspend, zone permissions, eligibility, order stats, ledger view, notes, identity docs with restricted access.
### A08 Customers
Search, account detail, order history, support flags, suspension, saved addresses access only for authorized admin use.
### A09 Zones and map
Create/edit polygons or simpler configured service zones, active/inactive, pickup/drop-off eligibility, surcharges, min driver coverage; geocoding fallback and manual map pin.
### A10 Wallets and settlements
Driver internal commission credit, top-up on verified offline payment, adjustments, reconciliation, immutable ledger, negative-balance policy, transaction export. Two-step confirmation for sensitive edits.
### A11 Disputes / cancellations
Queue, evidence, cash/purchase exposure, resolution actions, reason and adjustment journal, status and ownership.
### A12 Reports and audit
Financial totals, driver activity, orders by zone, cancelled orders, gross delivery fees vs platform commissions vs driver share; filters/export. Audit: actor, timestamp, before/after, request ID, rationale.
### A13 Settings
App identity, contact/support, payment method cash only, policy texts, feature flags, notifications, authentication and admin access.

## 8. Shared UI component library
`AppShell`, `BrandLogo`, `PrimaryButton`, `SecondaryButton`, `DangerButton`, `TextField`, `CurrencyField`, `PhoneField`, `TextArea`, `LocationPicker`, `AddressCard`, `OrderCard`, `StatusBadge`, `Timeline`, `QuoteBreakdown`, `PriceApprovalCard`, `DriverOfferCard`, `WalletBalance`, `LedgerTable`, `ConfirmDialog`, `ReasonDialog`, `Toast`, `EmptyState`, `ErrorState`, `Skeleton`, `PhotoUploader`, `FilterBar`, `DataTable`, `ResponsiveSheet`, `BottomTabs`, `AdminSidebar`, `KpiCard`, `AuditTrail`. Document props, variants, keyboard behavior, and loading states.

## 9. Responsive breakpoints and motion
Small phone 320–375; phone 376–600; tablet 601–1023; desktop >=1024. On admin desktop use 240–280px sidebar and flexible main; on narrow viewport replace dense tables with stacked cards. Animations 120–220ms for transitions, subtle status pulse only while searching, reduced-motion support. No flashing UI.

## 10. Brand application assets
Produce app icon (1024px source), adaptive icon variants, favicon, splash, social avatar, driver bag and helmet logo mockups (optional marketing only), Open Graph image. All exportable, with editable SVG source for core logo. Keep assets organized in `assets/brand/` and usage instructions.

## 11. Visual QA acceptance
- Every screen above is reachable and visually coherent in Arabic RTL.
- Capture screenshots at 375px mobile and 1440px desktop for core flows.
- Contrast and tap targets pass checks; no clipping or horizontal overflow.
- All money values correctly formatted and tagged estimated/confirmed.
- Every UI action connected to actual API or deliberately disabled.
- Light on decorative neon: lime for primary actions and focus, not large text blocks.
- Test long Syrian addresses, long item lists, empty states, slow connection, large text, keyboard and screen readers.

---
## MANDATORY UX: Weak/Intermittent Internet in Syria
Design all Customer, Driver and Admin flows for slow, costly, unstable connectivity. Preserve Midnight Lime brand tokens; use semantic status labels/icons, not color alone.

### Reusable components
- `NetworkStatusBanner`: compact Arabic status for offline, weak network, reconnecting and restored; nonblocking except for online-only commands.
- `SyncStatus`: explicit local draft / sending / awaiting server confirmation / synced / conflict / failed, with timestamp and retry where safe.
- `CachedDataBadge`: 'آخر تحديث: ...' for last-known active order, balance, quote and driver availability. Never display stale values as live.
- `ResilientActionButton`: disable repeat submissions, preserve idempotency ID, show progress, support safe retry and reconciliation after timeout.
- `TextAddressFallback`: textual address, nearby landmark, contact action and navigation link when maps unavailable.
- `LowDataMode`: avoid autoplay, animations, large images and auto-loading maps; lazy-load nonessential content; use compressed thumbnails.

### Customer screens
- New order: auto-save text, photos metadata, destination and budget as recoverable draft; warn that upload/submission requires internet. If submission times out, show 'عم نتحقق إذا وصل الطلب' rather than success/failure guess.
- Matching: never show driver assigned before server acknowledgement. Reconcile status on reconnect.
- Tracking: last known status + last update time; don't fabricate moving courier positions or ETA when location stale.

### Driver screens
- New offers: display server expiry and reject expired offers; disable accepting when backend unreachable. No offline accept queue.
- Active order: keep shopping list, approved purchase limit, addresses, customer contact and latest confirmed price available offline with stale warning.
- Delivery: offline proof can be stored as pending; never display 'تم التسليم وتمت المحاسبة' before server confirmation. Offer manual admin resolution for conflicts.

### Admin screens
- Show connection state and data freshness in live orders, driver online status and finance. Price overrides and wallet/ledger edits require server confirmation; don't use optimistic financial success.
- Display sync conflicts, pending delivery confirmations, stale driver locations and failed dispatch notifications as actionable exceptions.

### Acceptance
All critical states must have designed loading, offline, timeout, retry, stale, conflict and success variants in Arabic RTL. On slow 3G, core actions remain understandable and user input persists; no endless spinner, duplicate order or silent failure. Web PWA background features are best effort, not guarantees.
