import mongoose from "mongoose";

const durationBytesSchema = new mongoose.Schema(
  {
    byte1: { type: Number, min: 0, max: 255, default: 0 }, // D1
    byte2: { type: Number, min: 0, max: 255, default: 0 }, // D2
    byte3: { type: Number, min: 0, max: 255, default: 0 }, // D5
    byte4: { type: Number, min: 0, max: 255, default: 0 }, // D6
    byte5: { type: Number, min: 0, max: 255, default: 0 } // D7
  },
  { _id: false }
);

const deviceSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, unique: true, index: true },
    pinState: { type: Number, default: 0, min: 0, max: 31 }, // byte0
    durationBytes: { type: durationBytesSchema, default: () => ({}) },
    createdBy: {
      userId: { type: String, default: "" },
      username: { type: String, default: "" }
    },
    updatedBy: {
      userId: { type: String, default: "" },
      username: { type: String, default: "" }
    },
    createdAt: { type: Date, default: Date.now },
    lastUpdate: { type: Date, default: Date.now }
  },
  { timestamps: false }
);

export const Device = mongoose.model("Device", deviceSchema);
