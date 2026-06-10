// pages/api/whatsapp.js
// Server-side WhatsApp Business API call — token never exposed to browser.
// The template has a DOCUMENT header, so we upload the report PDF to WhatsApp
// media once, then send the template (header document + body params) to each owner.

import { checkAuth } from "../../lib/auth";

export const config = {
  api: {
    // PDF arrives as base64 in the JSON body — allow room for it.
    bodyParser: { sizeLimit: "10mb" },
  },
};

const GRAPH = "https://graph.facebook.com/v18.0";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = checkAuth(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const { variables, pdfBase64, filename } = req.body;
  if (!variables || !Array.isArray(variables)) {
    return res.status(400).json({ error: "No template variables provided" });
  }
  if (!pdfBase64) {
    return res.status(400).json({ error: "No PDF document provided (template requires a document header)" });
  }

  const token      = process.env.META_WHATSAPP_TOKEN;
  const phoneNumId = process.env.META_PHONE_NUMBER_ID;
  const template   = process.env.WHATSAPP_TEMPLATE_NAME || "the_peak_monthly_report";
  const numbers    = (process.env.OWNER_NUMBERS || "").split(",").map((n) => n.trim()).filter(Boolean);
  const docName    = filename || "The Peak - Monthly Report.pdf";

  if (!token || !phoneNumId) {
    return res.status(500).json({ error: "WhatsApp credentials not configured in environment variables" });
  }

  // 1) Upload the PDF to WhatsApp media — returns a reusable media id for this phone number.
  let mediaId;
  try {
    const buffer = Buffer.from(pdfBase64, "base64");
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("file", new Blob([buffer], { type: "application/pdf" }), docName);

    const up = await fetch(`${GRAPH}/${phoneNumId}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const upData = await up.json();
    if (!upData.id) {
      const e = upData.error || {};
      return res.status(502).json({
        error: `Media upload failed: [${e.code ?? "?"}] ${e.error_data?.details || e.message || JSON.stringify(upData)}`,
      });
    }
    mediaId = upData.id;
  } catch (err) {
    return res.status(500).json({ error: "Media upload error: " + err.message });
  }

  // 2) Send the template (document header + body params) to each owner.
  const bodyParams = variables.map((v) => ({
    type: "text",
    // Meta rejects body params containing newlines, tabs, or 4+ consecutive
    // spaces with error #132012, so collapse all whitespace to single spaces.
    text: String(v).replace(/\s+/g, " ").trim() || "-",
  }));

  const results = [];
  for (const number of numbers) {
    try {
      const response = await fetch(`${GRAPH}/${phoneNumId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: number.replace(/\s+/g, "").replace("+", ""),
          type: "template",
          template: {
            name: template,
            language: { code: "en" },
            components: [
              {
                type: "header",
                parameters: [{ type: "document", document: { id: mediaId, filename: docName } }],
              },
              { type: "body", parameters: bodyParams },
            ],
          },
        }),
      });

      const data = await response.json();
      if (data.messages || data.contacts) {
        results.push({ number, status: "sent", id: data.messages?.[0]?.id });
      } else {
        const e = data.error || {};
        // Meta puts the precise reason (e.g. which parameter/format) in error_data.details
        const detail = e.error_data?.details || e.message || "Unknown error";
        console.error("WhatsApp send failed", number, JSON.stringify(e));
        results.push({ number, status: "failed", error: `[${e.code ?? "?"}] ${detail}` });
      }
    } catch (err) {
      results.push({ number, status: "failed", error: err.message });
    }
  }

  const allSent = results.every((r) => r.status === "sent");
  return res.status(allSent ? 200 : 207).json({ results });
}
