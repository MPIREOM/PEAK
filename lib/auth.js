// Shared-secret gate for the API routes. The browser sends the password the
// user typed at the login screen in the `x-app-password` header; the server
// compares it against APP_PASSWORD. The secret is never shipped in the bundle.
//
// Secure-by-default: if APP_PASSWORD is unset the routes refuse to run, so an
// accidentally-public deployment cannot be used as a free proxy.
import crypto from "crypto";

// Constant-time comparison to avoid leaking the secret via timing.
function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function checkAuth(req) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    return { ok: false, status: 500, error: "Server not configured: APP_PASSWORD is missing." };
  }
  const got = req.headers["x-app-password"];
  if (!got || !safeEqual(got, expected)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}
