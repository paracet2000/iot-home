import cron from "node-cron";
import { Device } from "../models/device.model.js";
import { Schedule } from "../models/schedule.model.js";

const PIN_TO_BIT = {
  5: 0, // D1
  4: 1, // D2
  14: 2, // D5
  12: 3, // D6
  13: 4 // D7
};

const PIN_TO_DURATION_BYTE = {
  5: "byte1", // D1
  4: "byte2", // D2
  14: "byte3", // D5
  12: "byte4", // D6
  13: "byte5" // D7
};

const tasks = new Map();

function buildDurationBytes(current) {
  return {
    byte1: Number(current?.byte1 || 0),
    byte2: Number(current?.byte2 || 0),
    byte3: Number(current?.byte3 || 0),
    byte4: Number(current?.byte4 || 0),
    byte5: Number(current?.byte5 || 0)
  };
}

function applyPinCommand(currentState, pinNumber, action) {
  const bitIndex = PIN_TO_BIT[Number(pinNumber)];
  if (bitIndex == null) {
    throw new Error("Unsupported pin number. Allowed pins: 5,4,14,12,13");
  }
  const bitMask = 1 << bitIndex;
  if (action === "open") {
    return currentState | bitMask;
  }
  if (action === "close") {
    return currentState & ~bitMask;
  }
  throw new Error("Invalid action. Use open/close");
}

function applyDuration(currentBytes, pinNumber, action, durationMinutes) {
  const key = PIN_TO_DURATION_BYTE[Number(pinNumber)];
  if (!key) {
    throw new Error("Unsupported pin number. Allowed pins: 5,4,14,12,13");
  }
  const next = buildDurationBytes(currentBytes);
  next[key] = action === "open" ? durationMinutes : 0;
  return next;
}

function normalizeDurationMinutes(value) {
  if (value == null || value === "") return 0;
  const num = Number(value);
  if (!Number.isInteger(num) || num < 0 || num > 255) {
    throw new Error("durationMinutes must be integer 0..255");
  }
  return num;
}

function buildSystemActor() {
  return { userId: "system", username: "scheduler" };
}

async function executeSchedule(schedule) {
  const durationMinutes = normalizeDurationMinutes(schedule.durationMinutes);
  const existing = await Device.findOne({ deviceId: schedule.deviceId });
  const currentState = Number(existing?.pinState || 0);
  const nextState = applyPinCommand(currentState, schedule.pinNumber, schedule.action);
  const nextDurationBytes = applyDuration(
    existing?.durationBytes,
    schedule.pinNumber,
    schedule.action,
    durationMinutes
  );

  await Device.findOneAndUpdate(
    { deviceId: schedule.deviceId },
    {
      $setOnInsert: {
        deviceId: schedule.deviceId,
        createdBy: buildSystemActor(),
        createdAt: new Date()
      },
      $set: {
        pinState: nextState,
        durationBytes: nextDurationBytes,
        updatedBy: buildSystemActor(),
        lastUpdate: new Date()
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );

  await Schedule.findByIdAndUpdate(schedule._id, { $set: { lastRunAt: new Date() } });
}

function stopAll() {
  for (const task of tasks.values()) {
    task.stop();
  }
  tasks.clear();
}

function scheduleOne(schedule) {
  const timezone = schedule.timezone || process.env.TZ || "Asia/Bangkok";
  const task = cron.schedule(
    schedule.cron,
    () => {
      executeSchedule(schedule).catch((err) => {
        console.error("[scheduler] job failed", schedule._id, err.message);
      });
    },
    { timezone }
  );
  tasks.set(String(schedule._id), task);
}

export async function refreshSchedules() {
  stopAll();
  const schedules = await Schedule.find({ enabled: true }).lean();
  for (const schedule of schedules) {
    scheduleOne(schedule);
  }
}

export async function startScheduler() {
  await refreshSchedules();
}
