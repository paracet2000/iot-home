import { Router } from "express";
import {
  enqueueCommand,
  getConfig,
  getHistory,
  getState,
  setConfig,
  updateState
} from "../controllers/device.controller.js";
import { requireAuth, requireAuthOrDevice, requireDeviceAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/:deviceCode/state", requireAuthOrDevice, getState);
router.post("/:deviceCode/state", requireDeviceAuth, updateState);

router.post("/:deviceCode/commands", requireAuth, enqueueCommand);
router.get("/:deviceCode/commands", requireAuth, getHistory);

router.get("/:deviceCode/config", requireAuth, getConfig);
router.patch("/:deviceCode/config", requireAuth, setConfig);

export default router;
