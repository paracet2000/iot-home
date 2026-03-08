import crypto from "node:crypto";

const ITERATIONS = 120000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";

export function createPasswordRecord(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = hashPassword(password, salt);
  return { salt, passwordHash };
}

export function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString("hex");
}

export function verifyPassword(password, record) {
  if (!record?.salt || !record?.passwordHash) return false;
  const hashed = hashPassword(password, record.salt);
  const a = Buffer.from(hashed, "hex");
  const b = Buffer.from(record.passwordHash, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
