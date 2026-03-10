import { Device } from "../models/device.model.js";

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

function normalizeCommand(value) {
  const raw = String(value || "").toLowerCase();
  if (raw === "open" || raw === "on" || raw === "1" || raw === "true") return "open";
  if (raw === "close" || raw === "off" || raw === "0" || raw === "false") return "close";
  return null;
}

function applyPinCommand(currentState, pinNumber, command) {
  const bitIndex = PIN_TO_BIT[Number(pinNumber)];
  if (bitIndex == null) {
    throw new Error("Unsupported pin number. Allowed pins: 5,4,14,12,13");
  }

  const bitMask = 1 << bitIndex;
  if (command === "open") {
    return currentState | bitMask;
  }
  if (command === "close") {
    return currentState & ~bitMask;
  }
  throw new Error("Invalid command. Use open/close");
}

function normalizeDurationMinutes(value) {
  if (value == null || value === "") return 0;
  const num = Number(value);
  if (!Number.isInteger(num) || num < 0 || num > 255) {
    throw new Error("durationMinutes must be integer 0..255");
  }
  return num;
}

function buildDurationBytes(current) {
  return {
    byte1: Number(current?.byte1 || 0),
    byte2: Number(current?.byte2 || 0),
    byte3: Number(current?.byte3 || 0),
    byte4: Number(current?.byte4 || 0),
    byte5: Number(current?.byte5 || 0)
  };
}

function toRawStateBytes(device) {
  const duration = buildDurationBytes(device?.durationBytes);
  return Buffer.from([
    Number(device?.pinState || 0),
    duration.byte1,
    duration.byte2,
    duration.byte3,
    duration.byte4,
    duration.byte5
  ]);
}

function applyDuration(currentBytes, pinNumber, command, durationMinutes) {
  const key = PIN_TO_DURATION_BYTE[Number(pinNumber)];
  if (!key) {
    throw new Error("Unsupported pin number. Allowed pins: 5,4,14,12,13");
  }
  const next = buildDurationBytes(currentBytes);
  next[key] = command === "open" ? durationMinutes : 0;
  return next;
}

function clearPin(currentState, pinNumber) {
  const bitIndex = PIN_TO_BIT[Number(pinNumber)];
  if (bitIndex == null) {
    throw new Error("Unsupported pin number. Allowed pins: 5,4,14,12,13");
  }
  const bitMask = 1 << bitIndex;
  return currentState & ~bitMask;
}

function buildRequestedBy(auth) {
  return {
    userId: auth?.uid || "",
    username: auth?.username || ""
  };
}

export async function enqueueCommand(req, res, next) {
  try {
    const payload = req.body?.payload;
    const pinNumber = Number(payload?.pin?.number);
    const command = normalizeCommand(payload?.command);
    const durationMinutes = normalizeDurationMinutes(payload?.durationMinutes);

    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ error: "payload object is required" });
    }
    if (!Number.isFinite(pinNumber)) {
      return res.status(400).json({ error: "payload.pin.number is required" });
    }
    if (!command) {
      return res.status(400).json({ error: "payload.command must be open/close" });
    }

    const existing = await Device.findOne({ deviceId: req.params.deviceId });
    const currentState = Number(existing?.pinState || 0);
    const nextState = applyPinCommand(currentState, pinNumber, command);
    const nextDurationBytes = applyDuration(
      existing?.durationBytes,
      pinNumber,
      command,
      durationMinutes
    );

    const device = await Device.findOneAndUpdate(
      { deviceId: req.params.deviceId },
      {
        $setOnInsert: {
          deviceId: req.params.deviceId,
          createdBy: buildRequestedBy(req.auth),
          createdAt: new Date()
        },
        $set: {
          pinState: nextState,
          durationBytes: nextDurationBytes,
          updatedBy: buildRequestedBy(req.auth),
          lastUpdate: new Date()
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    ).lean();

    return res.status(201).json({
      ok: true,
      deviceId: device.deviceId,
      byte0: device.pinState,
      pinState: device.pinState,
      durationBytes: device.durationBytes,
      updatedBy: device.updatedBy,
      lastUpdate: device.lastUpdate
    });
  } catch (err) {
    return next(err);
  }
}

