import { Router } from "express";
import { createUser, deleteUser, listUsers } from "../controllers/user.controller.js";

const router = Router();

router.get("/", listUsers);
router.post("/", createUser);
router.delete("/:userId", deleteUser);

export default router;
