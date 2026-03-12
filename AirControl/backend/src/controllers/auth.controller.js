import { query, queryOne } from "../db.js";
import { createPasswordRecord, verifyPassword } from "../services/password.service.js";
import { clearAuthCookie, setAuthCookie, signSession } from "../services/session.service.js";

export async function login(req, res, next) {
  try {
    const { username, password } = req.body ?? {};
    if (!username || !password) {
      return res.status(400).json({ error: "username and password are required" });
    }

    const user = await queryOne("select * from users where username = $1", [username]);
    if (!user || !verifyPassword(password, user)) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = signSession({ uid: user.id, username: user.username, role: user.role });
    setAuthCookie(res, token);
    return res.json({ ok: true, user: { id: user.id, username: user.username, role: user.role } });
  } catch (err) {
    return next(err);
  }
}

export async function logout(_req, res) {
  clearAuthCookie(res);
  return res.json({ ok: true });
}

export async function me(req, res) {
  return res.json({ user: { id: req.auth.uid, username: req.auth.username, role: req.auth.role } });
}

export async function registerFirstUser(req, res, next) {
  try {
    const existing = await queryOne("select id from users limit 1");
    if (existing) {
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
    const rows = await query(
      "insert into users (username, salt, password_hash, role) values ($1, $2, $3, $4) returning id, username, role",
      [username, record.salt, record.passwordHash, "admin"]
    );

    const user = rows[0];
    const token = signSession({ uid: user.id, username: user.username, role: user.role });
    setAuthCookie(res, token);
    return res.status(201).json({ ok: true, user });
  } catch (err) {
    return next(err);
  }
}
