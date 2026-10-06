import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const RECIPIENT = "erickjohn96357@gmail.com";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { user_id } = await req.json();
    if (!user_id || typeof user_id !== "string") return json({ error: "user_id required" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRole) return json({ error: "Server configuration missing" }, 500);

    const admin = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userResult, error: userError } = await admin.auth.admin.getUserById(user_id);
    const user = userResult?.user;
    if (userError || !user) return json({ error: "User not found" }, 404);

    const createdAt = new Date(user.created_at).getTime();
    if (!Number.isFinite(createdAt) || Date.now() - createdAt > 15 * 60 * 1000) {
      return json({ error: "Notification window expired" }, 403);
    }

    const { data: existing } = await admin
      .from("signup_notifications")
      .select("status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing?.status === "sent") return json({ ok: true, already_sent: true });

    await admin.from("signup_notifications").upsert({
      user_id: user.id,
      status: "pending",
      last_error: null,
    });

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      await admin.from("signup_notifications").update({
        status: "failed",
        last_error: "RESEND_API_KEY is not configured",
      }).eq("user_id", user.id);
      return json({ error: "Email provider is not configured" }, 503);
    }

    const fullName = String(user.user_metadata?.full_name ?? "No especificado");
    const email = String(user.email ?? "No disponible");
    const from = Deno.env.get("SIGNUP_FROM_EMAIL") ?? "Nexus <onboarding@resend.dev>";

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [RECIPIENT],
        subject: "Nueva solicitud de creación de cuenta en Nexus",
        html: `
          <h2>Nueva solicitud de creación de cuenta en Nexus</h2>
          <p><strong>Nombre:</strong> ${escapeHtml(fullName)}</p>
          <p><strong>Correo:</strong> ${escapeHtml(email)}</p>
          <p><strong>ID de usuario:</strong> ${escapeHtml(user.id)}</p>
          <p><strong>Fecha y hora de registro:</strong> ${escapeHtml(user.created_at)}</p>
          <p>Este aviso se genera únicamente al crear una cuenta nueva. La contraseña nunca se incluye.</p>
        `,
      }),
    });

    const resendBody = await resendResponse.text();
    if (!resendResponse.ok) {
      await admin.from("signup_notifications").update({
        status: "failed",
        last_error: resendBody.slice(0, 1000),
      }).eq("user_id", user.id);
      return json({ error: "Email send failed" }, 502);
    }

    await admin.from("signup_notifications").update({
      status: "sent",
      notified_at: new Date().toISOString(),
      last_error: null,
    }).eq("user_id", user.id);

    return json({ ok: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
