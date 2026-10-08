import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const encoder = new TextEncoder()

function html(body: string, status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } })
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;")
}

function page(title: string, message: string, button?: { label: string; token: string; danger?: boolean }) {
  const buttonHtml = button ? `
    <form method="post" style="margin-top:24px">
      <input type="hidden" name="token" value="${escapeHtml(button.token)}">
      <button type="submit" style="border:0;border-radius:12px;padding:14px 22px;font-weight:700;font-size:16px;color:white;background:${button.danger ? "#b91c1c" : "#047857"};cursor:pointer">
        ${escapeHtml(button.label)}
      </button>
    </form>` : ""

  return `<!doctype html>
  <html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
  <body style="margin:0;background:#f7f5ef;color:#102f4a;font-family:Arial,sans-serif">
    <main style="min-height:100vh;display:grid;place-items:center;padding:24px">
      <section style="max-width:560px;background:white;border:1px solid #dbe3e8;border-radius:24px;padding:32px;text-align:center">
        <div style="font-size:14px;font-weight:700;letter-spacing:.18em;color:#e7654d">NEXUS · ADMINISTRACIÓN</div>
        <h1 style="font-size:32px;margin:18px 0 12px">${escapeHtml(title)}</h1>
        <p style="font-size:16px;line-height:1.65;color:#5e7080">${escapeHtml(message)}</p>
        ${buttonHtml}
      </section>
    </main>
  </body></html>`
}

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !serviceRole) return html(page("Error", "La configuración del servidor no está disponible."), 500)

  const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } })

  let token = ""
  if (req.method === "GET") {
    token = new URL(req.url).searchParams.get("token") ?? ""
  } else if (req.method === "POST") {
    const form = await req.formData()
    token = String(form.get("token") ?? "")
  } else {
    return html(page("Método no permitido", "Este enlace no admite esa operación."), 405)
  }

  if (token.length < 20) return html(page("Enlace inválido", "Este enlace de administración no es válido."), 400)

  const tokenHash = await sha256(token)
  const { data: tokenRow, error: tokenError } = await admin
    .from("account_approval_email_tokens")
    .select("user_id, action, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle()

  if (tokenError || !tokenRow) return html(page("Enlace inválido", "Este enlace no existe o ya no es válido."), 404)
  if (tokenRow.used_at) return html(page("Enlace ya utilizado", "Esta solicitud ya fue procesada."))
  if (new Date(tokenRow.expires_at).getTime() <= Date.now()) return html(page("Enlace vencido", "Este enlace de administración ya expiró."), 410)

  const { data: userResult } = await admin.auth.admin.getUserById(tokenRow.user_id)
  const user = userResult?.user
  const name = String(user?.user_metadata?.full_name ?? user?.email ?? "esta cuenta")
  const approving = tokenRow.action === "approve"

  if (req.method === "GET") {
    return html(page(
      approving ? "Confirmar aprobación" : "Confirmar rechazo",
      `Vas a ${approving ? "aprobar" : "rechazar"} la solicitud de acceso de ${name}. La acción se realizará únicamente al pulsar el botón.`,
      { label: approving ? "Sí, aprobar cuenta" : "Sí, rechazar solicitud", token, danger: !approving },
    ))
  }

  const { error: reviewError } = await admin.rpc("complete_account_approval", {
    target_user: tokenRow.user_id,
    approve: approving,
    reviewer: null,
    note: approving ? "Aprobada desde el correo administrativo." : "Rechazada desde el correo administrativo.",
  })

  if (reviewError) {
    if (String(reviewError.message).includes("ACCOUNT_REQUEST_NOT_PENDING")) {
      return html(page("Solicitud ya procesada", "La cuenta ya no se encuentra pendiente de aprobación."))
    }
    if (String(reviewError.message).includes("ACCOUNT_APPLICATION_INCOMPLETE")) {
      return html(page("Solicitud incompleta", "El perfil todavía no contiene todos los datos obligatorios."), 409)
    }
    return html(page("No se pudo completar", "Ocurrió un error al procesar la solicitud."), 500)
  }

  await admin
    .from("account_approval_email_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("user_id", tokenRow.user_id)
    .is("used_at", null)

  return html(page(
    approving ? "Cuenta aprobada" : "Solicitud rechazada",
    approving ? `${name} ya fue aprobado y su comprobante inicial quedó verificado.` : `La solicitud de ${name} fue rechazada.`,
  ))
})
