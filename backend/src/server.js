import "dotenv/config";
import { connectDb } from "./db.js";
import { createApp } from "./app.js";
import { ensureDefaultUser } from "./services/user-bootstrap.service.js";

const port = Number(process.env.PORT || 8080);
const app = createApp();

async function start() {
  await connectDb(process.env.MONGODB_URI);
  await ensureDefaultUser();
  app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err.message);
  process.exit(1);
});
