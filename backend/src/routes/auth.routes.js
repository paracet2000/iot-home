import { Router } from "express";
import { login, logout, me, registerFirstUser } from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/login", login);
router.post("/logout", logout);
router.post("/register-first", registerFirstUser);
router.get("/me", requireAuth, me);

export default router;
