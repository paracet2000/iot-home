import { DeviceRegistry } from "../models/device-registry.model.js";

export async function listDeviceRegistry(_req, res, next) {
  try {
    const devices = await DeviceRegistry.find().sort({ createdAt: 1 }).lean();
    return res.json({ devices });
  } catch (err) {
    return next(err);
  }
}

export async function upsertDeviceRegistry(req, res, next) {
  try {
    const { deviceCode, deviceName, location, enabled } = req.body ?? {};
    if (!deviceCode || !deviceName) {
      return res.status(400).json({ error: "deviceCode and deviceName are required" });
    }

    const device = await DeviceRegistry.findOneAndUpdate(
      { deviceCode },
      {
        deviceCode,
        deviceName,
        location: location || "",
        enabled: enabled !== false
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );

    return res.json({ ok: true, device });
  } catch (err) {
    return next(err);
  }
}

export async function deleteDeviceRegistry(req, res, next) {
  try {
    const deleted = await DeviceRegistry.findByIdAndDelete(req.params.deviceId);
    if (!deleted) {
      return res.status(404).json({ error: "Device not found" });
    }
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}
