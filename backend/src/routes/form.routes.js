import { Router } from "express";
import { getFormBySlug, upsertFormBySlug } from "../controllers/form.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/:slug", getFormBySlug);
router.put("/:slug", requireAuth, requireRole("admin"), upsertFormBySlug);

export default router;
