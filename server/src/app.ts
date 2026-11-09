import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { randomBytes, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { config, MAX_FILE, PART_SIZE } from "./config.js";
import {
  User,
  Event,
  Registration,
  Team,
  Upload,
  Submission,
  Job,
  Notification,
  Audit,
  Bookmark,
  transaction,
  id,
  notifyTeam,
} from "./models.js";
import {
  HttpError,
  requireCondition,
  eventSchema,
  projectSchema,
  missing,
  httpsUrl,
  eligibility,
  fingerprint,
  eventStatus,
  csvCell,
} from "./domain.js";
import {
  identify,
  authenticated,
  establish,
  passwordHash,
  checkPassword,
  logout,
  type AuthRequest,
} from "./auth.js";
import * as storage from "./storage.js";

export const app = express();
app.use(helmet(), express.json({ limit: "64kb" }), cookieParser());
app.use((req, res, next) => {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.headers.origin !== config.origin
  )
    return next(new HttpError(403, "Request origin is not allowed"));
  next();
});
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 500,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);
app.use(identify);
const authLimit = rateLimit({
  windowMs: 60000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
const identity = (u: any) => ({
  id: id(u),
  name: u.name,
  email: u.email,
  role: u.role,
});
const route =
  (fn: (req: AuthRequest, res: express.Response) => Promise<any>) =>
  (req: AuthRequest, res: express.Response, next: express.NextFunction) =>
    Promise.resolve(fn(req, res)).catch(next);
const objectId = (value: any) => {
  requireCondition(mongoose.isValidObjectId(value), 400, "Invalid identifier");
  return String(value);
};
async function eventFor(slug: any) {
  const event = await Event.findOne({ slug });
  requireCondition(event, 404, "Event unavailable");
  return event;
}
async function teamFor(req: AuthRequest, teamId: any) {
  const team = await Team.findById(objectId(teamId));
  requireCondition(team?.active, 404, "Team unavailable");
  requireCondition(
    team.members.some((m: any) => id(m) === id(req.user)),
    403,
    "This workspace belongs to another team",
  );
  return team;
}
async function ownedEvent(req: AuthRequest, eventId: any) {
  const event = await Event.findById(objectId(eventId));
  requireCondition(event, 404, "Event unavailable");
  requireCondition(
    req.user?.role === "organiser" && id(event.ownerId) === id(req.user),
    403,
    "Organiser access required",
  );
  return event;
}
async function audit(
  team: any,
  user: any,
  action: string,
  detail: any = {},
  session?: mongoose.ClientSession,
) {
  await Audit.create(
    [
      {
        teamId: team._id,
        eventId: team.eventId,
        actorId: user?._id,
        action,
        detail,
      },
    ],
    { session },
  );
}
async function loadWorkspace(team: any) {
  const [event, users, uploads, submissions, ledger] = await Promise.all([
    Event.findById(team.eventId),
    User.find({ _id: { $in: team.members } }).select("name email"),
    Upload.find({ teamId: team._id }).sort({ createdAt: -1 }).limit(20),
    Submission.find({ teamId: team._id }).sort({ version: -1 }),
    Audit.find({ teamId: team._id }).sort({ createdAt: -1 }).limit(60),
  ]);
  return {
    team,
    event,
    members: users,
    uploads,
    submissions,
    ledger,
    serverNow: new Date(),
    latestEligible: submissions.find((s) => s.eligible)?._id,
  };
}
app.get(
  "/api/health",
  route(async (_req, res) =>
    res.json({ ok: mongoose.connection.readyState === 1 }),
  ),
);
app.get(
  "/api/me",
  route(async (req, res) =>
    res.json({ user: req.user ? identity(req.user) : null }),
  ),
);
const credentials = z.object({
  email: z
    .string()
    .email()
    .transform((s) => s.toLowerCase()),
  password: z.string().min(10).max(128),
  name: z.string().min(2).max(80).optional(),
});
app.post(
  "/api/auth/register",
  authLimit,
  route(async (req, res) => {
    const input = credentials.parse(req.body);
    requireCondition(input.name, 400, "Name is required");
    const user = await User.create({
      ...input,
      password: passwordHash(input.password),
      role: "participant",
    });
    await establish(res, user);
    res.status(201).json({ user: identity(user) });
  }),
);
app.post(
  "/api/auth/login",
  authLimit,
  route(async (req, res) => {
    const input = credentials.parse(req.body);
    const user = await User.findOne({ email: input.email });
    requireCondition(
      user && checkPassword(input.password, user.password),
      401,
      "Email or password is incorrect",
    );
    await establish(res, user);
    res.json({ user: identity(user) });
  }),
);
app.post("/api/auth/logout", route(logout));
app.get(
  "/api/events",
  route(async (req, res) => {
    let events = await Event.find().lean();
    const query = String(req.query.q || "").toLowerCase();
    const values = (key: string) =>
      String(req.query[key] || "")
        .split(",")
        .filter(Boolean);
    events = events.filter((e: any) => {
      if (
        ![e.title, e.organizer, e.city].join(" ").toLowerCase().includes(query)
      )
        return false;
      if (values("status").length && !values("status").includes(eventStatus(e)))
        return false;
      for (const field of ["mode", "fee", "format", "theme"])
        if (values(field).length && !values(field).includes(e[field]))
          return false;
      if (req.query.participation === "Solo allowed" && e.minTeam !== 1)
        return false;
      if (req.query.participation === "Teams allowed" && e.maxTeam < 2)
        return false;
      return true;
    });
    const counts = await Registration.aggregate([
      { $group: { _id: "$eventId", count: { $sum: 1 } } },
    ]);
    const saved = req.user
      ? await Bookmark.find({ userId: req.user._id }).lean()
      : [];
    const output = events.map((e: any) => ({
      ...e,
      status: eventStatus(e),
      registered: counts.find((c) => id(c._id) === id(e))?.count || 0,
      saved: saved.some((s) => id(s.eventId) === id(e)),
    }));
    const sorts: Record<string, (a: any, b: any) => number> = {
      deadline: (a, b) =>
        +new Date(a.registrationEnd) - +new Date(b.registrationEnd),
      prize: (a, b) => b.prizeAmount - a.prizeAmount,
      registered: (a, b) => b.registered - a.registered,
      newest: (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
    };
    output.sort(
      sorts[String(req.query.sort)] ||
        ((a, b) => Number(b.featured) - Number(a.featured)),
    );
    res.json({ events: output, total: output.length, serverNow: new Date() });
  }),
);
app.get(
  "/api/events/:slug",
  route(async (req, res) => {
    const event = await eventFor(req.params.slug);
    const registration = req.user
      ? await Registration.findOne({ eventId: event._id, userId: req.user._id })
      : null;
    res.json({
      event: { ...event.toObject(), status: eventStatus(event) },
      registration,
      registered: await Registration.countDocuments({ eventId: event._id }),
      saved: req.user
        ? !!(await Bookmark.exists({
            eventId: event._id,
            userId: req.user._id,
          }))
        : false,
      serverNow: new Date(),
    });
  }),
);
app.put(
  "/api/events/:slug/save",
  authenticated,
  route(async (req, res) => {
    const event = await eventFor(req.params.slug);
    await Bookmark.updateOne(
      { eventId: event._id, userId: req.user._id },
      { $setOnInsert: { eventId: event._id, userId: req.user._id } },
      { upsert: true },
    );
    res.json({ saved: true });
  }),
);
app.delete(
  "/api/events/:slug/save",
  authenticated,
  route(async (req, res) => {
    const event = await eventFor(req.params.slug);
    await Bookmark.deleteOne({ eventId: event._id, userId: req.user._id });
    res.json({ saved: false });
  }),
);
app.post(
  "/api/events/:slug/register",
  authenticated,
  route(async (req, res) => {
    const event = await eventFor(req.params.slug);
    const existing = await Registration.findOne({
      eventId: event._id,
      userId: req.user._id,
    });
    if (existing) return res.json({ registration: existing });
    requireCondition(
      new Date() <= event.registrationEnd,
      409,
      "Registration has closed",
    );
    const registration = await Registration.findOneAndUpdate(
      { eventId: event._id, userId: req.user._id },
      { $setOnInsert: { eventId: event._id, userId: req.user._id } },
      { upsert: true, new: true },
    );
    await Notification.updateOne(
      { userId: req.user._id, dedupe: "registration-" + event._id },
      {
        $setOnInsert: {
          title: "Registration confirmed",
          message: event.title,
          url: "/hackathons/" + event.slug,
        },
      },
      { upsert: true },
    );
    res.status(201).json({ registration });
  }),
);
app.get(
  "/api/programs",
  authenticated,
  route(async (req, res) => {
    const registrations = await Registration.find({
      userId: req.user._id,
    }).lean();
    res.json({
      programs: await Promise.all(
        registrations.map(async (r: any) => ({
          ...r,
          event: await Event.findById(r.eventId),
          team: r.teamId ? await Team.findById(r.teamId) : null,
        })),
      ),
    });
  }),
);
app.post(
  "/api/events/:slug/teams",
  authenticated,
  route(async (req, res) => {
    const event = await eventFor(req.params.slug);
    const { name } = z
      .object({ name: z.string().min(2).max(80) })
      .parse(req.body);
    requireCondition(
      Date.now() <= +event.deadline,
      409,
      "Team formation is closed",
    );
    const team = await transaction(async (session) => {
      const registration = await Registration.findOne({
        eventId: event._id,
        userId: req.user._id,
      }).session(session);
      requireCondition(
        registration && !registration.teamId,
        409,
        "Register first and leave any existing team",
      );
      const [team] = await Team.create(
        [
          {
            eventId: event._id,
            name,
            leaderId: req.user._id,
            members: [req.user._id],
            active: true,
            version: 0,
            project: projectSchema.parse({}),
            invite: randomBytes(18).toString("hex"),
            inviteExpires: new Date(Date.now() + 7 * 86400000),
          },
        ],
        { session },
      );
      registration.teamId = team._id;
      await registration.save({ session });
      await audit(team, req.user, "Team created", {}, session);
      return team;
    });
    res.status(201).json({ team });
  }),
);
app.post(
  "/api/events/:slug/join",
  authenticated,
  authLimit,
  route(async (req, res) => {
    const event = await eventFor(req.params.slug);
    const { code } = z
      .object({ code: z.string().regex(/^[a-f0-9]{36}$/) })
      .parse(req.body);
    requireCondition(
      Date.now() <= +event.deadline,
      409,
      "Team formation is closed",
    );
    const team = await transaction(async (session) => {
      const registration = await Registration.findOne({
        eventId: event._id,
        userId: req.user._id,
      }).session(session);
      requireCondition(
        registration && !registration.teamId,
        409,
        "Register first and leave any existing team",
      );
      const team = await Team.findOneAndUpdate(
        {
          eventId: event._id,
          invite: code,
          inviteExpires: { $gt: new Date() },
          active: true,
          $expr: { $lt: [{ $size: "$members" }, event.maxTeam] },
        },
        { $addToSet: { members: req.user._id } },
        { new: true, session },
      );
      requireCondition(team, 409, "Invitation expired, invalid, or team full");
      registration.teamId = team._id;
      await registration.save({ session });
      await audit(team, req.user, "Member joined", {}, session);
      return team;
    });
    res.json({ team });
  }),
);
app.get(
  "/api/teams/:teamId",
  authenticated,
  route(async (req, res) =>
    res.json(await loadWorkspace(await teamFor(req, req.params.teamId))),
  ),
);
app.post(
  "/api/teams/:teamId/invite",
  authenticated,
  route(async (req, res) => {
    const team = await teamFor(req, req.params.teamId);
    requireCondition(
      id(team.leaderId) === id(req.user),
      403,
      "Team leader required",
    );
    team.invite = randomBytes(18).toString("hex");
    team.inviteExpires = new Date(Date.now() + 7 * 86400000);
    await team.save();
    const { email } = z
      .object({ email: z.string().email().optional() })
      .parse(req.body);
    if (email) {
      const target = await User.findOne({ email: email.toLowerCase() });
      if (target)
        await Notification.create({
          userId: target._id,
          title: "Team invitation",
          message: team.name + " invitation code " + team.invite,
          url: "/programs",
          dedupe: randomUUID(),
        });
    }
    res.json({ code: team.invite, expiresAt: team.inviteExpires });
  }),
);
app.delete(
  "/api/teams/:teamId/members/:userId",
  authenticated,
  route(async (req, res) => {
    const team = await teamFor(req, req.params.teamId);
    const userId = objectId(req.params.userId);
    requireCondition(
      id(req.user) === userId || id(team.leaderId) === id(req.user),
      403,
      "Team leader required",
    );
    const event = await Event.findById(team.eventId);
    requireCondition(
      Date.now() <= +event.deadline,
      409,
      "Membership is locked after the deadline",
    );
    await transaction(async (session) => {
      const current = await Team.findById(team._id).session(session);
      requireCondition(
        current?.members.some((m: any) => id(m) === id(req.user)),
        403,
        "Membership changed",
      );
      requireCondition(
        id(req.user) === userId || id(current.leaderId) === id(req.user),
        403,
        "Leadership changed",
      );
      current.members = current.members.filter((m: any) => id(m) !== userId);
      current.active = current.members.length > 0;
      if (id(current.leaderId) === userId)
        current.leaderId = current.members[0] || null;
      await current.save({ session });
      await Registration.updateOne(
        { eventId: team.eventId, userId },
        { $unset: { teamId: 1 } },
        { session },
      );
      await audit(
        current,
        req.user,
        "Member left or removed",
        { userId },
        session,
      );
    });
    res.json({ ok: true });
  }),
);
app.put(
  "/api/teams/:teamId/project",
  authenticated,
  route(async (req, res) => {
    const team = await teamFor(req, req.params.teamId);
    const event = await Event.findById(team.eventId);
    requireCondition(
      Date.now() <= +event.deadline,
      409,
      "Project editing closed at the deadline",
    );
    const project = projectSchema.parse(req.body);
    await Team.updateOne({ _id: team._id }, { $set: { project } });
    res.json({ project, missing: missing(project, event.requirements) });
  }),
);
app.post(
  "/api/teams/:teamId/uploads",
  authenticated,
  route(async (req, res) => {
    const team = await teamFor(req, req.params.teamId);
    const event = await Event.findById(team.eventId);
    requireCondition(
      Date.now() <= +event.deadline,
      409,
      "New uploads closed at the deadline",
    );
    const input = z
      .object({
        filename: z
          .string()
          .min(1)
          .max(180)
          .regex(/\.zip$/i),
        size: z.number().int().min(22).max(MAX_FILE),
        hash: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .parse(req.body);
    const key = team.eventId + "/" + team._id + "/" + randomUUID() + ".zip";
    const storageId = await storage.initiate(key);
    let upload;
    try {
      upload = await Upload.create({
        ...input,
        teamId: team._id,
        eventId: team.eventId,
        userId: req.user._id,
        key,
        storageId,
        status: "Uploading",
        expiresAt: new Date(
          +event.deadline + event.graceMinutes * 60000 + 86400000,
        ),
        policy: { deadline: event.deadline, graceMinutes: event.graceMinutes },
        project: team.project,
      });
    } catch (error) {
      await storage.abort({ key, storageId }).catch(() => {});
      throw error;
    }
    await audit(team, req.user, "Upload initiated", { uploadId: upload._id });
    res.status(201).json({ upload, partSize: PART_SIZE });
  }),
);
async function uploadFor(req: AuthRequest) {
  const upload = await Upload.findById(objectId(req.params.uploadId));
  requireCondition(upload, 404, "Upload unavailable");
  const team = await teamFor(req, upload.teamId);
  return { upload, team };
}
app.get(
  "/api/uploads/:uploadId",
  authenticated,
  route(async (req, res) => {
    const { upload } = await uploadFor(req);
    res.json({
      upload,
      parts: upload.status === "Uploading" ? await storage.parts(upload) : [],
      partSize: PART_SIZE,
    });
  }),
);
app.post(
  "/api/uploads/:uploadId/sign",
  authenticated,
  route(async (req, res) => {
    const { upload } = await uploadFor(req);
    const { part } = z
      .object({ part: z.number().int().min(1).max(13) })
      .parse(req.body);
    requireCondition(
      upload.status === "Uploading" &&
        eligibility(upload.createdAt, new Date(), upload.policy),
      409,
      "Upload window closed",
    );
    res.json({ url: await storage.sign(upload, part) });
  }),
);
app.post(
  "/api/uploads/:uploadId/complete",
  authenticated,
  route(async (req, res) => {
    const { upload, team } = await uploadFor(req);
    if (upload.status === "Complete") return res.json({ upload });
    requireCondition(
      eligibility(upload.createdAt, new Date(), upload.policy),
      409,
      "Upload window closed",
    );
    await storage.complete(upload);
    upload.status = "Complete";
    upload.completedAt = new Date();
    await upload.save();
    await audit(team, req.user, "Object upload completed", {
      uploadId: upload._id,
    });
    await notifyTeam(
      team,
      "Upload completed",
      upload.filename + " is ready to finalise.",
      "upload-" + upload._id,
    );
    res.json({ upload });
  }),
);
app.post(
  "/api/uploads/:uploadId/finalise",
  authenticated,
  route(async (req, res) => {
    const { upload, team } = await uploadFor(req);
    const { key } = z.object({ key: z.string().uuid() }).parse(req.body);
    const requestHash = fingerprint({
      uploadId: id(upload),
      project: upload.project,
    });
    const existing = await Submission.findOne({ teamId: team._id, key });
    if (existing) {
      requireCondition(
        existing.requestHash === requestHash,
        409,
        "Idempotency key was used for different content",
      );
      return res.json({ submission: existing });
    }
    requireCondition(
      upload.status === "Complete",
      409,
      "Complete the upload first",
    );
    const event = await Event.findById(team.eventId);
    requireCondition(
      team.members.length >= event.minTeam,
      409,
      "Team does not meet minimum size",
    );
    requireCondition(
      missing(upload.project, event.requirements).length === 0,
      400,
      "Complete project requirements before starting this upload",
    );
    requireCondition(
      httpsUrl(upload.project.github) && httpsUrl(upload.project.demo),
      400,
      "Use valid HTTPS links",
    );
    const receivedAt = new Date();
    const eligible = eligibility(upload.createdAt, receivedAt, upload.policy);
    let submission;
    try {
      submission = await transaction(async (session) => {
        const previous = await Submission.findOne({
          teamId: team._id,
          key,
        }).session(session);
        if (previous) {
          requireCondition(
            previous.requestHash === requestHash,
            409,
            "Idempotency key conflict",
          );
          return previous;
        }
        const updated = await Team.findOneAndUpdate(
          { _id: team._id, active: true, members: req.user._id },
          { $inc: { version: 1 } },
          { new: true, session },
        );
        requireCondition(updated, 403, "Team membership changed");
        const duplicate = await Submission.exists({
          teamId: team._id,
          "file.hash": upload.hash,
        }).session(session);
        const [record] = await Submission.create(
          [
            {
              teamId: team._id,
              eventId: team.eventId,
              uploadId: upload._id,
              key,
              requestHash,
              version: updated.version,
              receivedAt,
              eligible,
              status: eligible ? "Received" : "Late",
              project: upload.project,
              file: {
                key: upload.key,
                filename: upload.filename,
                size: upload.size,
                hash: upload.hash,
              },
              policy: upload.policy,
              duplicate: !!duplicate,
            },
          ],
          { session },
        );
        if (eligible)
          await Job.create(
            [
              {
                kind: "validate",
                submissionId: record._id,
                dedupe: "validate-" + record._id,
                state: "pending",
                attempts: 0,
              },
            ],
            { session },
          );
        await audit(
          team,
          req.user,
          "Submission received",
          { submissionId: record._id, receivedAt, eligible },
          session,
        );
        for (const userId of updated.members)
          await Notification.create(
            [
              {
                userId,
                dedupe: "receipt-" + record._id,
                title: "Submission receipt",
                message:
                  "Version " +
                  record.version +
                  " received. " +
                  (eligible ? "Within deadline policy." : "Marked late."),
                url: "/workspace/" + team._id,
              },
            ],
            { session },
          );
        return record;
      });
    } catch (error: any) {
      if (error.code !== 11000) throw error;
      submission = await Submission.findOne({ teamId: team._id, key });
      requireCondition(
        submission?.requestHash === requestHash,
        409,
        "Concurrent submission conflict. Retry with the same key",
      );
    }
    res.status(201).json({ submission });
  }),
);
app.get(
  "/api/submissions/:submissionId/download",
  authenticated,
  route(async (req, res) => {
    const submission = await Submission.findById(
      objectId(req.params.submissionId),
    );
    requireCondition(submission, 404, "Submission unavailable");
    const team = await Team.findById(submission.teamId);
    if (!team?.members.some((m: any) => id(m) === id(req.user)))
      await ownedEvent(req, submission.eventId);
    res.json({ url: await storage.download(submission.file) });
  }),
);
app.get(
  "/api/notifications",
  authenticated,
  route(async (req, res) =>
    res.json({
      notifications: await Notification.find({ userId: req.user._id })
        .sort({ createdAt: -1 })
        .limit(100),
    }),
  ),
);
app.put(
  "/api/notifications/:id/read",
  authenticated,
  route(async (req, res) => {
    await Notification.updateOne(
      { _id: objectId(req.params.id), userId: req.user._id },
      { $set: { read: true } },
    );
    res.json({ ok: true });
  }),
);
app.get(
  "/api/teams/:teamId/stream",
  authenticated,
  route(async (req, res) => {
    await teamFor(req, req.params.teamId);
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders();
    let running = false;
    const send = async () => {
      if (running) return;
      running = true;
      try {
        await new Promise<void>((resolve, reject) =>
          identify(req, res, (error) => (error ? reject(error) : resolve())),
        );
        requireCondition(req.user, 401, "Session expired");
        const team = await teamFor(req, req.params.teamId);
        const data = await loadWorkspace(team);
        res.write("event: workspace\ndata: " + JSON.stringify(data) + "\n\n");
      } catch {
        res.end();
      } finally {
        running = false;
      }
    };
    const timer = setInterval(() => void send(), 3000);
    req.on("close", () => clearInterval(timer));
    await send();
  }),
);
app.get(
  "/api/organiser/events",
  authenticated,
  route(async (req, res) => {
    requireCondition(req.user.role === "organiser", 403, "Organiser required");
    res.json({ events: await Event.find({ ownerId: req.user._id }) });
  }),
);
app.post(
  "/api/organiser/events",
  authenticated,
  route(async (req, res) => {
    requireCondition(req.user.role === "organiser", 403, "Organiser required");
    const data = eventSchema.parse(req.body);
    res
      .status(201)
      .json({ event: await Event.create({ ...data, ownerId: req.user._id }) });
  }),
);
app.put(
  "/api/organiser/events/:eventId",
  authenticated,
  route(async (req, res) => {
    const event = await ownedEvent(req, req.params.eventId);
    const data = eventSchema.parse(req.body);
    requireCondition(
      !(await Upload.exists({ eventId: event._id })) ||
        (+new Date(data.deadline) === +event.deadline &&
          data.graceMinutes === event.graceMinutes),
      409,
      "Deadline policy is locked after uploads start",
    );
    Object.assign(event, data);
    await event.save();
    res.json({ event });
  }),
);
app.get(
  "/api/organiser/events/:eventId/dashboard",
  authenticated,
  route(async (req, res) => {
    const event = await ownedEvent(req, req.params.eventId);
    const [teams, registrations, submissions, uploads, ledger] =
      await Promise.all([
        Team.find({ eventId: event._id }).lean(),
        Registration.find({ eventId: event._id }).lean(),
        Submission.find({ eventId: event._id }).sort({ receivedAt: -1 }).lean(),
        Upload.find({ eventId: event._id }).lean(),
        Audit.find({ eventId: event._id })
          .sort({ createdAt: -1 })
          .limit(100)
          .lean(),
      ]);
    const users = await User.find({
      _id: { $in: registrations.map((r) => r.userId) },
    })
      .select("name email")
      .lean();
    const jobs = await Job.find({
      $or: [
        { submissionId: { $in: submissions.map((s) => s._id) } },
        { "payload.eventId": id(event) },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    const acceptedTeams = new Set(
      submissions
        .filter((s) => s.eligible && s.status === "Accepted")
        .map((s) => id(s.teamId)),
    );
    res.json({
      event,
      teams,
      registrations,
      users,
      submissions,
      uploads,
      jobs,
      ledger,
      metrics: {
        registrations: registrations.length,
        teams: teams.filter((t) => t.active).length,
        submissions: submissions.length,
        acceptedTeams: acceptedTeams.size,
        incompleteTeams: teams.filter(
          (t) => t.active && !acceptedTeams.has(id(t)),
        ).length,
      },
    });
  }),
);
app.post(
  "/api/organiser/jobs/:jobId/retry",
  authenticated,
  route(async (req, res) => {
    const job = await Job.findById(objectId(req.params.jobId));
    requireCondition(job, 404, "Job unavailable");
    const submission = job.submissionId
      ? await Submission.findById(job.submissionId)
      : null;
    await ownedEvent(req, submission?.eventId || job.payload.eventId);
    requireCondition(
      ["failed", "uncertain"].includes(job.state),
      409,
      "Only failed or uncertain jobs can be retried",
    );
    job.state = "pending";
    job.lastError = "";
    job.attempts = 0;
    await job.save();
    res.json({ job });
  }),
);
app.get(
  "/api/organiser/events/:eventId/export",
  authenticated,
  route(async (req, res) => {
    const event = await ownedEvent(req, req.params.eventId);
    const submissions = await Submission.find({ eventId: event._id })
      .sort({ receivedAt: -1 })
      .lean();
    const rows = [
      [
        "Submission",
        "Team",
        "Version",
        "Received UTC",
        "Eligible",
        "Status",
        "Project",
        "GitHub",
        "Demo",
        "SHA256",
      ],
      ...submissions.map((s) => [
        id(s),
        id(s.teamId),
        s.version,
        s.receivedAt.toISOString(),
        s.eligible,
        s.status,
        s.project.title,
        s.project.github,
        s.project.demo,
        s.file.hash,
      ]),
    ];
    res
      .set({
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="submissions.csv"',
      })
      .send(
        "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n"),
      );
  }),
);
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "API route unavailable" }),
);
app.use(
  (
    error: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const status =
      error instanceof z.ZodError
        ? 400
        : error.status || (error.code === 11000 ? 409 : 500);
    if (status === 500) console.error(error);
    res
      .status(status)
      .json({
        error:
          status === 500
            ? "Service unavailable. Retry shortly."
            : error instanceof z.ZodError
              ? error.issues.map((i) => i.message).join(", ")
              : error.code === 11000
                ? "Record already exists"
                : error.message,
      });
  },
);
