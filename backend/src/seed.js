import "dotenv/config";
import { connectDb } from "./db.js";
import { Form } from "./models/form.model.js";
import { DeviceRegistry } from "./models/device-registry.model.js";

const slug = "smart-device-main";

const defaultForm = {
  slug,
  title: "Classic House Control Panel",
  description: "Runtime div-based UI",
  divs: [
    {
      divOrder: 10001,
      deviceCode: "esp8266-01",
      text: "Kitchen Light",
      type: "toggle",
      pinNumber: 12,
      options: {
        buttons: [
          { id: "on", label: "On" },
          { id: "off", label: "Off" }
        ]
      }
    },
    {
      divOrder: 10002,
      text: "Go to Camera",
      type: "link",
      options: {
        url: "https://example.com/camera",
        buttonLabel: "Open"
      }
    },
    {
      divOrder: 10003,
      deviceCode: "esp8266-01",
      text: "Watering Time (sec)",
      type: "input",
      pinNumber: 5,
      options: {
        input: {
          name: "seconds",
          defaultValue: "60",
          placeholder: "Enter seconds"
        },
        submit: {
          label: "Submit"
        }
      }
    }
  ]
};

async function seed() {
  await connectDb(process.env.MONGODB_URI);

  await DeviceRegistry.findOneAndUpdate(
    { deviceCode: "esp8266-01" },
    {
      deviceCode: "esp8266-01",
      deviceName: "Lighting control device",
      location: "",
      enabled: true
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );

  await DeviceRegistry.findOneAndUpdate(
    { deviceCode: "esp8266-02" },
    {
      deviceCode: "esp8266-02",
      deviceName: "Air control device",
      location: "",
      enabled: true
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );

  await Form.findOneAndUpdate({ slug }, defaultForm, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
    runValidators: true
  });
  console.log(`Seeded form: ${slug}`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
