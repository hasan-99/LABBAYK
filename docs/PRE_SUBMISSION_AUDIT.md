# LABBAYK Mobile Pre-Submission Audit

**Audit date:** 2026-11-16
**Scope:** `apps/mobile` (Expo SDK 58, React Native), source-controlled Supabase migrations/functions, EAS profiles and app config.
**Decision:** **Not ready for App Store or Google Play submission.** Confirmed rejection-risk gaps remain in privacy disclosures and account deletion. No store-console or physical-device access was available in this audit.

## Findings

| ID | Platform / area | Severity and review risk | Evidence and required action |
|---|---|---|---|
| A1 | iOS + Android — privacy policy, privacy/data declarations | **High — still a submission blocker** | Arabic Privacy Policy, Terms, Support and deletion request pages now exist as static Expo Router routes and are linked in-app. A public preview is available at `https://labbayk--2qni83xkdt.expo.app` (`/privacy`, `/terms`, `/support`, `/delete-account`). The draft discloses current known data and providers, but the legal developer identity, support mailbox confirmation, hosting region, exact retention schedule, support response target, and controller address are not verified. Confirm/finalize these before using the URLs in store metadata; then complete Apple App Privacy and Google Data Safety to match production settings. |
| A2 | iOS + Android — account deletion | **Critical — likely rejection until deletion is completed** | A visible in-app link and public no-login page now initiate a request by opening a prefilled email; the user must send it, and support processes requests manually. This does not delete an account automatically. A direct Supabase user delete is not safe: order history has restrictive user/address foreign keys and settlement/audit records retain user references; avatar/order files also need explicit storage cleanup. Decide the approved retention/anonymization rules, implement and test a verified transactional workflow, and declare the permanent public page in Play Console. |
| A3 | iOS + Android — release review access | **High — delayed/rejected review** | `eas.json` has build profiles but no reviewer-access notes or demo mode, and no demo credentials are part of the source. Prepare a least-privilege active reviewer account (or approved demo mode), seed reviewable order/driver data, and enter working steps/credentials in App Store Connect and Play Console. Do not put credentials in the binary or repository. |
| A4 | iOS + Android — terms, support, user reports | **Medium/high — manual review remains** | Terms and an email support route are now linked from authentication and both profile screens; order-specific dispute reporting already exists. The public support address is currently sourced from an existing VAPID `mailto` setting (`hasan.cy99@gmail.com`) and must be confirmed as the customer-support/privacy mailbox. No response SLA or general abuse/blocking process is confirmed for submitted order text/photos. |
| A5 | iOS + Android — store metadata and declarations | **High — delayed/rejected review** | No App Store Connect or Play Console metadata is in the repository. Store name/description/category, screenshots, content rating, target audience, Data Safety, App Privacy, support/privacy/deletion URLs, and review notes could not be verified. Screenshots must be captured from the current app, not mockups. |
| A6 | iOS + Android — privacy labels / SDK disclosures | **High — inaccurate disclosures can cause removal** | Source dependency review shows Supabase Auth/Data/Storage, Expo notifications, React Native local storage, image picker, and Expo UI modules; no analytics, ad, attribution, social-login, maps, or payment SDK was found in the app dependency manifest/source search. Push tokens and order data still leave the device (Supabase and Expo/APNs/FCM path); declare the exact collection/sharing purposes and retention after confirming provider settings. SDK transitive behavior and the final native binary privacy manifests still require a release-binary report. |
| A7 | Backend — deletion/retention | **High — incomplete user-rights fulfillment** | The production schema contains order and cash-settlement records with restrictive/non-null user references. Deleting an Auth user can fail when such records exist. Establish a policy-approved anonymization/retention model and implement it transactionally; test customer, driver, unsettled, disputed, and settled-account cases before enabling deletion. |
| A8 | Backend — auth security | **Medium — security signal** | Current Supabase security advisor reports only `auth_leaked_password_protection` disabled. Supabase reports this option requires a paid project tier. Enable it if/when project plan permits; do not claim it is enabled. Health advisor reports no lints. |
| A9 | iOS + Android — device/release testing | **High — unknown technical rejection risk** | Android and iOS JavaScript bundles exported successfully, but no signed IPA/AAB release build or physical iPhone/Android test was run. Startup, purchase/order navigation, push deep links, OS-version compatibility, photo selection, network failure, RTL layouts, and cold-start OTA behavior remain unverified on devices. Expo SDK 58 documents iOS 16.4+ as its minimum; confirm the intended supported range and test that floor plus current versions. |
| A10 | iOS + Android — policy/legal review | **Medium — manual review needed** | The app uses first-party email/password auth, so Apple’s third-party-login parity rule is not triggered by the inspected code. Main commerce is physical-goods delivery with cash collection; no digital goods, subscriptions, external digital unlock, IAP, Play Billing, or ad flow was found, so store billing SDKs are not indicated by the current feature set. Confirm this remains true in production. |
| A11 | Android — permissions | **Low after fix; verify release manifest** | Photo selection is used for order/profile images. The app does not use camera capture or microphone recording. Expo prebuild generated the Android manifest and it contains removal directives for camera, microphone, overlay, and legacy read/write storage; `allowBackup=false` is present. The final merged AAB manifest still needs inspection. The iOS photo purpose string is configured; generated iOS files could not be inspected on Windows. Notifications should remain optional and requested only from the visible opt-in flow. |
| A12 | Android — API target | **No known gap from configured SDK; release verification pending** | Expo SDK 58’s official version table lists target API 36. This meets the current Google requirement for new apps and updates after 2026-08-31. Confirm the generated release manifest reports target 36 before submission. |
| A13 | Android — signing/versioning | **Not verified — release blocker until evidenced** | EAS production profile exists, but this audit did not access EAS signing credentials or build an AAB. Verify the Play upload key, package ID `com.hasan99.labbayk`, version code/build number, 64-bit ABIs, Play App Signing, and release-only configuration in the actual AAB. An unrelated untracked `android/` directory exists at repository root and is not the Expo project at `apps/mobile`; do not use it for release builds. |
| A14 | iOS — entitlements/privacy manifest/signing | **Not verified — release blocker until evidenced** | No checked-in `ios/` project, `Info.plist`, entitlements, or archived IPA is present; EAS/CNG generates these at build time. Expo prebuild skipped iOS generation on Windows. Inspect the generated IPA for permission strings, privacy manifests/required-reason API entries, bundle ID `com.hasan99.labbayk`, signing/provisioning, and build number on macOS/EAS. |
| A15 | Web URLs / universal links | **High — production URLs still missing** | HTTPS EAS preview routes are live and returned the correct Arabic titles with no browser console errors. There is no permanent custom domain configured, and store URLs must not use the temporary preview deployment as the final long-term URL. Configure a production domain and test password reset, Universal Links and Android App Links association files before release. |
| A16 | Dependencies and licensing | **Low/medium — notices and binary review** | `pnpm audit --prod` found no known vulnerabilities. Tajawal is licensed `MIT AND OFL-1.1`; Material Symbols is `MIT AND Apache-2.0`. The required font license texts are now copied under `apps/mobile/assets/fonts/`. A complete transitive license/SBOM report and native SDK vendor privacy review were not produced; run these against the release dependency graph and include required notices in distributed app/about materials. |

