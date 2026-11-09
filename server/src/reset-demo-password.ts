import mongoose from "mongoose";
import { connect, User, Session } from "./models.js";
import { passwordHash } from "./auth.js";

const password = process.env.DEMO_PASSWORD;
if (!password || password.length < 10)
  throw new Error(
    "Set DEMO_PASSWORD in this project's .env to at least ten characters",
  );

await connect();
try {
  const user = await User.findOne({
    email: "organiser@example.test",
    role: "organiser",
  });
  if (!user)
    throw new Error(
      "Seeded organiser account not found in this database. Run npm run seed first.",
    );
  user.password = passwordHash(password);
  await user.save();
  await Session.deleteMany({ userId: user._id });
  console.log(
    "Organiser demo password updated. Sign in as organiser@example.test with DEMO_PASSWORD from this project's .env.",
  );
} finally {
  await mongoose.disconnect();
}
