import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const encoder = new TextEncoder()
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

  if (!supabaseUrl || !serviceRole) {
    return json({ error: "SERVER_CONFIGURATION" }, 500)
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const appUrl = await resolveAppUrl(admin)

  if (req.method === "GET") {
    const token = new URL(req.url).searchParams.get("token") ?? ""

    if (token.length < 20) {
      return redirectToApp(appUrl, { error: "invalid" })
    }

    const tokenResult = await loadToken(admin, token)

    if (tokenResult.error === "invalid") return redirectToApp(appUrl, { error: "invalid" })
    if (tokenResult.error === "used") return redirectToApp(appUrl, { error: "used" })
    if (tokenResult.error === "expired") return redirectToApp(appUrl, { error: "expired" })

    const { data: userResult } = await admin.auth.admin.getUserById(tokenResult.row.user_id)
    const user = userResult?.user
    const name = String(user?.user_metadata?.full_name ?? user?.email ?? "esta cuenta")

    return redirectToApp(appUrl, {
      token,
      action: tokenResult.row.action,
      name,
    })
  }

  if (req.method !== "POST") {
    return json({ error: "METHOD_NOT_ALLOWED" }, 405)
  }

  const token = await readToken(req)
  if (token.length < 20) return json({ error: "INVALID_LINK" }, 400)

  const tokenResult = await loadToken(admin, token)

  if (tokenResult.error === "invalid") return json({ error: "INVALID_LINK" }, 404)
  if (tokenResult.error === "used") return json({ error: "ALREADY_PROCESSED" }, 409)
  if (tokenResult.error === "expired") return json({ error: "EXPIRED" }, 410)

  const approving = tokenResult.row.action === "approve"

  const { error: reviewError } = await admin.rpc("complete_account_approval", {
    target_user: tokenResult.row.user_id,
    approve: approving,
    reviewer: null,
    note: approving
      ? "Aprobada desde el correo administrativo."
      : "Rechazada desde el correo administrativo.",
  })

  if (reviewError) {
    const message = String(reviewError.message)
    if (message.includes("ACCOUNT_REQUEST_NOT_PENDING")) {
      return json({ error: "ALREADY_PROCESSED" }, 409)
    }
    if (message.includes("ACCOUNT_APPLICATION_INCOMPLETE")) {
      return json({ error: "APPLICATION_INCOMPLETE" }, 409)
    }
    return json({ error: "REVIEW_FAILED" }, 500)
  }

  if (approving) {
    const { error: confirmError } = await admin.auth.admin.updateUserById(tokenResult.row.user_id, {
      email_confirm: true,
    })

    if (confirmError) {
      return json({ error: "EMAIL_CONFIRM_FAILED" }, 500)
    }
  }

  await admin
    .from("account_approval_email_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("user_id", tokenResult.row.user_id)
    .is("used_at", null)

  const { data: userResult } = await admin.auth.admin.getUserById(tokenResult.row.user_id)
  const user = userResult?.user
  const name = String(user?.user_metadata?.full_name ?? user?.email ?? "esta cuenta")

  return json({
    ok: true,
    action: approving ? "approve" : "reject",
    name,
  })
})

async function resolveAppUrl(admin: ReturnType<typeof createClient>) {
  const { data } = await admin.rpc("get_report_email_config")
  const config = Array.isArray(data) ? data[0] : data
  return String(config?.app_url ?? "https://tertiansteak119.github.io/Nexus/")
}

async function loadToken(admin: ReturnType<typeof createClient>, token: string) {
  const tokenHash = await sha256(token)

  const { data: row, error } = await admin
    .from("account_approval_email_tokens")
    .select("user_id, action, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle()

  if (error || !row) return { error: "invalid" as const }
  if (row.used_at) return { error: "used" as const }
  if (new Date(row.expires_at).getTime() <= Date.now()) return { error: "expired" as const }

  return { error: null, row }
}

async function readToken(req: Request) {
  const contentType = req.headers.get("content-type") ?? ""

  if (contentType.includes("application/json")) {
    const body = await req.json()
    return String(body?.token ?? "")
  }

  if (contentType.includes("form")) {
    const form = await req.formData()
    return String(form.get("token") ?? "")
  }

  return ""
}

function redirectToApp(
  appUrl: string,
  params: { token?: string; action?: string; name?: string; error?: string },
) {
  const target = new URL(appUrl)
  target.searchParams.set("mode", "admin-email-approval")

  if (params.token) target.searchParams.set("token", params.token)
  if (params.action) target.searchParams.set("action", params.action)
  if (params.name) target.searchParams.set("name", params.name)
  if (params.error) target.searchParams.set("error", params.error)

  return new Response(null, {
    status: 302,
    headers: {
      Location: target.toString(),
      "Cache-Control": "no-store",
    },
  })
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value))
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  })
}
