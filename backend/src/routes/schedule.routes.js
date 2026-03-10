import { Router } from "express";
import {
  createSchedule,
  deleteSchedule,
  getSchedule,
  listSchedules,
  updateSchedule
} from "../controllers/schedule.controller.js";

const router = Router();

router.get("/", listSchedules);
router.post("/", createSchedule);
router.get("/:id", getSchedule);
router.put("/:id", updateSchedule);
router.delete("/:id", deleteSchedule);

export default router;
