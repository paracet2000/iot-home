import { Router } from "express";
import {
  deleteDeviceRegistry,
  listDeviceRegistry,
  upsertDeviceRegistry
} from "../controllers/device-registry.controller.js";

const router = Router();

router.get("/", listDeviceRegistry);
router.post("/", upsertDeviceRegistry);
router.delete("/:deviceId", deleteDeviceRegistry);

export default router;