## Data inventory observed in code/schema

| Data | Purpose | Where / recipient | Retention / deletion status |
|---|---|---|---|
| Email and password credential | Account sign-in, confirmation, recovery | Supabase Auth; password handled by Supabase Auth | Deletion is requested through support email; backend account deletion has not been implemented. |
| Display name and avatar | Identify customer/driver; avatar displayed in profile | Supabase `profiles`; private `profile-avatars` bucket | No published retention period; deletion request cleanup is manual/unimplemented. |
| Phone, city, neighborhood, address, building/landmark | Order delivery/contact | Supabase `addresses` and driver profile; address exposed to assigned fulfillment path | No published retention period; historical orders restrict simple deletion. |
| Driver age and vehicle | Driver eligibility/operations | Supabase `driver_profiles` | No published retention period or deletion flow. Driver UI requires age 18+, customer age is not enforced in inspected app flow. |
| Order text/category/budget, item photos, status, disputes and delivery proof | Order placement, fulfillment, support, accounting | Supabase order tables, private order-image storage, edge functions | Operational/financial data has restrictive references; exact retention and anonymization policy is missing. |
| Push token, platform and notification subscription keys | Deliver order notifications | Supabase token tables; Expo push service; APNs/FCM | Token unregister exists on sign-out; deletion request cleanup is manual until a backend flow is built. |
| Offline order draft/history/driver cache | Resume order work and offline UX | Device AsyncStorage; web IndexedDB | Sign-out cleanup exists for listed cache keys; no account deletion flow to guarantee a complete device cleanup. Android backup is now disabled in Expo config. |
| Theme preference | Persist light/dark preference | Device AsyncStorage | Non-sensitive; no deletion treatment documented. |
| Advertising ID, precise location, contacts, health, microphone, camera capture | None found in inspected source/config | No recipient identified | Not collected by the inspected feature code. Verify final merged manifests and SDKs. |

## Follow-up: public legal/support pages

- Added static pages at `/privacy`, `/terms`, `/support`, and `/delete-account`, plus navigation links from signed-out and signed-in profile screens. The deletion page is open without login and validates an email before opening a prefilled request message.
- Published a **preview deployment only** at `https://labbayk--2qni83xkdt.expo.app`. Route/title checks passed for all four pages; the browser reported no console errors. An empty deletion email was rejected with a clear validation message.
- The deletion path currently relies on the user sending an email and staff processing it manually. It is not an automated database deletion/anonymization workflow and should not be represented as one in store forms.
- The current contact email was inferred from the project's existing Expo Push VAPID contact address; it remains subject to owner confirmation. The page text explicitly notes that exact retention periods and hosting region are not yet finalized.

