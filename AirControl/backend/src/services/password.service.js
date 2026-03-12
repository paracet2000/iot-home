import crypto from "node:crypto";

const ITERATIONS = 120000;
const KEY_LENGTH = 64;
const DIGEST = "sha512";

export function createPasswordRecord(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = hashPassword(password, salt);
  return { salt, passwordHash };
}

export function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString("hex");
}

export function verifyPassword(password, record) {
  if (!record?.salt || !record?.password_hash) return false;
  const hashed = hashPassword(password, record.salt);
  const a = Buffer.from(record.password_hash, "hex");
  const b = Buffer.from(hashed, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
