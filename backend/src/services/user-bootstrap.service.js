import { User } from "../models/user.model.js";
import { createPasswordRecord } from "./password.service.js";

export async function ensureDefaultUser() {
  const defaultAdminUsername = process.env.DEFAULT_ADMIN_USERNAME || "admin";
  const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD || "admin1234";

  await User.updateMany({ role: { $exists: false } }, { $set: { role: "user" } });

  const count = await User.countDocuments();
  if (count === 0) {
    const record = createPasswordRecord(defaultAdminPassword);
    await User.create({ username: defaultAdminUsername, role: "admin", ...record });
    console.log(`Created default user: ${defaultAdminUsername}`);
    return;
  }

  const adminCount = await User.countDocuments({ role: "admin" });
  if (adminCount > 0) return;

  const promoted =
    (await User.findOneAndUpdate(
      { username: defaultAdminUsername },
      { $set: { role: "admin" } },
      { new: true }
    )) ||
    (await User.findOneAndUpdate({}, { $set: { role: "admin" } }, { sort: { createdAt: 1 }, new: true }));

  if (promoted) {
    console.log(`Promoted admin user: ${promoted.username}`);
  }
}
