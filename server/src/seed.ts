import { randomBytes } from "node:crypto";
import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
} from "@aws-sdk/client-s3";
import { connect, User, Event, Registration, Team, id } from "./models.js";
import { passwordHash } from "./auth.js";
import { config } from "./config.js";
import { projectSchema } from "./domain.js";
await connect();
if (!process.env.DEMO_PASSWORD || process.env.DEMO_PASSWORD.length < 10)
  throw new Error("Set DEMO_PASSWORD to at least ten characters");
const users = [];
for (const [name, email, role] of [
  ["Dishaa Mehra", "dishaa@example.test", "participant"],
  ["Aarav Shah", "aarav@example.test", "participant"],
  ["Maya Rao", "maya@example.test", "participant"],
  ["Kabir Sen", "kabir@example.test", "participant"],
  ["Demo Organiser", "organiser@example.test", "organiser"],
]) {
  users.push(
    await User.findOneAndUpdate(
      { email },
      {
        $setOnInsert: {
          name,
          email,
          role,
          password: passwordHash(process.env.DEMO_PASSWORD),
        },
      },
      { upsert: true, new: true },
    ),
  );
}
const event = await Event.findOneAndUpdate(
  { slug: "deadline-crush-build-week" },
  {
    $setOnInsert: {
      title: "Deadline Crush Build Week",
      slug: "deadline-crush-build-week",
      ownerId: users[4]._id,
      organizer: "Hack4Hack Development Lab",
      summary:
        "Build a useful tool, form your team and ship with confidence. A fictional event for testing the complete hackathon journey.",
      overview:
        "Create a tool that helps people collaborate under time pressure. Your project should have a clear user journey, a working demonstration and a README that explains the engineering decisions. This fictional local event exercises reliable submissions and transparent deadlines.",
      rules:
        "Work in teams of 2–4. Credit dependencies and third-party assets. Submit a ZIP containing a README and source code. Keep credentials out of the archive.",
      eligibility: "Students and builders of every experience level",
      mode: "Online",
      city: "",
      format: "Hackathon",
      theme: "Open Innovation",
      fee: "Free",
      prize: "Mentoring and project showcase",
      prizeAmount: 0,
      featured: true,
      minTeam: 2,
      maxTeam: 4,
      registrationEnd: new Date(Date.now() + 6 * 86400000),
      deadline: new Date(Date.now() + 7 * 86400000),
      graceMinutes: 5,
      requirements: ["Demo video URL"],
      announcements: [
        "Welcome to the local demonstration. Dates are set when the seed first runs.",
      ],
      faqs: [
        {
          question: "Can I resume an interrupted upload?",
          answer:
            "Yes. Select the original ZIP in your workspace and resume the missing parts.",
        },
        {
          question: "Does a receipt mean my project passed?",
          answer:
            "A receipt records submission. Validation status appears separately.",
        },
      ],
    },
  },
  { upsert: true, new: true },
);
for (const [index, name] of [
  [0, "Lime Builders"],
  [2, "Night Shift"],
] as const) {
  let team = await Team.findOne({ eventId: event._id, name });
  if (!team)
    team = await Team.create({
      eventId: event._id,
      name,
      leaderId: users[index]._id,
      members: [users[index]._id, users[index + 1]._id],
      active: true,
      version: 0,
      invite: randomBytes(18).toString("hex"),
      inviteExpires: new Date(Date.now() + 7 * 86400000),
      project: projectSchema.parse({
        title: index ? "Focus Board" : "Deadline Companion",
        shortDescription: "A collaborative workspace for focused teams.",
        description:
          "Our team is building a clear workflow for collecting project updates and tracking completion.",
        stack: "React, Node.js, MongoDB",
        github: "https://github.com/microsoft/vscode",
        demo: "https://example.com",
        extra: { "Demo video URL": "https://example.com/demo" },
      }),
    });
  for (const user of users.slice(index, index + 2))
    await Registration.updateOne(
      { eventId: event._id, userId: user._id },
      { $setOnInsert: { teamId: team._id } },
      { upsert: true },
    );
}
const storage = new S3Client({
  endpoint: config.endpoint,
  region: config.region,
  forcePathStyle: true,
  credentials: {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  },
});
try {
  await storage.send(new HeadBucketCommand({ Bucket: config.bucket }));
} catch (error: any) {
  if (error.$metadata?.httpStatusCode === 404)
    await storage.send(new CreateBucketCommand({ Bucket: config.bucket }));
  else throw error;
}
if (process.env.S3_CONFIGURE_BUCKET_CORS === "true")
  await storage.send(
    new PutBucketCorsCommand({
      Bucket: config.bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: [config.origin],
            AllowedMethods: ["PUT", "GET", "HEAD"],
            AllowedHeaders: ["*"],
            ExposeHeaders: ["ETag"],
            MaxAgeSeconds: 300,
          },
        ],
      },
    }),
  );
console.log(
  "Seed ready. Accounts: dishaa, aarav, maya, kabir and organiser at example.test. Use DEMO_PASSWORD from .env. Event: " +
    event.slug,
);
process.exit(0);
