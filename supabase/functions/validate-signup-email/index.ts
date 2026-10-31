import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const body = await req.json();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const match = email.match(/^[^\s@]+@([^\s@]+)$/);

    if (!match) return json({ valid: false, reason: "INVALID_FORMAT" }, 400);

    const domain = match[1];
    const [mxExists, aExists] = await Promise.all([
      hasDnsRecord(domain, "MX"),
      hasDnsRecord(domain, "A"),
    ]);

    if (!mxExists && !aExists) {
      return json({ valid: false, reason: "DOMAIN_NOT_FOUND" }, 200);
    }

    return json({
      valid: true,
      domain_exists: true,
      mail_domain: mxExists,
    });
  } catch {
    return json({ valid: false, reason: "VALIDATION_UNAVAILABLE" }, 503);
  }
});

async function hasDnsRecord(domain: string, type: "MX" | "A") {
  const url = new URL("https://cloudflare-dns.com/dns-query");
  url.searchParams.set("name", domain);
  url.searchParams.set("type", type);

  const response = await fetch(url, {
    headers: { Accept: "application/dns-json" },
  });

  if (!response.ok) return false;

  const payload = await response.json() as {
    Status?: number;
    Answer?: Array<{ type?: number; data?: string }>;
  };

  if (payload.Status !== 0) return false;

  const expectedType = type === "MX" ? 15 : 1;
  return Array.isArray(payload.Answer)
    && payload.Answer.some((answer) => answer.type === expectedType && Boolean(answer.data));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
