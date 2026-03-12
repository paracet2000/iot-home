import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import authRoutes from "./routes/auth.routes.js";
import deviceRoutes from "./routes/device.routes.js";
import { requireAuth } from "./middleware/auth.middleware.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.static(publicDir));

app.get("/login", (_req, res) => {
  res.sendFile(path.join(publicDir, "login.html"));
});

app.get("/login.html", (_req, res) => {
  res.sendFile(path.join(publicDir, "login.html"));
});

app.get("/", requireAuth, (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.use("/api/auth", authRoutes);
app.use("/api/devices", deviceRoutes);

app.use((err, _req, res, _next) => {
  const status = err?.status || 500;
  res.status(status).json({ error: err?.message || "Server error" });
});

export default app;
