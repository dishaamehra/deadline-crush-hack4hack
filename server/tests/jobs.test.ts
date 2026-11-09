import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
vi.mock("../src/storage.js", () => ({ read: vi.fn(), abort: vi.fn() }));
vi.mock("../src/validation.js", async (original) => ({
  ...(await original<any>()),
  checkLink: vi.fn(async () => {}),
}));
import { read } from "../src/storage.js";
import { checkLink, sha256 } from "../src/validation.js";
import { validateSubmission, scheduleReminders } from "../src/jobs.js";
import {
  User,
  Event,
  Team,
  Submission,
  Job,
  Notification,
  Audit,
} from "../src/models.js";
let mongo: MongoMemoryReplSet;
let event: any, team: any, submission: any;
let file: Buffer;
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      args: process.platform === "win32" ? [] : ["--nounixsocket"],
    },
  });
  await mongoose.connect(mongo.getUri());
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  const users = await User.create([
    { email: "one@test.local", name: "One" },
    { email: "two@test.local", name: "Two" },
  ]);
  event = await Event.create({
    slug: "worker-event",
    title: "Worker event",
    deadline: new Date(Date.now() + 3600000),
    requirements: [],
  });
  team = await Team.create({
    eventId: event._id,
    name: "Worker team",
    active: true,
    members: users.map((u) => u._id),
    project: {
      title: "Work",
      github: "https://github.com/a/b",
      demo: "https://example.com",
    },
  });
  file = await readFile("../scripts/fixtures/project.zip");
  vi.mocked(read).mockImplementation(async () => Readable.from(file) as any);
  submission = await Submission.create({
    teamId: team._id,
    eventId: event._id,
    version: 1,
    key: "first",
    eligible: true,
    status: "Received",
    project: team.project,
    file: { key: "archive", size: file.length, hash: sha256(file) },
  });
}, 90000);
afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});
it("processes the ZIP and persists a README preview", async () => {
  await validateSubmission({ submissionId: submission._id });
  const result = await Submission.findById(submission._id);
  expect(result!.status).toBe("Accepted");
  expect(result!.preview).toContain("Deadline Crush");
});
it("replaying a completed validation preserves one set of effects", async () => {
  await validateSubmission({ submissionId: submission._id });
  await validateSubmission({ submissionId: submission._id });
  expect(await Notification.countDocuments()).toBe(2);
  expect(await Audit.countDocuments()).toBe(1);
});
it("recreates missing notifications after a crash following terminal status", async () => {
  await Notification.deleteMany({});
  await validateSubmission({ submissionId: submission._id });
  expect(await Notification.countDocuments()).toBe(2);
  expect(await Audit.countDocuments()).toBe(1);
});
it("keeps receipts when integrity fails", async () => {
  const s = await Submission.create({
    teamId: team._id,
    eventId: event._id,
    version: 2,
    key: "integrity",
    status: "Received",
    eligible: true,
    project: team.project,
    file: { size: file.length, hash: "b".repeat(64) },
  });
  await validateSubmission({ submissionId: s._id });
  expect((await Submission.findById(s._id))!.status).toBe("Integrity failed");
});
it("can retry a temporary link failure", async () => {
  const s = await Submission.create({
    teamId: team._id,
    eventId: event._id,
    version: 3,
    key: "retry",
    status: "Received",
    eligible: true,
    project: team.project,
    file: { size: file.length, hash: sha256(file) },
  });
  vi.mocked(checkLink).mockRejectedValueOnce(new Error("Temporary outage"));
  await expect(validateSubmission({ submissionId: s._id })).rejects.toThrow(
    "Temporary outage",
  );
  await validateSubmission({ submissionId: s._id });
  expect((await Submission.findById(s._id))!.status).toBe("Accepted");
});
it("sends final reminders to completed teams and all members", async () => {
  await scheduleReminders();
  const jobs = await Job.find({ kind: "email" });
  expect(jobs.length).toBe(2);
  expect(
    jobs.every((j) => j.payload.subject === "Final submission verification"),
  ).toBe(true);
});
it("deduplicates repeated reminder scheduling", async () => {
  await scheduleReminders();
  await scheduleReminders();
  expect(await Job.countDocuments({ kind: "email" })).toBe(2);
});
