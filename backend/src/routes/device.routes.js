import { Router } from "express";
import {
  ackCommand,
  enqueueCommand,
  getDeviceState,
  getDeviceStateRaw,
  getNextCommand,
  markPinDurationExpired,
  upsertDeviceState
} from "../controllers/device.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/:deviceId/commands", requireAuth, enqueueCommand);
router.get("/:deviceId/commands/next", getNextCommand);
router.post("/:deviceId/commands/:commandId/ack", ackCommand);
router.post("/:deviceId/state", upsertDeviceState);
router.get("/:deviceId/state", getDeviceState);
router.get("/:deviceId/state/raw", getDeviceStateRaw);
router.post("/:deviceId/pins/:pinNumber/expire", markPinDurationExpired);

export default router;
