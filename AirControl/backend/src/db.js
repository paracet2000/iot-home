import pg from "pg";

function buildPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }
  const sslEnabled = String(process.env.DB_SSL || "true").toLowerCase() !== "false";
  return new pg.Pool({
    connectionString,
    ssl: sslEnabled ? { rejectUnauthorized: false } : false
  });
}

export const pool = buildPool();

export async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}
