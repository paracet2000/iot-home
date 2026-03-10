import mongoose from "mongoose";

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function validateDivOptions(value) {
  if (!isObject(value)) return false;

  if (this.type === "toggle") {
    if (!Array.isArray(value.buttons) || value.buttons.length === 0) return false;
    return value.buttons.every(
      (btn) =>
        isObject(btn) &&
        (btn.id === "on" || btn.id === "off") &&
        typeof btn.label === "string" &&
        btn.label.length > 0
    );
  }

  if (this.type === "input") {
    if (!isObject(value.input) || !isObject(value.submit)) return false;
    if (typeof value.input.name !== "string" || value.input.name.length === 0) return false;
    if (value.input.defaultValue != null && typeof value.input.defaultValue !== "string") return false;
    if (value.input.placeholder != null && typeof value.input.placeholder !== "string") return false;
    return typeof value.submit.label === "string" && value.submit.label.length > 0;
  }

  if (this.type === "link") {
    if (typeof value.url !== "string" || value.url.length === 0) return false;
    return value.buttonLabel == null || typeof value.buttonLabel === "string";
  }

  return false;
}

const formDivSchema = new mongoose.Schema(
  {
    divOrder: { type: Number, required: true },
    deviceCode: { type: String, default: "" },
    text: { type: String, default: "" },
    type: { type: String, enum: ["toggle", "input", "link"], required: true },
    pinNumber: { type: Number },
    options: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      validate: {
        validator: validateDivOptions,
        message: "Invalid options for div type"
      }
    }
  },
  { _id: false }
);

formDivSchema.pre("validate", function enforceDeviceForInteractiveTypes(next) {
  if ((this.type === "toggle" || this.type === "input") && !this.deviceCode) {
    this.invalidate("deviceCode", "deviceCode is required for toggle/input");
  }
  next();
});

const formSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    divs: { type: [formDivSchema], default: [] }
  },
  { timestamps: true }
);

export const Form = mongoose.model("Form", formSchema);