## Changes made in this audit

- `apps/mobile/app.json`: disabled Android backup; blocked overlay and legacy broad-storage permissions; configured Image Picker with a truthful iOS photo purpose and disabled unused camera/microphone permissions.
- `apps/mobile/src/app/_layout.tsx`: load only Tajawal weights actually used. Android and iOS exports dropped the unused 200/300 weights (about 109 KB combined font assets per platform).
- `apps/mobile/package.json`, `pnpm-lock.yaml`: removed unused `@expo-google-fonts/inter` dependency.
- Removed unused Expo starter screens/components/hooks/assets and `reset-project.js`, including its script entry, after checking for references. This removes the “Try editing” placeholder and Expo demo art without touching app routes.
- Added Tajawal OFL and Material Symbols Apache license texts under `apps/mobile/assets/fonts/`.
- Added `LegalPage.tsx` and static `/privacy`, `/terms`, `/support`, and `/delete-account` routes, linked from signed-out authentication and signed-in customer/driver profiles. The support contact currently uses the email already present in the project's VAPID contact setting; owner confirmation is still required.
- Published a preview website at `https://labbayk--2qni83xkdt.expo.app`; no production custom domain has been configured.

## Verification performed

- `pnpm audit --prod`: **passed**, no known vulnerabilities.
- Supabase production advisors: **health clean**; security has the single leaked-password-protection warning above.
- `apps/mobile` TypeScript check (`tsc --noEmit`): **passed**.
- Direct ESLint on `apps/mobile/src`: **0 errors, 9 warnings** (React state-in-effect lint warnings; see output, not proven crashes).
- Expo config resolved; output confirms SDK 58, bundle/package IDs, app scheme, privacy strings, and Android backup/permission settings.
- Expo JS export: **Android passed** (3.9 MB JS bundle); **iOS passed** (3.5 MB JS bundle). These are Metro exports, not signed native release builds.
- After adding legal/support routes: mobile TypeScript **passed**, ESLint `--quiet` **passed with no errors**, and static web export **passed** with all four public routes generated.
- Playwright route checks on the HTTPS EAS preview: all four pages returned their Arabic titles; no browser console errors. The public deletion page opens without login and rejects an empty/invalid email before launching a prefilled email request.
- Expo prebuild generated Android project files; the generated manifest shows camera/microphone/overlay/storage permissions removed, backup disabled, and the intended Android application ID. Expo skipped iOS prebuild because this host is Windows.
- **Workspace note:** `apps/mobile/android/` was already present but ignored by Git. `expo prebuild --no-install` cleared and regenerated it from `apps/mobile/app.json`. Any prior local-only native edits in that ignored directory may have been overwritten; no backup of its former contents was available. Tracked/source-level changes are listed above.
- Live Supabase project responded and currently has active `admin-manage-user` and `push-notification` functions. This does not prove reviewer workflows or deletion work.
- No physical devices, App Store Connect, or Play Console were available. No final IPA/AAB, TestFlight, Play internal test, or production website URL was verified.

## Required manual work before submission

1. Confirm the developer’s legal name, support/privacy contact, public domain, data retention periods, lawful accounting retention, and subprocessors/hosting region.
2. Implement and test backend account deletion/anonymization plus storage cleanup; address restrictive order/settlement references and explain any legally retained records. The current public page sends an email request only.
3. Publish the finalized Privacy Policy, Terms, Support, and deletion pages on the permanent HTTPS domain; link them in both store listings. Verify each URL from a signed-out mobile browser.
4. Complete Apple App Privacy and Google Play Data Safety/Deletion declarations from production SDK and backend behavior. Update store content rating, target audience, screenshots, descriptions, support contacts, and age declarations.
5. Create reviewer access/demo mode, keep the backend and sample workflows available, and enter steps/credentials in review notes.
6. Run EAS production builds; inspect the iOS IPA privacy manifest, Info.plist and entitlements, and Android AAB merged manifest/API/ABI/signing. Upload to TestFlight and Play internal testing.
7. Exercise sign-up, sign-in, email confirmation, password reset, profile/photo picker, order/customer/driver flows, notifications/deep links, offline states, account deletion, and Arabic RTL on physical devices at the supported OS floor and current releases.
8. Produce a transitive dependency SBOM/license report, review vendor data practices/privacy manifests, and include required notices.

## Official policy references checked

- [Apple App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) — completeness, review access, privacy policy, account deletion, login and user data.
- [Apple privacy manifests](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files) and [required-reason APIs](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api).
- [Google Play Developer Program Policies](https://support.google.com/googleplay/android-developer/answer/18265346) and [account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111).
- [Google Play target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878).
- [Expo SDK 58 version support](https://docs.expo.dev/versions/v58.0.0/) and [Expo Image Picker SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/imagepicker/).
