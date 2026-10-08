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

    const authHeader = req.headers.get("authorization") ?? "";
    const accessToken = authHeader.replace(/^Bearer\s+/i, "");
    const internalCall = accessToken === serviceRole;

    if (!internalCall) {
      const { data: callerData, error: callerError } = await admin.auth.getUser(accessToken);
      if (callerError || !callerData.user || callerData.user.id !== user_id) {
        return json({ error: "Unauthorized" }, 401);
      }
    }

    const [{ data: userResult, error: userError }, { data: approval, error: approvalError }] = await Promise.all([
      admin.auth.admin.getUserById(user_id),
      admin.from("account_approvals").select("status").eq("user_id", user_id).maybeSingle(),
    ]);

    const user = userResult?.user;
    if (userError || !user) return json({ error: "User not found" }, 404);
    if (approvalError || approval?.status !== "pending") return json({ error: "Account is not pending approval" }, 409);

    const [
      { data: profile, error: profileError },
      { data: interestRows, error: interestsError },
      { data: lookingRows, error: lookingError },
      { data: gradeRows, error: gradeError },
    ] = await Promise.all([
      admin.from("profiles").select("username, full_name, birth_date, school_level, school_name, bio, avatar_path, accepts_message_requests, gpa").eq("id", user_id).maybeSingle(),
      admin.from("profile_interests").select("interests(name)").eq("profile_id", user_id),
      admin.from("profile_looking_for").select("kind, other_text").eq("profile_id", user_id),
      admin.from("grade_verifications").select("id, status, image_path, created_at").eq("profile_id", user_id).order("created_at", { ascending: false }).limit(1),
    ]);

    const latestGrade = gradeRows?.[0] ?? null;
    const interestNames = (interestRows ?? [])
      .map((row: any) => row.interests?.name)
      .filter((name: unknown): name is string => typeof name === "string" && name.length > 0);
    const lookingFor = (lookingRows ?? []).map((row: any) => {
      if (row.kind === "friends") return "Amigos";
      if (row.kind === "projects") return "Proyectos";
      if (row.kind === "study_groups") return "Grupos de estudio";
      if (row.kind === "other") return `Otro: ${String(row.other_text ?? "")}`;
      return String(row.kind);
    });

    if (
      profileError || interestsError || lookingError || gradeError ||
      !profile || profile.gpa == null || !interestNames.length || !lookingFor.length || !latestGrade?.image_path
    ) {
      return json({ error: "Profile application is incomplete" }, 409);
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
    const recipient = config?.moderator_email as string | undefined;
    const from = config?.report_from_email as string | undefined;
    const appUrl = (config?.app_url as string | undefined) ?? "https://tertiansteak119.github.io/Nexus/";

    if (configError || !resendKey || !recipient || !from) {
      await admin.from("signup_notifications").update({
        status: "failed",
        last_error: "Email configuration is unavailable",
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

    const age = calculateAge(String(profile.birth_date));
    const attachments: Array<{ filename: string; content: string }> = [];

    const { data: evidenceBlob, error: evidenceError } = await admin.storage
      .from("boletas")
      .download(String(latestGrade.image_path));

    if (!evidenceError && evidenceBlob) {
      attachments.push({
        filename: `comprobante-${profile.username || "solicitud"}.${fileExtension(String(latestGrade.image_path))}`,
        content: arrayBufferToBase64(await evidenceBlob.arrayBuffer()),
      });
    }

    const email = String(user.email ?? "No disponible");
    const optionalBio = profile.bio ? `<p><strong>Bio:</strong> ${escapeHtml(String(profile.bio))}</p>` : "";
    const avatarNote = profile.avatar_path ? "Sí" : "No (opcional)";

    const payload: Record<string, unknown> = {
      from,
      to: [recipient],
      subject: `Nueva solicitud de acceso a Nexus · ${profile.full_name}`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#18344d">
          <h2>Nueva solicitud de acceso a Nexus</h2>
          <p>La solicitud ya está completa y lista para revisión.</p>
          <hr style="border:0;border-top:1px solid #dbe3e8;margin:20px 0">
          <p><strong>Nombre:</strong> ${escapeHtml(String(profile.full_name))}</p>
          <p><strong>Usuario:</strong> @${escapeHtml(String(profile.username))}</p>
          <p><strong>Correo:</strong> ${escapeHtml(email)}</p>
          <p><strong>Fecha de nacimiento:</strong> ${escapeHtml(String(profile.birth_date))} · ${age} años</p>
          <p><strong>Nivel escolar:</strong> ${escapeHtml(String(profile.school_level))}</p>
          <p><strong>Escuela:</strong> ${escapeHtml(String(profile.school_name))}</p>
          <p><strong>Promedio declarado:</strong> ${escapeHtml(String(profile.gpa))}</p>
          <p><strong>Intereses:</strong> ${escapeHtml(interestNames.join(", "))}</p>
          <p><strong>Busca:</strong> ${escapeHtml(lookingFor.join(", "))}</p>
          <p><strong>Recibe solicitudes de mensaje:</strong> ${profile.accepts_message_requests ? "Sí" : "No"}</p>
          <p><strong>Avatar:</strong> ${avatarNote}</p>
          ${optionalBio}
          <p><strong>Comprobante:</strong> ${attachments.length ? "Adjunto a este correo" : "Disponible en el panel de administración"}</p>
          <p style="margin-top:24px">
            <a href="${escapeHtml(approveUrl)}" style="display:inline-block;margin-right:10px;padding:12px 18px;border-radius:10px;background:#047857;color:white;text-decoration:none;font-weight:700">Aprobar cuenta</a>
            <a href="${escapeHtml(rejectUrl)}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#b91c1c;color:white;text-decoration:none;font-weight:700">Rechazar cuenta</a>
          </p>
          <p style="margin-top:24px"><a href="${escapeHtml(appUrl.replace(/\/$/, "") + "/control")}">Abrir panel de administración</a></p>
          <p style="font-size:12px;color:#6b7280">Aprobar la cuenta también valida el comprobante inicial de promedio. Los enlaces vencen en 7 días y requieren confirmación adicional.</p>
        </div>
      `,
    };

    if (attachments.length) payload.attachments = attachments;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
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

function calculateAge(birthDate: string) {
  const birth = new Date(`${birthDate}T00:00:00Z`);
  const today = new Date();
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday = today.getUTCMonth() < birth.getUTCMonth() ||
    (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function fileExtension(path: string) {
  const extension = path.split(".").pop()?.toLowerCase() ?? "jpg";
  return ["jpg", "jpeg", "png", "webp"].includes(extension) ? extension : "jpg";
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + chunk, bytes.length)));
  }
  return btoa(binary);
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
