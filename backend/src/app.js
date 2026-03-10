import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import healthRoutes from "./routes/health.routes.js";
import formRoutes from "./routes/form.routes.js";
import deviceRoutes from "./routes/device.routes.js";
import deviceRegistryRoutes from "./routes/device-registry.routes.js";
import scheduleRoutes from "./routes/schedule.routes.js";
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import { requireAuth, requireRole } from "./middleware/auth.middleware.js";
import { errorHandler } from "./middleware/error-handler.js";

export function createApp() {

  
  const app = express();
  const corsOrigin = process.env.CORS_ORIGIN || "*";
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const publicDir = path.join(__dirname, "..", "public");

  app.use(cors({ origin: corsOrigin === "*" ? true : corsOrigin }));
  app.use(express.json());

  app.get("/login", (_req, res) => {
    res.sendFile(path.join(publicDir, "login.html"));
  });

  app.get("/login.html", (_req, res) => {
    res.sendFile(path.join(publicDir, "login.html"));
  });

  app.get("/", requireAuth, (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });

  app.get("/admin", requireAuth, requireRole("admin"), (_req, res) => {
    res.sendFile(path.join(publicDir, "admin.html"));
  });

  app.get("/schedules", requireAuth, (_req, res) => {
    res.sendFile(path.join(publicDir, "schedule.html"));
  });

  app.get("/users", requireAuth, requireRole("admin"), (_req, res) => {
    res.sendFile(path.join(publicDir, "users.html"));
  });

  app.get("/index.html", requireAuth, (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });

  app.get("/admin.html", requireAuth, requireRole("admin"), (_req, res) => {
    res.sendFile(path.join(publicDir, "admin.html"));
  });

  app.get("/schedule.html", requireAuth, (_req, res) => {
    res.sendFile(path.join(publicDir, "schedule.html"));
  });

  app.get("/users.html", requireAuth, requireRole("admin"), (_req, res) => {
    res.sendFile(path.join(publicDir, "users.html"));
  });

  app.use(express.static(publicDir, { index: false }));

  app.use("/health", healthRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/forms", formRoutes);
  app.use("/api/devices", deviceRoutes);
  app.use("/api/device-registry", requireAuth, requireRole("admin"), deviceRegistryRoutes);
  app.use("/api/schedules", requireAuth, scheduleRoutes);
  app.use("/api/users", requireAuth, requireRole("admin"), userRoutes);

  app.use(errorHandler);
  return app;
}
