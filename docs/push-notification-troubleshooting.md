# Push notification incident notes

## Labbayk Android case (November 2026)

### User-visible symptoms

- Push token registration showed notifications as enabled.
- Tapping the in-app **Test notifications** button made the Android app go to a black screen or close.
- The notification could still arrive after the app was closed; observed delivery was about five seconds later.
- Normal background notifications were later confirmed to arrive.

### What changed

1. Added stage-by-stage diagnostics to separate device token registration, Supabase token lookup, Expo push acceptance, and device delivery.
2. The test push was delayed five seconds to give the user time to background the app. The observed crash remained, so the delay was not a fix.
3. Tried suppressing foreground display of test notifications. This still did not resolve the user-visible crash.
4. Removed the test button and its dedicated `send-test` Edge Function path, then restored normal immediate push dispatch. The user confirmed that a real notification arrived when the app was closed.

### Conclusion and limits

The evidence pointed to the interactive test flow/foreground app transition as the trigger for the black screen, rather than a general failure to send Android pushes: a notification was delivered after closing the app. The exact device-side crash cause was not conclusively identified from a native crash trace. Removing the test flow avoided the failing path; it should not be described as a proven fix for every possible Android notification crash.

The five-second delay was diagnostic only and was removed. It must not be added to real notification dispatch. Delivery can still take a few seconds while Expo/FCM delivers a push; that is separate from an intentional server-side delay.

## Reusable troubleshooting sequence

1. **Record app/build identity.** Capture Android model/OS, Play version code, Expo runtime version, EAS channel, and whether the app was foregrounded, backgrounded, or force-stopped.
2. **Verify registration.** Check Android notification permission, FCM/Expo token acquisition, and that the current account's token is stored server-side. Avoid printing full tokens; log a short hash only.
3. **Trace the server path.** Add correlated stage logs for notification creation, recipient/token lookup, provider request, provider ticket/error, and delivery receipt where available. Never log secrets or full push tokens.
4. **Separate send from display.** First test a real push while the app is backgrounded. Then test foreground handling independently. A provider accepting a push is not proof that Android displayed it.
5. **Inspect the foreground handler.** Check `expo-notifications` handler setup for supported presentation options and ensure it is installed once at app startup, not repeatedly by a screen effect.
6. **Capture native crash evidence.** If tapping a control black-screens or closes the app, collect Android crash/Logcat output and reproduce with the smallest action. Do not infer a root cause from a blank screen alone.
7. **Check Android setup.** Verify the installed build has the correct Firebase Android app configuration, FCM v1 service-account credentials in EAS, notification channel, package ID, and project ID.
8. **Avoid user-facing push test buttons in production.** Prefer an admin-only or controlled backend diagnostic with explicit result stages. Keep any test message path separate from order/business notifications.
9. **Ship according to change type.** JavaScript handler changes may use OTA only when the installed binary has compatible Expo Updates runtime/channel. Changes to native Firebase/notification configuration require a new native build and store distribution.

## Related commits

- `fde02bc` — temporary five-second delay during crash diagnosis.
- `420a9d9` — suppressed foreground presentation for test pushes.
- `01c24c7` — removed the test button and test-send endpoint; restored immediate push dispatch.
