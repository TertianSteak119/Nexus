import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const encoder = new TextEncoder();

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const body = await req.json();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");

    if (!email || !password) return json({ error: "INVALID_CREDENTIALS" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "sb_publishable_lmuGS__TQFJu84dM0GQokw_OffHu2Yz";

    if (!supabaseUrl || !serviceRole) return json({ error: "SERVER_CONFIGURATION" }, 500);

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const admin = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const signIn = await authClient.auth.signInWithPassword({ email, password });

    let userId = signIn.data.user?.id ?? null;

    if (!userId) {
      if (signIn.error?.code !== "email_not_confirmed") {
        return json({ error: "INVALID_CREDENTIALS" }, 401);
      }

      const { data: usersPage, error: usersError } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

      if (usersError) return json({ error: "ACCOUNT_LOOKUP_FAILED" }, 500);

      const found = usersPage.users.find((item) => item.email?.toLowerCase() === email);
      userId = found?.id ?? null;
    }

    if (!userId) return json({ error: "INVALID_CREDENTIALS" }, 401);

    const { data: userResult, error: userError } = await admin.auth.admin.getUserById(userId);
    const user = userResult?.user;

    if (userError || !user) return json({ error: "ACCOUNT_LOOKUP_FAILED" }, 500);

    const { data: approval, error: approvalError } = await admin
      .from("account_approvals")
      .select("status")
      .eq("user_id", userId)
      .maybeSingle();

    if (approvalError || approval?.status !== "pending") {
      return json({ error: "ACCOUNT_NOT_PENDING" }, 409);
    }

    const rawToken = randomToken();
    const tokenHash = await sha256(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const nextMetadata = {
      ...(user.user_metadata ?? {}),
      application_token_hash: tokenHash,
      application_token_expires_at: expiresAt,
    };

    const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
      user_metadata: nextMetadata,
    });

    if (updateError) return json({ error: "APPLICATION_TOKEN_FAILED" }, 500);

    return json({
      ok: true,
      user_id: userId,
      application_token: rawToken,
      full_name: String(user.user_metadata?.full_name ?? ""),
      email: String(user.email ?? email),
      email_confirmed: Boolean(user.email_confirmed_at),
    });
  } catch {
    return json({ error: "UNEXPECTED_ERROR" }, 500);
  }
});

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
