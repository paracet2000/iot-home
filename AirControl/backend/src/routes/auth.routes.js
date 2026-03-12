import { Router } from "express";
import { login, logout, me, registerFirstUser } from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/login", login);
router.post("/logout", logout);
router.get("/me", requireAuth, me);
router.post("/register-first", registerFirstUser);

export default router;
