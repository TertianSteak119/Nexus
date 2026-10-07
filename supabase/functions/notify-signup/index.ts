import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const encoder = new TextEncoder();

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

    const { data: configRows, error: configError } = await admin.rpc("get_report_email_config");
    const config = Array.isArray(configRows) ? configRows[0] : configRows;
    const resendKey = config?.resend_api_key as string | undefined;
    const recipient = (config?.moderator_email as string | undefined) ?? "erickjohn96357@gmail.com";
    const from = (config?.report_from_email as string | undefined) ?? "Nexus <onboarding@resend.dev>";
    const appUrl = (config?.app_url as string | undefined) ?? "https://tertiansteak119.github.io/Nexus/";

    if (configError || !resendKey) {
      await admin.from("signup_notifications").update({
        status: "failed",
        last_error: "Resend configuration is unavailable",
      }).eq("user_id", user.id);
      return json({ error: "Email provider is not configured" }, 503);
    }

    const approveToken = randomToken();
    const rejectToken = randomToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await admin
      .from("account_approval_email_tokens")
      .delete()
      .eq("user_id", user.id)
      .is("used_at", null);

    const { error: tokenError } = await admin.from("account_approval_email_tokens").insert([
      {
        user_id: user.id,
        action: "approve",
        token_hash: await sha256(approveToken),
        expires_at: expiresAt,
      },
      {
        user_id: user.id,
        action: "reject",
        token_hash: await sha256(rejectToken),
        expires_at: expiresAt,
      },
    ]);

    if (tokenError) {
      await admin.from("signup_notifications").update({
        status: "failed",
        last_error: tokenError.message.slice(0, 1000),
      }).eq("user_id", user.id);
      return json({ error: "Could not create approval links" }, 500);
    }

    const approvalBase = `${supabaseUrl}/functions/v1/account-approval`;
    const approveUrl = `${approvalBase}?token=${encodeURIComponent(approveToken)}`;
    const rejectUrl = `${approvalBase}?token=${encodeURIComponent(rejectToken)}`;

    const fullName = String(user.user_metadata?.full_name ?? "No especificado");
    const email = String(user.email ?? "No disponible");

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject: "Nueva solicitud de acceso a Nexus",
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#18344d">
            <h2>Nueva solicitud de acceso a Nexus</h2>
            <p><strong>Nombre:</strong> ${escapeHtml(fullName)}</p>
            <p><strong>Correo:</strong> ${escapeHtml(email)}</p>
            <p><strong>ID de usuario:</strong> ${escapeHtml(user.id)}</p>
            <p><strong>Fecha y hora de registro:</strong> ${escapeHtml(user.created_at)}</p>
            <p><strong>Estado:</strong> Pendiente de aprobación administrativa.</p>
            <p>Confirmar el correo del usuario no autoriza su acceso. Solo el administrador puede aprobar esta solicitud.</p>
            <p style="margin-top:24px">
              <a href="${escapeHtml(approveUrl)}" style="display:inline-block;margin-right:10px;padding:12px 18px;border-radius:10px;background:#047857;color:white;text-decoration:none;font-weight:700">Aprobar cuenta</a>
              <a href="${escapeHtml(rejectUrl)}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#b91c1c;color:white;text-decoration:none;font-weight:700">Rechazar cuenta</a>
            </p>
            <p style="margin-top:24px"><a href="${escapeHtml(appUrl.replace(/\/$/, "") + "/control")}">Abrir panel de administración</a></p>
            <p style="font-size:12px;color:#6b7280">Los enlaces vencen en 7 días y requieren una confirmación adicional antes de ejecutar la acción. La contraseña nunca se incluye.</p>
          </div>
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

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

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
