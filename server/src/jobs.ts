import { createTransport } from "nodemailer";
import {
  Job,
  Submission,
  Team,
  Event,
  Notification,
  Audit,
  id,
  notifyTeam,
  User,
  Upload,
} from "./models.js";
import { config } from "./config.js";
import { missing } from "./domain.js";
import { read, abort } from "./storage.js";
import {
  collectFile,
  inspectZip,
  sha256,
  checkLink,
  InvalidFile,
} from "./validation.js";
const mail = createTransport({
  host: process.env.SMTP_HOST || "localhost",
  port: Number(process.env.SMTP_PORT || 1025),
  secure: process.env.SMTP_SECURE === "true",
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
    : undefined,
});
export async function validateSubmission(job: any) {
  const submission = await Submission.findById(job.submissionId);
  if (!submission) return;
  const terminal = ["Accepted", "Needs a fix", "Integrity failed"];
  const updateFilter = { _id: submission._id, status: { $nin: terminal } };
  const team = await Team.findById(submission.teamId);
  if (!terminal.includes(submission.status))
    try {
      await Submission.updateOne(updateFilter, {
        $set: { status: "Verifying" },
      });
      const file = await collectFile(await read(submission.file));
      if (
        file.length !== submission.file.size ||
        sha256(file) !== submission.file.hash
      ) {
        await Submission.updateOne(updateFilter, {
          $set: {
            status: "Integrity failed",
            errors: ["File size or SHA-256 mismatch"],
          },
        });
      } else {
        await Submission.updateOne(updateFilter, {
          $set: { status: "Processing" },
        });
        const preview = await inspectZip(file);
        await checkLink(submission.project.github);
        await checkLink(submission.project.demo);
        await Submission.updateOne(updateFilter, {
          $set: { status: "Accepted", preview, errors: [] },
        });
      }
    } catch (error) {
      if (!(error instanceof InvalidFile)) throw error;
      await Submission.updateOne(updateFilter, {
        $set: { status: "Needs a fix", errors: [error.message] },
      });
    }
  const updated = await Submission.findById(submission._id);
  await notifyTeam(
    team,
    "Validation " + updated.status,
    updated.project.title + " · version " + updated.version,
    "validation-" + submission._id,
  );
  await Audit.updateOne(
    { dedupe: "validation-" + submission._id },
    {
      $setOnInsert: {
        teamId: team._id,
        action: "Validation completed",
        eventId: team.eventId,
        detail: { submissionId: submission._id, status: updated.status },
      },
    },
    { upsert: true },
  );
}
export async function sendEmail(job: any) {
  if (job.state === "sending" || job.state === "uncertain") {
    await Job.updateOne(
      { _id: job._id },
      {
        $set: {
          state: "uncertain",
          lastError:
            "Worker restarted during SMTP delivery. Inspect the inbox/provider before retrying.",
        },
      },
    );
    return;
  }
  await Job.updateOne({ _id: job._id }, { $set: { state: "sending" } });
  try {
    const result = await mail.sendMail({
      from: process.env.EMAIL_FROM || "Deadline Crush <demo@localhost>",
      to: job.payload.email,
      subject: job.payload.subject,
      text: job.payload.text,
      messageId: "<" + job._id + "@deadline.local>",
    });
    await Job.updateOne(
      { _id: job._id },
      {
        $set: {
          state: "done",
          providerAccepted: result.accepted,
          providerResponse: result.response,
        },
      },
    );
  } catch (error: any) {
    const explicitReject =
      Number(error.responseCode) >= 400 ||
      ["ECONNECTION", "EDNS"].includes(error.code);
    await Job.updateOne(
      { _id: job._id },
      {
        $set: {
          state: explicitReject ? "retry" : "uncertain",
          lastError: String(error.message),
        },
      },
    );
    if (explicitReject) throw error;
  }
}
export async function scheduleReminders(now = new Date()) {
  const events = await Event.find({ deadline: { $gt: now } });
  for (const event of events) {
    const remaining = +event.deadline - +now;
    for (const hours of [24, 2]) {
      if (remaining > hours * 3600000) continue;
      const teams = await Team.find({ eventId: event._id, active: true });
      for (const team of teams) {
        const latest = await Submission.findOne({
          teamId: team._id,
          eligible: true,
        }).sort({ version: -1 });
        if (hours === 24 && latest?.status === "Accepted") continue;
        const users = await User.find({ _id: { $in: team.members } });
        const missingFields = missing(team.project, event.requirements);
        const details = [
          "Team " + team.name,
          "Project " + (team.project.title || "Untitled"),
          "Status " + (latest?.status || "Incomplete"),
          "GitHub " + (team.project.github || "Missing"),
          "Demo " + (team.project.demo || "Missing"),
          "File " + (latest?.file.filename || "Missing"),
          "Missing fields " + (missingFields.join(", ") || "None"),
          "Deadline " + event.deadline.toISOString(),
          config.origin + "/workspace/" + team._id,
        ].join("\n");
        for (const user of users) {
          const dedupe =
            event._id + "-" + team._id + "-" + user._id + "-" + hours;
          await Job.updateOne(
            { dedupe },
            {
              $setOnInsert: {
                kind: "email",
                state: "pending",
                attempts: 0,
                payload: {
                  eventId: id(event),
                  teamId: id(team),
                  email: user.email,
                  subject:
                    hours === 2
                      ? "Final submission verification"
                      : "Complete your submission",
                  text: details,
                },
              },
            },
            { upsert: true },
          );
          await Notification.updateOne(
            { userId: user._id, dedupe },
            {
              $setOnInsert: {
                title: "Deadline reminder",
                message: details,
                url: "/workspace/" + team._id,
              },
            },
            { upsert: true },
          );
        }
      }
    }
  }
}
export async function cleanupUploads() {
  for (const upload of await Upload.find({
    status: "Uploading",
    expiresAt: { $lt: new Date() },
  }).limit(20)) {
    try {
      await abort(upload);
      upload.status = "Expired";
      await upload.save();
    } catch (error) {
      console.error("Upload cleanup failed", String(error));
    }
  }
}
