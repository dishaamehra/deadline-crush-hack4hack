import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
vi.mock("../src/storage.js", () => ({
  initiate: vi.fn(async () => "storage-id"),
  parts: vi.fn(async () => []),
  sign: vi.fn(async () => "https://storage.example.test/part"),
  complete: vi.fn(async () => {}),
  download: vi.fn(async () => "https://storage.example.test/file"),
  abort: vi.fn(async () => {}),
}));
import { app } from "../src/app.js";
import {
  Event,
  User,
  Registration,
  Team,
  Upload,
  Submission,
  Job,
} from "../src/models.js";
let mongo: MongoMemoryReplSet;
let cookie: string;
let cookie2: string;
let event: any, team: any;
const origin = "http://localhost:5173";
const project = {
  title: "A test project",
  shortDescription: "Test project",
  description: "The project description",
  stack: "React",
  github: "https://github.com/a/b",
  demo: "https://example.com",
  extra: {},
};
beforeAll(async () => {
  const uri = process.env.TEST_MONGODB_URI;
  if (!uri)
    mongo = await MongoMemoryReplSet.create({
      replSet: {
        count: 1,
        args: process.platform === "win32" ? [] : ["--nounixsocket"],
      },
    });
  await mongoose.connect(uri || mongo.getUri());
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  const first = await request(app)
    .post("/api/auth/register")
    .set("Origin", origin)
    .send({
      name: "First User",
      email: "first@example.test",
      password: "test-password-123",
    });
  cookie = first.headers["set-cookie"][0];
  const second = await request(app)
    .post("/api/auth/register")
    .set("Origin", origin)
    .send({
      name: "Second User",
      email: "second@example.test",
      password: "test-password-123",
    });
  cookie2 = second.headers["set-cookie"][0];
  event = await Event.create({
    title: "Test event",
    slug: "test-event",
    organizer: "Demo",
    ownerId: new mongoose.Types.ObjectId(),
    deadline: new Date(Date.now() + 86400000),
    registrationEnd: new Date(Date.now() + 86400000),
    minTeam: 1,
    maxTeam: 2,
    graceMinutes: 5,
    requirements: [],
  });
}, 90000);
afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});
it("allows public discovery", async () =>
  expect((await request(app).get("/api/events")).body.total).toBe(1));
it("blocks anonymous workspace access", async () =>
  expect((await request(app).get("/api/programs")).status).toBe(401));
it("blocks cross-origin mutations", async () =>
  expect(
    (
      await request(app)
        .post("/api/auth/logout")
        .set("Origin", "https://evil.test")
    ).status,
  ).toBe(403));
it("authenticates through an HttpOnly session", async () => {
  expect(cookie).toContain("HttpOnly");
  expect(
    (await request(app).get("/api/me").set("Cookie", cookie)).body.user.name,
  ).toBe("First User");
});
it("deduplicates repeated registrations", async () => {
  for (let i = 0; i < 2; i++)
    expect(
      (
        await request(app)
          .post("/api/events/test-event/register")
          .set("Cookie", cookie)
          .set("Origin", origin)
          .send({})
      ).status,
    ).toBeLessThan(300);
  expect(await Registration.countDocuments()).toBe(1);
});
it("creates an event-scoped team", async () => {
  const r = await request(app)
    .post("/api/events/test-event/teams")
    .set("Cookie", cookie)
    .set("Origin", origin)
    .send({ name: "Alpha" });
  expect(r.status).toBe(201);
  team = r.body.team;
});
it("rejects a second team for the same member", async () =>
  expect(
    (
      await request(app)
        .post("/api/events/test-event/teams")
        .set("Cookie", cookie)
        .set("Origin", origin)
        .send({ name: "Other" })
    ).status,
  ).toBe(409));
it("prevents another account reading the workspace", async () =>
  expect(
    (
      await request(app)
        .get("/api/teams/" + team._id)
        .set("Cookie", cookie2)
    ).status,
  ).toBe(403));
it("persists project details", async () =>
  expect(
    (
      await request(app)
        .put("/api/teams/" + team._id + "/project")
        .set("Cookie", cookie)
        .set("Origin", origin)
        .send(project)
    ).body.project.title,
  ).toBe(project.title));
it("rejects an oversized upload", async () =>
  expect(
    (
      await request(app)
        .post("/api/teams/" + team._id + "/uploads")
        .set("Cookie", cookie)
        .set("Origin", origin)
        .send({
          filename: "project.zip",
          size: 101 * 1024 * 1024,
          hash: "a".repeat(64),
        })
    ).status,
  ).toBe(400));
it("creates one receipt for concurrent retries", async () => {
  const user = await User.findOne({ email: "first@example.test" });
  const upload = await Upload.create({
    teamId: team._id,
    eventId: event._id,
    userId: user!._id,
    key: "test.zip",
    storageId: "test",
    filename: "test.zip",
    size: 30,
    hash: "a".repeat(64),
    status: "Complete",
    project,
    policy: { deadline: event.deadline, graceMinutes: 5 },
  });
  const key = "12345678-1234-4234-8234-123456789abc";
  const send = () =>
    request(app)
      .post("/api/uploads/" + upload._id + "/finalise")
      .set("Cookie", cookie)
      .set("Origin", origin)
      .send({ key });
  const responses = await Promise.all([send(), send(), send()]);
  expect(responses.every((r) => r.status < 300)).toBe(true);
  expect(new Set(responses.map((r) => r.body.submission._id)).size).toBe(1);
  expect(await Submission.countDocuments()).toBe(1);
  expect(await Job.countDocuments()).toBe(1);
});
it("denies participant CSV exports", async () =>
  expect(
    (
      await request(app)
        .get("/api/organiser/events/" + event._id + "/export")
        .set("Cookie", cookie)
    ).status,
  ).toBe(403));
it("rejects invalid invitation codes", async () =>
  expect(
    (
      await request(app)
        .post("/api/events/test-event/join")
        .set("Cookie", cookie2)
        .set("Origin", origin)
        .send({ code: "guess" })
    ).status,
  ).toBe(400));
it("persists bookmark upserts without duplicates", async () => {
  for (let i = 0; i < 2; i++)
    expect(
      (
        await request(app)
          .put("/api/events/test-event/save")
          .set("Cookie", cookie)
          .set("Origin", origin)
          .send({})
      ).body.saved,
    ).toBe(true);
});
it("invalidates the session on logout", async () => {
  await request(app)
    .post("/api/auth/logout")
    .set("Cookie", cookie)
    .set("Origin", origin)
    .send({});
  expect(
    (await request(app).get("/api/me").set("Cookie", cookie)).body.user,
  ).toBe(null);
});
