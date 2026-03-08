import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, index: true, trim: true },
    role: { type: String, enum: ["admin", "user"], default: "user", index: true },
    passwordHash: { type: String, required: true },
    salt: { type: String, required: true }
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
