// Cloudflare Pages Function: POST /api/lead → emails the lead through Resend.
// Environment variables (Cloudflare → Workers & Pages → project → Settings → Variables and Secrets):
//   RESEND_API_KEY   (required, add as a Secret)
//   LEAD_TO_EMAIL    (optional, default medentalmediaproduction@gmail.com)
//   LEAD_FROM_EMAIL  (optional, default "MEDENTAL Leads <onboarding@resend.dev>")
const FIELDS = [
  ["name", "Name"], ["email", "Email"], ["clinic", "Clinic"], ["country", "Country"],
  ["specialty", "Specialty"], ["case_type", "Case type"], ["plan", "Interested in"],
  ["instagram", "Instagram"], ["message", "Message"], ["page", "Page"]
];
const esc = (v) => String(v ?? "").slice(0, 2000)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function buildLeadEmail(data, env) {
  if (!data || typeof data !== "object") return { status: 400, error: "Invalid request." };
  if (data._honey) return { status: 200, skip: true }; // bot filled the hidden field
  const name = String(data.name || "").trim();
  const email = String(data.email || "").trim();
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: 400, error: "Name and a valid email are required." };
  if (!env.RESEND_API_KEY) return { status: 500, error: "Email service is not configured." };

  const rows = FIELDS.filter(([k]) => data[k])
    .map(([k, label]) => `<tr><td style="padding:8px 14px;color:#667;font:13px Arial;border-bottom:1px solid #eee;white-space:nowrap">${label}</td><td style="padding:8px 14px;font:14px Arial;border-bottom:1px solid #eee">${esc(data[k]).replace(/\n/g, "<br>")}</td></tr>`)
    .join("");
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px">
    <h2 style="margin:0 0 6px;font-size:20px">New case enquiry</h2>
    <p style="margin:0 0 16px;color:#667;font-size:14px">Reply to this email to answer ${esc(name)} directly.</p>
    <table style="border-collapse:collapse;width:100%;border:1px solid #eee">${rows}</table></div>`;
  const text = FIELDS.filter(([k]) => data[k]).map(([k, label]) => `${label}: ${String(data[k]).slice(0, 2000)}`).join("\n");

  return {
    status: 200,
    payload: {
      from: env.LEAD_FROM_EMAIL || "MEDENTAL Leads <onboarding@resend.dev>",
      to: (env.LEAD_TO_EMAIL || "medentalmediaproduction@gmail.com").split(",").map((s) => s.trim()),
      reply_to: email,
      subject: `New case enquiry: ${name.slice(0, 80)} (${String(data.country || "").slice(0, 40)})`,
      html, text
    }
  };
}

async function sendViaResend(payload, apiKey) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export async function onRequestPost({ request, env }) {
  let data = null;
  try { data = await request.json(); } catch {}
  const built = buildLeadEmail(data, env);
  if (built.error) return json({ ok: false, error: built.error }, built.status);
  if (built.skip) return json({ ok: true });
  try {
    await sendViaResend(built.payload, env.RESEND_API_KEY);
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: "Could not send the email." }, 502);
  }
}
