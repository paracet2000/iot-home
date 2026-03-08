import { AUTH_COOKIE_NAME, parseCookies, verifySession } from "../services/session.service.js";

function isApiRequest(req) {
  return req.path.startsWith("/api/");
}

export function requireAuth(req, res, next) {
  const cookies = parseCookies(req);
  const token = cookies[AUTH_COOKIE_NAME];
  const session = verifySession(token);

  if (!session) {
    if (isApiRequest(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    return res.redirect("/login");
  }

  req.auth = session;
  return next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      if (isApiRequest(req)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      return res.redirect("/");
    }
    return next();
  };
}
