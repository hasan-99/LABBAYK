import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-labbayk-push-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    ...corsHeaders,
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
  },
});
const tokenFingerprint = async (token: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest).slice(0, 5), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

async function readJsonLimited(request: Request, maxBytes: number): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("Request body is required");
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new RangeError("Request body is too large");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(body));
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY");
  if (!url || !publishableKey || !serviceRoleKey) return json({ error: "Push service is not configured" }, 503);

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: config, error: configError } = await admin.rpc("get_push_delivery_config");
  if (configError || !config) return json({ error: "Push service is not configured" }, 503);

  let payload: { action?: string; notification_id?: number };
  try {
    const body = await readJsonLimited(request, 2 * 1024);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid request" }, 400);
    payload = body as typeof payload;
  } catch (error) {
    if (error instanceof RangeError) return json({ error: "Request body is too large" }, 413);
    return json({ error: "Invalid request" }, 400);
  }

  if (payload.action === "get-public-key") {
    const authorization = request.headers.get("Authorization");
    if (!authorization) return json({ error: "Authentication required" }, 401);
    const userClient = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Authentication required" }, 401);
    if (!config.labbayk_vapid_public_key) return json({ error: "Web push is not configured" }, 503);
    return json({ publicKey: config.labbayk_vapid_public_key });
  }

  if (payload.action === "send-test") {
    const authorization = request.headers.get("Authorization");
    if (!authorization) {
      return json({ status: "error", stage: "request-validation" }, 400);
    }
    const userClient = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      console.log(JSON.stringify({ event: "push_test", stage: "auth-failed" }));
      return json({ status: "error", stage: "authentication" }, 401);
    }

    const userId = userData.user.id;
    console.log(JSON.stringify({ event: "push_test", stage: "authenticated", user_id: userId }));
    // Read through the authenticated user's client so the existing own-token RLS policy applies.
    // The service role intentionally has no SELECT grant on push_tokens.
    const { data: tokenRow, error: tokenError } = await userClient.from("push_tokens")
      .select("expo_push_token,platform")
      .eq("user_id", userId)
      .eq("platform", "android")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (tokenError || !tokenRow) {
      console.log(JSON.stringify({
        event: "push_test",
        stage: tokenError ? "token-query-failed" : "no-android-token",
        user_id: userId,
        lookup_error: tokenError?.code ?? null,
      }));
      // Return diagnostics as a normal response so the mobile client can render the failed
      // stage instead of treating it as an opaque transport error.
      return json({ status: "error", stage: "token-lookup" });
    }

    console.log(JSON.stringify({ event: "push_test", stage: "token-selected", user_id: userId, platform: tokenRow.platform, token_fingerprint: await tokenFingerprint(tokenRow.expo_push_token) }));
    console.log(JSON.stringify({ event: "push_test", stage: "expo-request-started", user_id: userId }));
    try {
      const expoResponse = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          to: tokenRow.expo_push_token,
          title: "اختبار الإشعارات",
          body: "وصلك هالإشعار، يعني الإشعارات شغّالة على موبايلك.",
          data: { testNotification: true },
          sound: "default",
          priority: "high",
        }),
      });
      const result = await expoResponse.json() as { data?: { status?: string; message?: string; details?: { error?: string } }; errors?: { message?: string }[] };
      const ticket = result.data;
      const detail = ticket?.details?.error ?? ticket?.message ?? result.errors?.[0]?.message;
      console.log(JSON.stringify({ event: "push_test", stage: "expo-response", user_id: userId, http_status: expoResponse.status, ticket_status: ticket?.status ?? "missing", detail: detail ?? null }));
      if (ticket?.status === "ok") return json({ status: "sent" });
      return json({ status: "rejected", detail, stage: "expo-rejected" });
    } catch (error) {
      console.error(JSON.stringify({ event: "push_test", stage: "expo-request-failed", user_id: userId, error: error instanceof Error ? error.message.slice(0, 200) : "unknown" }));
      return json({ status: "error", stage: "expo-request" }, 502);
    }
  }

  if (request.headers.get("x-labbayk-push-secret") !== config.labbayk_push_dispatch_secret) {
    return json({ error: "Not authorized" }, 401);
  }
  if (!Number.isInteger(payload.notification_id)) return json({ error: "Invalid notification" }, 400);
  if (!config.labbayk_vapid_public_key || !config.labbayk_vapid_private_key) return json({ error: "Web push is not configured" }, 503);

  const { data: notification, error: notificationError } = await admin.from("notifications")
    .select("id,recipient_id,title,body,event_type,order_id")
    .eq("id", payload.notification_id!).maybeSingle();
  if (notificationError || !notification) return json({ error: "Notification not found" }, 404);
  const { data: subscriptions, error: subscriptionsError } = await admin.from("web_push_subscriptions")
    .select("endpoint,p256dh,auth")
    .eq("user_id", notification.recipient_id);
  if (subscriptionsError) return json({ error: "Could not load subscriptions" }, 500);
  if (!subscriptions?.length) return json({ delivered: 0 });

  webpush.setVapidDetails("mailto:hasan.cy99@gmail.com", config.labbayk_vapid_public_key, config.labbayk_vapid_private_key);
  const message = JSON.stringify({
    title: notification.title,
    body: notification.body,
    orderId: notification.order_id,
    eventType: notification.event_type,
  });
  const outcomes = await Promise.allSettled(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, message, { TTL: 60 * 60, urgency: "high" });
      return true;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await admin.from("web_push_subscriptions").delete().eq("endpoint", subscription.endpoint);
      }
      return false;
    }
  }));
  const delivered = outcomes.filter((outcome) => outcome.status === "fulfilled" && outcome.value).length;
  return json({ delivered });
});
