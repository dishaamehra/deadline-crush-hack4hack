import { writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import {
  connect,
  User,
  Team,
  Registration,
  Event,
} from "../server/src/models.js";
import { passwordHash } from "../server/src/auth.js";
if (process.env.LOAD_TEST_CONFIRMED !== "yes")
  throw new Error(
    "Use an isolated test database and set LOAD_TEST_CONFIRMED=yes",
  );
await connect();
const event = await Event.findOne({ slug: "deadline-crush-build-week" });
if (!event) throw new Error("Run npm run seed first");
const count = Number(process.env.LOAD_TEAMS || 2000);
const password = randomBytes(20).toString("hex");
const hash = passwordHash(password);
const accounts = [];
for (let i = 0; i < count; i++) {
  const email = "load-" + i + "@example.test";
  const users = [];
  for (let j = 0; j < 2; j++)
    users.push(
      await User.create({
        email: j ? "load-member-" + i + "@example.test" : email,
        name: "Load builder " + i + "-" + j,
        role: "participant",
        password: hash,
      }),
    );
  const team = await Team.create({
    eventId: event._id,
    name: "Load team " + i,
    leaderId: users[0]._id,
    members: users.map((u) => u._id),
    active: true,
    version: 0,
    invite: randomBytes(18).toString("hex"),
    inviteExpires: event.deadline,
    project: {
      title: "Load project " + i,
      shortDescription: "Load test project",
      description: "Submission load test fixture",
      stack: "React",
      github: "https://github.com/microsoft/vscode",
      demo: "https://example.com",
      extra: { "Demo video URL": "https://example.com" },
    },
  });
  await Registration.insertMany(
    users.map((user) => ({
      userId: user._id,
      eventId: event._id,
      teamId: team._id,
    })),
  );
  accounts.push({ email, password, teamId: String(team._id) });
}
await writeFile("load-accounts.json", JSON.stringify(accounts));
console.log(
  "Created " +
    count +
    " load teams. load-accounts.json contains temporary credentials. Keep it private.",
);
process.exit(0);
