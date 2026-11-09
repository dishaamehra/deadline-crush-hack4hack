import mongoose from "mongoose";
const { Schema } = mongoose;
function model(
  name: string,
  fields: Record<string, any>,
  indexes: [Record<string, any>, Record<string, any>][] = [],
) {
  const schema = new Schema(fields, { timestamps: true, strict: false });
  for (const [keys, options] of indexes) schema.index(keys, options);
  return mongoose.model<any>(name, schema);
}
export const User = model("User", {
  email: { type: String, unique: true },
  name: String,
  password: String,
  role: String,
});
export const Session = model(
  "Session",
  {
    token: { type: String, unique: true },
    userId: Schema.Types.ObjectId,
    expiresAt: Date,
  },
  [[{ expiresAt: 1 }, { expireAfterSeconds: 0 }]],
);
export const Event = model("Event", {
  slug: { type: String, unique: true },
  ownerId: Schema.Types.ObjectId,
  title: String,
  registrationEnd: Date,
  deadline: Date,
});
export const Registration = model(
  "Registration",
  {
    eventId: Schema.Types.ObjectId,
    userId: Schema.Types.ObjectId,
    teamId: Schema.Types.ObjectId,
  },
  [[{ eventId: 1, userId: 1 }, { unique: true }]],
);
export const Team = model(
  "Team",
  {
    eventId: Schema.Types.ObjectId,
    name: String,
    leaderId: Schema.Types.ObjectId,
    members: [Schema.Types.ObjectId],
    active: Boolean,
    version: Number,
    project: Schema.Types.Mixed,
    invite: String,
    inviteExpires: Date,
  },
  [[{ invite: 1 }, { unique: true, sparse: true }]],
);
export const Upload = model("Upload", {
  teamId: Schema.Types.ObjectId,
  eventId: Schema.Types.ObjectId,
  userId: Schema.Types.ObjectId,
  key: String,
  storageId: String,
  filename: String,
  size: Number,
  hash: String,
  status: String,
  expiresAt: Date,
  completedAt: Date,
  policy: Schema.Types.Mixed,
});
export const Submission = model(
  "Submission",
  {
    teamId: Schema.Types.ObjectId,
    eventId: Schema.Types.ObjectId,
    uploadId: Schema.Types.ObjectId,
    key: String,
    requestHash: String,
    version: Number,
    receivedAt: Date,
    eligible: Boolean,
    status: String,
    project: Schema.Types.Mixed,
    file: Schema.Types.Mixed,
    policy: Schema.Types.Mixed,
  },
  [
    [{ teamId: 1, key: 1 }, { unique: true }],
    [{ teamId: 1, version: 1 }, { unique: true }],
  ],
);
export const Job = model("Job", {
  kind: String,
  submissionId: Schema.Types.ObjectId,
  payload: Schema.Types.Mixed,
  dedupe: { type: String, unique: true },
  state: String,
  attempts: Number,
  lastError: String,
  startedAt: Date,
});
export const Notification = model(
  "Notification",
  {
    userId: Schema.Types.ObjectId,
    title: String,
    message: String,
    url: String,
    read: { type: Boolean, default: false },
    dedupe: String,
  },
  [[{ userId: 1, dedupe: 1 }, { unique: true }]],
);
export const Audit = model(
  "Audit",
  {
    eventId: Schema.Types.ObjectId,
    teamId: Schema.Types.ObjectId,
    actorId: Schema.Types.ObjectId,
    action: String,
    detail: Schema.Types.Mixed,
    dedupe: String,
  },
  [[{ dedupe: 1 }, { unique: true, sparse: true }]],
);
export const Bookmark = model(
  "Bookmark",
  { userId: Schema.Types.ObjectId, eventId: Schema.Types.ObjectId },
  [[{ userId: 1, eventId: 1 }, { unique: true }]],
);
export async function connect() {
  await mongoose.connect((await import("./config.js")).config.mongo);
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
}
export async function transaction<T>(
  operation: (session: mongoose.ClientSession) => Promise<T>,
) {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(() => operation(session));
  } finally {
    await session.endSession();
  }
}
export function id(value: any) {
  return String(value?._id || value);
}
export async function notifyTeam(
  team: any,
  title: string,
  message: string,
  dedupe: string,
) {
  for (const userId of team.members)
    await Notification.updateOne(
      { userId, dedupe },
      { $setOnInsert: { title, message, url: "/workspace/" + team._id } },
      { upsert: true },
    );
}
