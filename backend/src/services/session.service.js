import crypto from "node:crypto";

export const AUTH_COOKIE_NAME = "smarthome_session";

function getSecret() {
  return process.env.AUTH_SECRET || "change-this-in-production";
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function signSession(payload) {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7;
  const body = base64UrlEncode(JSON.stringify({ ...payload, exp }));
  const sig = crypto.createHmac("sha256", getSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySession(token) {
  if (!token || typeof token !== "string") return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const expected = crypto.createHmac("sha256", getSecret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(body));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (_e) {
    return null;
  }
}

export function parseCookies(req) {
  const header = req.headers.cookie || "";
  const output = {};
  for (const pair of header.split(";")) {
    const [rawKey, ...rest] = pair.trim().split("=");
    if (!rawKey) continue;
    output[rawKey] = decodeURIComponent(rest.join("=") || "");
  }
  return output;
}

export function setAuthCookie(res, token) {
  const parts = [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=604800"
  ];
  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }
  res.setHeader("Set-Cookie", parts.join("; "));
}

export function clearAuthCookie(res) {
  const parts = [
    `${AUTH_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0"
  ];
  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }
  res.setHeader("Set-Cookie", parts.join("; "));
}
