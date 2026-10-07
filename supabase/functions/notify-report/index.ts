import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

type ReportRow = {
  id: string
  reporter_id: string
  reported_id: string
  message: string | null
  evidence_path: string | null
  involves_minor: boolean
  created_at: string
  report_categories: { name: string } | null
  reporter: { username: string } | null
  reported: { username: string } | null
}

const corsHeaders = {
  "content-type": "application/json",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "BACKEND_NOT_CONFIGURED" }, 503)
  }

  let payload: { report_id?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: "INVALID_JSON" }, 400)
  }

  if (!payload.report_id) return json({ error: "REPORT_ID_REQUIRED" }, 400)

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: configRows, error: configError } = await supabase.rpc("get_report_email_config")
  const config = Array.isArray(configRows) ? configRows[0] : configRows
  const resendApiKey = config?.resend_api_key as string | undefined
  const moderatorEmail = (config?.moderator_email as string | undefined) ?? "erickjohn96357@gmail.com"
  const fromEmail = (config?.report_from_email as string | undefined) ?? "Nexus <onboarding@resend.dev>"
  const appUrl = (config?.app_url as string | undefined) ?? "https://tertiansteak119.github.io/Nexus/"

  if (configError || !resendApiKey) {
    return json({ error: "EMAIL_NOT_CONFIGURED" }, 503)
  }

  const { data: claimed, error: claimError } = await supabase
    .from("report_notifications")
    .insert({ report_id: payload.report_id, status: "sending" })
    .select("report_id")
    .maybeSingle()

  if (claimError) {
    if (claimError.code === "23505") return json({ ok: true, duplicate: true })
    return json({ error: "CLAIM_FAILED", detail: claimError.message }, 500)
  }
  if (!claimed) return json({ ok: true, duplicate: true })

  const { data, error } = await supabase
    .from("reports")
    .select(`
      id, reporter_id, reported_id, message, evidence_path, involves_minor, created_at,
      report_categories(name),
      reporter:profiles!reports_reporter_id_fkey(username),
      reported:profiles!reports_reported_id_fkey(username)
    `)
    .eq("id", payload.report_id)
    .single()

  if (error || !data) {
    await supabase.from("report_notifications").delete().eq("report_id", payload.report_id)
    return json({ error: "REPORT_NOT_FOUND" }, 404)
  }

  const report = data as unknown as ReportRow
  const category = report.report_categories?.name ?? "Sin categoría"
  const reporterUsername = report.reporter?.username ?? "usuario"
  const reportedUsername = report.reported?.username ?? "usuario"
  const priorityPrefix = report.involves_minor ? "[PRIORITARIO] " : ""
  const subject = `${priorityPrefix}[Nexus] Reporte: ${category}`

  const text = [
    report.involves_minor ? "PRIORIDAD: este reporte involucra a una persona menor de edad." : null,
    `Reporta: @${reporterUsername} (${report.reporter_id})`,
    `Reportado: @${reportedUsername} (${report.reported_id})`,
    `Categoría: ${category}`,
    `Mensaje: ${report.message ?? "Sin mensaje"}`,
    `Fecha: ${report.created_at}`,
    `Panel: ${appUrl.replace(/\/$/, "")}/control`,
  ].filter(Boolean).join("\n\n")

  const emailPayload: Record<string, unknown> = {
    from: fromEmail,
    to: [moderatorEmail],
    subject,
    text,
  }

  if (report.evidence_path) {
    const { data: evidence, error: downloadError } = await supabase.storage
      .from("report-evidence")
      .download(report.evidence_path)

    if (!downloadError && evidence) {
      const bytes = new Uint8Array(await evidence.arrayBuffer())
      let binary = ""
      const chunk = 0x8000
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
      }
      const filename = report.evidence_path.split("/").pop() ?? "evidencia"
      emailPayload.attachments = [{ filename, content: btoa(binary) }]
    }
  }

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${resendApiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(emailPayload),
  })

  const resendBody = await resendResponse.json().catch(() => ({}))

  if (!resendResponse.ok) {
    await supabase.from("report_notifications").delete().eq("report_id", report.id)
    return json({ error: "RESEND_FAILED", detail: resendBody }, 502)
  }

  await supabase
    .from("report_notifications")
    .update({
      status: "sent",
      provider_message_id: typeof resendBody?.id === "string" ? resendBody.id : null,
      sent_at: new Date().toISOString(),
    })
    .eq("report_id", report.id)

  return json({ ok: true })
})