export async function getNextCommand(_req, res) {
  return res.json({ command: null, message: "queue mode disabled; using direct pinState updates" });
}

export async function ackCommand(_req, res) {
  return res.json({ ok: true, message: "ack ignored in pinState mode" });
}

export async function upsertDeviceState(req, res, next) {
  try {
    const incomingPinState = req.body?.pinState ?? req.body?.byte0;
    const parsedState = Number(incomingPinState);
    if (!Number.isInteger(parsedState) || parsedState < 0 || parsedState > 31) {
      return res.status(400).json({ error: "pinState/byte0 must be integer 0..31" });
    }

    const durationBytes = {
      byte1: normalizeDurationMinutes(req.body?.byte1 ?? req.body?.durationBytes?.byte1),
      byte2: normalizeDurationMinutes(req.body?.byte2 ?? req.body?.durationBytes?.byte2),
      byte3: normalizeDurationMinutes(req.body?.byte3 ?? req.body?.durationBytes?.byte3),
      byte4: normalizeDurationMinutes(req.body?.byte4 ?? req.body?.durationBytes?.byte4),
      byte5: normalizeDurationMinutes(req.body?.byte5 ?? req.body?.durationBytes?.byte5)
    };

    const device = await Device.findOneAndUpdate(
      { deviceId: req.params.deviceId },
      {
        $setOnInsert: {
          deviceId: req.params.deviceId,
          createdBy: buildRequestedBy(req.auth),
          createdAt: new Date()
        },
        $set: {
          pinState: parsedState,
          durationBytes,
          updatedBy: buildRequestedBy(req.auth),
          lastUpdate: new Date()
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );

    return res.json({
      ok: true,
      byte0: device.pinState,
      pinState: device.pinState,
      durationBytes: device.durationBytes
    });
  } catch (err) {
    return next(err);
  }
}

export async function getDeviceState(req, res, next) {
  try {
    const device = await Device.findOne({ deviceId: req.params.deviceId }).lean();
    if (!device) {
      return res.status(404).json({ error: "Device not found" });
    }

    return res.json({
      deviceId: device.deviceId,
      byte0: device.pinState,
      pinState: device.pinState,
      durationBytes: device.durationBytes || { byte1: 0, byte2: 0, byte3: 0, byte4: 0, byte5: 0 },
      createdBy: device.createdBy,
      createdAt: device.createdAt,
      updatedBy: device.updatedBy,
      lastUpdate: device.lastUpdate
    });
  } catch (err) {
    return next(err);
  }
}

export async function getDeviceStateRaw(req, res, next) {
  try {
    const device = await Device.findOne({ deviceId: req.params.deviceId }).lean();
    const raw = toRawStateBytes(device);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Length", String(raw.length));
    return res.status(200).send(raw);
  } catch (err) {
    return next(err);
  }
}

export async function markPinDurationExpired(req, res, next) {
  try {
    const pinNumber = Number(req.params.pinNumber);
    if (!Number.isFinite(pinNumber) || PIN_TO_BIT[pinNumber] == null) {
      return res.status(400).json({ error: "pinNumber must be one of 5,4,14,12,13" });
    }

    const existing = await Device.findOne({ deviceId: req.params.deviceId });
    if (!existing) {
      return res.status(404).json({ error: "Device not found" });
    }

    const nextState = clearPin(Number(existing.pinState || 0), pinNumber);
    const key = PIN_TO_DURATION_BYTE[pinNumber];
    const nextDurationBytes = buildDurationBytes(existing.durationBytes);
    nextDurationBytes[key] = 0;

    const device = await Device.findOneAndUpdate(
      { deviceId: req.params.deviceId },
      {
        $set: {
          pinState: nextState,
          durationBytes: nextDurationBytes,
          updatedBy: buildRequestedBy(req.auth),
          lastUpdate: new Date()
        }
      },
      { new: true, runValidators: true }
    ).lean();

    return res.json({
      ok: true,
      deviceId: device.deviceId,
      byte0: device.pinState,
      durationBytes: device.durationBytes
    });
  } catch (err) {
    return next(err);
  }
}
