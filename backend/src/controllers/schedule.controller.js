import cron from "node-cron";
import { Schedule } from "../models/schedule.model.js";
import { refreshSchedules } from "../services/scheduler.service.js";

const VALID_PINS = new Set([5, 4, 14, 12, 13]);

function buildRequestedBy(auth) {
  return {
    userId: auth?.uid || "",
    username: auth?.username || ""
  };
}

function normalizeSchedule(body) {
  const pinNumber = Number(body.pinNumber);
  if (!Number.isFinite(pinNumber) || !VALID_PINS.has(pinNumber)) {
    throw new Error("pinNumber must be one of 5,4,14,12,13");
  }
  const action = String(body.action || "").toLowerCase();
  if (action !== "open" && action !== "close") {
    throw new Error("action must be open or close");
  }
  const durationMinutes = body.durationMinutes == null ? 0 : Number(body.durationMinutes);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 0 || durationMinutes > 255) {
    throw new Error("durationMinutes must be integer 0..255");
  }
  if (!body.cron) {
    throw new Error("cron is required");
  }
  if (!cron.validate(String(body.cron))) {
    throw new Error("cron expression is invalid");
  }
  return {
    name: String(body.name || "").trim(),
    deviceId: String(body.deviceId || "").trim(),
    pinNumber,
    action,
    durationMinutes,
    cron: String(body.cron || "").trim(),
    timezone: String(body.timezone || "").trim(),
    enabled: body.enabled !== false
  };
}

export async function listSchedules(_req, res, next) {
  try {
    const schedules = await Schedule.find().sort({ createdAt: -1 }).lean();
    return res.json({ items: schedules });
  } catch (err) {
    return next(err);
  }
}

export async function getSchedule(req, res, next) {
  try {
    const schedule = await Schedule.findById(req.params.id).lean();
    if (!schedule) return res.status(404).json({ error: "Schedule not found" });
    return res.json(schedule);
  } catch (err) {
    return next(err);
  }
}

export async function createSchedule(req, res, next) {
  try {
    if (req.auth?.role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }
    const payload = normalizeSchedule(req.body || {});
    if (!payload.name || !payload.deviceId) {
      return res.status(400).json({ error: "name and deviceId are required" });
    }
    const actor = buildRequestedBy(req.auth);
    const schedule = await Schedule.create({
      ...payload,
      createdBy: actor,
      updatedBy: actor
    });
    await refreshSchedules();
    return res.status(201).json(schedule);
  } catch (err) {
    return next(err);
  }
}

export async function updateSchedule(req, res, next) {
  try {
    if (req.auth?.role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }
    const payload = normalizeSchedule(req.body || {});
    const actor = buildRequestedBy(req.auth);
    const schedule = await Schedule.findByIdAndUpdate(
      req.params.id,
      { $set: { ...payload, updatedBy: actor } },
      { new: true, runValidators: true }
    );
    if (!schedule) return res.status(404).json({ error: "Schedule not found" });
    await refreshSchedules();
    return res.json(schedule);
  } catch (err) {
    return next(err);
  }
}

export async function deleteSchedule(req, res, next) {
  try {
    if (req.auth?.role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }
    const schedule = await Schedule.findByIdAndDelete(req.params.id);
    if (!schedule) return res.status(404).json({ error: "Schedule not found" });
    await refreshSchedules();
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}
