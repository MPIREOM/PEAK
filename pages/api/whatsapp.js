// pages/api/whatsapp.js
// Server-side WhatsApp Business API call — token never exposed to browser

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { variables } = req.body;
  if (!variables || !Array.isArray(variables)) {
    return res.status(400).json({ error: "No template variables provided" });
  }

  const token      = process.env.META_WHATSAPP_TOKEN;
  const phoneNumId = process.env.META_PHONE_NUMBER_ID;
  const template   = process.env.WHATSAPP_TEMPLATE_NAME || "the_peak_monthly_report";
  const numbers    = (process.env.OWNER_NUMBERS || "").split(",").map((n) => n.trim());

  if (!token || !phoneNumId) {
    return res.status(500).json({ error: "WhatsApp credentials not configured in environment variables" });
  }

  const results = [];
  for (const number of numbers) {
    try {
      const response = await fetch(
        `https://graph.facebook.com/v18.0/${phoneNumId}/messages`,
        {
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
                  type: "body",
                  parameters: variables.map((v) => ({ type: "text", text: String(v) })),
                },
              ],
            },
          }),
        }
      );

      const data = await response.json();
      if (data.messages || data.contacts) {
        results.push({ number, status: "sent", id: data.messages?.[0]?.id });
      } else {
        results.push({ number, status: "failed", error: data.error?.message || "Unknown error" });
      }
    } catch (err) {
      results.push({ number, status: "failed", error: err.message });
    }
  }

  const allSent = results.every((r) => r.status === "sent");
  return res.status(allSent ? 200 : 207).json({ results });
}
