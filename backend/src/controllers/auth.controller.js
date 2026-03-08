import { User } from "../models/user.model.js";
import { createPasswordRecord, verifyPassword } from "../services/password.service.js";
import { clearAuthCookie, setAuthCookie, signSession } from "../services/session.service.js";

function sanitizeUser(user) {
  return { id: user._id, username: user.username, role: user.role };
}

export async function login(req, res, next) {
  try {
    const { username, password } = req.body ?? {};
    if (!username || !password) {
      return res.status(400).json({ error: "username and password are required" });
    }

    const user = await User.findOne({ username }).lean();
    if (!user || !verifyPassword(password, user)) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = signSession({ uid: String(user._id), username: user.username, role: user.role });
    setAuthCookie(res, token);
    return res.json({ ok: true, user: sanitizeUser(user) });
  } catch (err) {
    return next(err);
  }
}

export function logout(_req, res) {
  clearAuthCookie(res);
  return res.json({ ok: true });
}

export async function me(req, res) {
  return res.json({
    ok: true,
    user: { id: req.auth.uid, username: req.auth.username, role: req.auth.role }
  });
}

export async function registerFirstUser(req, res, next) {
  try {
    const count = await User.countDocuments();
    if (count > 0) {
      return res.status(403).json({ error: "First user already exists" });
    }

    const { username, password } = req.body ?? {};
    if (!username || !password) {
      return res.status(400).json({ error: "username and password are required" });
    }
    if (String(password).length < 4) {
      return res.status(400).json({ error: "password must be at least 4 chars" });
    }

    const record = createPasswordRecord(password);
    const user = await User.create({ username, role: "admin", ...record });
    const token = signSession({ uid: String(user._id), username: user.username, role: user.role });
    setAuthCookie(res, token);
    return res.status(201).json({ ok: true, user: sanitizeUser(user) });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: "username already exists" });
    }
    return next(err);
  }
}
