import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function defaultKey(value: string | undefined, legacyName: string) {
  if (value) {
    const keys = JSON.parse(value) as Record<string, string>;
    if (keys.default) return keys.default;
  }
  return Deno.env.get(legacyName);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = defaultKey(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"), "SUPABASE_ANON_KEY");
  const secretKey = defaultKey(Deno.env.get("SUPABASE_SECRET_KEYS"), "SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !publishableKey || !secretKey) return json({ error: "Server auth is not configured" }, 500);

  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser();
  const actor = authData.user;
  if (authError || !actor) return json({ error: "Invalid session" }, 401);

  const { data: adminRole, error: roleError } = await userClient
    .from("user_roles")
    .select("role")
    .eq("user_id", actor.id)
    .eq("role", "super_admin")
    .maybeSingle();
  if (roleError || !adminRole) return json({ error: "Administrator access required" }, 403);

  let payload: { user_id?: unknown; action?: unknown; reason?: unknown };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const userId = typeof payload.user_id === "string" ? payload.user_id : "";
  const action = payload.action === "suspend" || payload.action === "restore" ? payload.action : "";
  const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)
    || !action || reason.length < 5 || reason.length > 500) {
    return json({ error: "A valid account, action, and reason are required" }, 400);
  }
  if (userId === actor.id) return json({ error: "You cannot suspend your own account" }, 409);

  const { data: targetResult, error: targetError } = await adminClient.auth.admin.getUserById(userId);
  const target = targetResult.user;
  if (targetError || !target) return json({ error: "Account not found" }, 404);

  const { data: targetRoles, error: targetRoleError } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (targetRoleError) return json({ error: "Could not check account permissions" }, 500);
  if (targetRoles?.some((row) => row.role === "super_admin")) {
    return json({ error: "Administrator accounts cannot be suspended here" }, 409);
  }

  const previousBan = target.banned_until ?? null;
  const currentlySuspended = !!previousBan && new Date(previousBan).getTime() > Date.now();
  const shouldSuspend = action === "suspend";
  if (currentlySuspended === shouldSuspend) {
    return json({ success: true, account_suspended: currentlySuspended, audit_recorded: true, unchanged: true });
  }

  const { data: updateResult, error: updateError } = await adminClient.auth.admin.updateUserById(
    userId,
    { ban_duration: shouldSuspend ? "876000h" : "none" },
  );
  if (updateError || !updateResult.user) return json({ error: "Could not update account access" }, 502);

  const nextBan = updateResult.user.banned_until ?? null;
  const { error: auditError } = await adminClient.from("admin_audit_log").insert({
    actor_id: actor.id,
    action: shouldSuspend ? "suspend_auth_user" : "restore_auth_user",
    entity_type: "auth_user",
    entity_id: userId,
    reason,
    before_data: { banned_until: previousBan, account_suspended: currentlySuspended },
    after_data: { banned_until: nextBan, account_suspended: shouldSuspend },
  });

  return json({
    success: true,
    account_suspended: shouldSuspend,
    audit_recorded: !auditError,
  }, auditError ? 202 : 200);
});
