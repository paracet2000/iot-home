import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./db.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, "..", "schema.sql");

async function main() {
  const sql = fs.readFileSync(schemaPath, "utf8");
  await pool.query(sql);
  console.log("Schema applied");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
