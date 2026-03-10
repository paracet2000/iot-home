import mongoose from "mongoose";

const deviceRegistrySchema = new mongoose.Schema(
  {
    deviceCode: { type: String, required: true, unique: true, index: true, trim: true },
    deviceName: { type: String, required: true, trim: true },
    location: { type: String, default: "", trim: true },
    enabled: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export const DeviceRegistry = mongoose.model("DeviceRegistry", deviceRegistrySchema);
