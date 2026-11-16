import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
};

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

function configuredKey(value: string | undefined, legacyName: string) {
  if (value) {
    const keys = JSON.parse(value) as Record<string, string>;
    if (keys.default) return keys.default;
  }
  return Deno.env.get(legacyName);
}

async function removeOrderImages(admin: ReturnType<typeof createClient>, orderId: string) {
  const bucket = admin.storage.from("order-images");
  const { data: files, error: listError } = await bucket.list(orderId, { limit: 100 });
  if (listError) throw new Error("Storage listing failed");
  const paths = (files ?? [])
    .filter((file) => file.id && !file.name.includes("/") && file.name !== ".emptyFolderPlaceholder")
    .map((file) => `${orderId}/${file.name}`);
  if (!paths.length) return;
  const { error: removeError } = await bucket.remove(paths);
  if (removeError) throw new Error("Storage removal failed");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = configuredKey(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"), "SUPABASE_ANON_KEY");
  const secretKey = configuredKey(Deno.env.get("SUPABASE_SECRET_KEYS"), "SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !publishableKey || !secretKey) return json({ error: "Deletion service is not configured" }, 503);

  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = authorization.slice("Bearer ".length);
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Your session is no longer valid. Sign in again." }, 401);

  const { data: assets, error: assetsError } = await userClient.rpc("account_deletion_assets");
  if (assetsError) {
    const message = assetsError.message.toLowerCase();
    if (message.includes("active orders")) return json({ error: "أكمل الطلبات المفتوحة قبل حذف الحساب." }, 409);
    if (message.includes("open support disputes")) return json({ error: "تواصل مع الدعم لحل البلاغات المفتوحة قبل حذف الحساب." }, 409);
    if (message.includes("driver or administrator")) return json({ error: "لحذف حساب سائق أو إدارة، أرسل طلبًا للدعم حتى تُراجع الأرصدة والسجلات." }, 409);
    return json({ error: "تعذر التحقق من طلب الحذف. حاول مرة أخرى أو تواصل مع الدعم." }, 400);
  }

  const asset = Array.isArray(assets) ? assets[0] : assets;
  if (!asset) return json({ error: "تعذر العثور على بيانات الحساب. تواصل مع الدعم." }, 409);
  const orderIds = Array.isArray(asset.order_ids) ? asset.order_ids.filter((id: unknown): id is string => typeof id === "string") : [];
  const avatarPath = typeof asset.profile_avatar_path === "string" ? asset.profile_avatar_path : null;

  try {
    if (avatarPath) {
      const { error } = await admin.storage.from("profile-avatars").remove([avatarPath]);
      if (error) throw new Error("Could not remove profile image");
    }
    for (const orderId of orderIds) await removeOrderImages(admin, orderId);
  } catch {
    return json({ error: "تعذر حذف بعض الصور بأمان؛ لم يُحذف الحساب. أعد المحاولة أو تواصل مع الدعم." }, 503);
  }

  const { error: cleanupError } = await admin.rpc("complete_account_deletion", { p_user_id: authData.user.id });
  if (cleanupError) return json({ error: "تعذر إكمال حذف البيانات. لم يُغلق الحساب؛ أعد المحاولة أو تواصل مع الدعم." }, 503);

  const { error: deleteError } = await admin.auth.admin.deleteUser(authData.user.id);
  if (deleteError) return json({ error: "أزيلت بيانات الحساب، لكن تعذر إغلاق تسجيل الدخول. أعد المحاولة أو تواصل مع الدعم." }, 503);

  return json({ success: true });
});
