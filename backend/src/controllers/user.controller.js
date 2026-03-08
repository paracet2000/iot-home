import { User } from "../models/user.model.js";
import { createPasswordRecord } from "../services/password.service.js";

function sanitizeUser(user) {
  return { id: user._id, username: user.username, role: user.role, createdAt: user.createdAt };
}

export async function listUsers(_req, res, next) {
  try {
    const users = await User.find().sort({ createdAt: 1 }).lean();
    return res.json({ users: users.map(sanitizeUser) });
  } catch (err) {
    return next(err);
  }
}

export async function createUser(req, res, next) {
  try {
    const { username, password, role } = req.body ?? {};
    if (!username || !password) {
      return res.status(400).json({ error: "username and password are required" });
    }
    if (String(password).length < 4) {
      return res.status(400).json({ error: "password must be at least 4 chars" });
    }

    const record = createPasswordRecord(password);
    const safeRole = role === "admin" ? "admin" : "user";
    const user = await User.create({ username, role: safeRole, ...record });
    return res.status(201).json({ ok: true, user: sanitizeUser(user) });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: "username already exists" });
    }
    return next(err);
  }
}

export async function deleteUser(req, res, next) {
  try {
    if (String(req.params.userId) === String(req.auth.uid)) {
      return res.status(400).json({ error: "Cannot delete current login user" });
    }
    const deleted = await User.findByIdAndDelete(req.params.userId);
    if (!deleted) {
      return res.status(404).json({ error: "User not found" });
    }
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}
