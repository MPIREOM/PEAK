// Validates the app password supplied at the login screen.
import { checkAuth } from "../../lib/auth";

export default function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = checkAuth(req);
  return res.status(auth.ok ? 200 : auth.status).json(auth.ok ? { ok: true } : { error: auth.error });
}
