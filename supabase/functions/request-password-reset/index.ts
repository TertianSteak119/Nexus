import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const encoder = new TextEncoder();
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: true });

  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();

    if (!email || !email.includes("@")) return json({ ok: true });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRole) return json({ ok: true });

    const admin = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const emailHash = await sha256(email);
    const { data: throttle } = await admin
      .from("password_reset_throttle")
      .select("last_requested_at")
      .eq("email_hash", emailHash)
      .maybeSingle();

    if (throttle?.last_requested_at) {
      const elapsed = Date.now() - new Date(throttle.last_requested_at).getTime();
      if (elapsed < 60_000) return json({ ok: true });
    }

    await admin.from("password_reset_throttle").upsert({
      email_hash: emailHash,
      last_requested_at: new Date().toISOString(),
    });

    const { data: generated, error: linkError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
    });

    // Always return success so the endpoint never reveals whether an account exists.
    if (linkError || !generated?.properties?.hashed_token) return json({ ok: true });

    const { data: configRows, error: configError } = await admin.rpc("get_report_email_config");
    const config = Array.isArray(configRows) ? configRows[0] : configRows;

    const resendKey = config?.resend_api_key as string | undefined;
    const from = config?.report_from_email as string | undefined;
    const appUrl = (config?.app_url as string | undefined) ?? "https://tertiansteak119.github.io/Nexus/";

    if (configError || !resendKey || !from) return json({ ok: true });

    const base = appUrl.endsWith("/") ? appUrl : `${appUrl}/`;
    const resetUrl = `${base}?mode=recovery&token_hash=${encodeURIComponent(generated.properties.hashed_token)}`;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: "Reset your password · Restablece tu contraseña",
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.65;color:#18344d;max-width:640px;margin:auto">
            <h2>Reset your password</h2>
            <p>We received a request to reset your password. Use the button below to choose a new one.</p>
            <p style="margin:24px 0">
              <a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#173a57;color:white;text-decoration:none;font-weight:700">
                Reset password
              </a>
            </p>
            <p>If you didn't request this, you can safely ignore this email.</p>

            <hr style="border:0;border-top:1px solid #dbe3e8;margin:32px 0">

            <h2>Restablece tu contraseña</h2>
            <p>Recibimos una solicitud para restablecer tu contraseña. Usa el botón de abajo para elegir una nueva.</p>
            <p style="margin:24px 0">
              <a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#173a57;color:white;text-decoration:none;font-weight:700">
                Restablecer contraseña
              </a>
            </p>
            <p>Si tú no solicitaste este cambio, puedes ignorar este correo.</p>

            <p style="margin-top:32px;font-size:12px;color:#6b7280">Este enlace es de un solo uso y expira según la política de seguridad de Nexus.</p>
          </div>
        `,
      }),
    });

    if (!resendResponse.ok) {
      return new Response(JSON.stringify({ error: "EMAIL_DELIVERY_UNAVAILABLE" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return json({ ok: true, delivery: "email" });
  } catch {
    return json({ ok: true });
  }
});

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
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
