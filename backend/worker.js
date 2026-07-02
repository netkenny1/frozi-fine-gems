/* FROZI FINE GEMS — inquiry API. A single Cloudflare Worker.
 *
 * The site runs today on GitHub Pages with a mail-composition fallback;
 * this worker is the production path. Deploy it (see README.md), then set
 * API_BASE in js/store.js to the worker URL — that one constant flips the
 * whole site from mailto to a real backend.
 *
 * POST /api/inquiries
 *   { type: "order" | "appointment", email, name, ... }
 *   → stored in the INQUIRIES KV namespace, optionally forwarded by email.
 */

const MAX_BODY = 10_000; // bytes — an invoice request is a few hundred

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

export default {
  async fetch(request, env) {
    const allowed = (env.ALLOWED_ORIGINS || "https://netkenny1.github.io")
      .split(",")
      .map((s) => s.trim());
    const origin = request.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/api/inquiries") {
      return json({ error: "Not found" }, 404, cors);
    }
    if (Number(request.headers.get("Content-Length")) > MAX_BODY) {
      return json({ error: "Too large" }, 413, cors);
    }

    let data;
    try {
      data = await request.json();
    } catch {
      return json({ error: "Body must be JSON" }, 400, cors);
    }

    // Honeypot: bots fill the hidden "website" field; tell them it worked.
    if (data.website) return json({ ok: true }, 200, cors);

    if (!["order", "appointment"].includes(data.type)) {
      return json({ error: "Unknown inquiry type" }, 422, cors);
    }
    if (!data.name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email || "")) {
      return json({ error: "A name and a valid email are required" }, 422, cors);
    }

    const receivedAt = new Date().toISOString();
    const key = `${data.type}:${receivedAt}:${crypto.randomUUID().slice(0, 8)}`;
    await env.INQUIRIES.put(key, JSON.stringify({ ...data, receivedAt }));

    // Optional email forward — set RESEND_API_KEY and NOTIFY_EMAIL to enable.
    if (env.RESEND_API_KEY && env.NOTIFY_EMAIL) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: env.FROM_EMAIL || "ledger@frozifinegems.com",
          to: env.NOTIFY_EMAIL,
          reply_to: data.email,
          subject: data.subject || `New ${data.type} — Frozi Fine Gems`,
          text: data.body || JSON.stringify(data, null, 2),
        }),
      }).catch(() => {}); // the KV record is the source of truth
    }

    return json({ ok: true, reference: data.reference || key }, 200, cors);
  },
};
