import mongoose from "mongoose";

const scheduleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    deviceId: { type: String, required: true, trim: true, index: true },
    pinNumber: { type: Number, required: true },
    action: { type: String, enum: ["open", "close"], required: true },
    durationMinutes: { type: Number, min: 0, max: 255, default: 0 },
    cron: { type: String, required: true, trim: true },
    timezone: { type: String, default: "" },
    enabled: { type: Boolean, default: true },
    lastRunAt: { type: Date, default: null },
    createdBy: {
      userId: { type: String, default: "" },
      username: { type: String, default: "" }
    },
    updatedBy: {
      userId: { type: String, default: "" },
      username: { type: String, default: "" }
    }
  },
  { timestamps: true }
);

export const Schedule = mongoose.model("Schedule", scheduleSchema);
