import { Queue, Worker } from "bullmq";
import { connect, Job } from "./models.js";
import { config } from "./config.js";
import {
  validateSubmission,
  sendEmail,
  scheduleReminders,
  cleanupUploads,
} from "./jobs.js";
await connect();
const url = new URL(config.redis);
const connection = {
  host: url.hostname,
  port: Number(url.port || 6379),
  password: url.password || undefined,
  maxRetriesPerRequest: null,
};
const queue = new Queue("deadline", { connection });
const worker = new Worker(
  "deadline",
  async (task) => {
    const record = await Job.findById(task.data.recordId);
    if (!record || ["done", "uncertain"].includes(record.state)) return;
    if (record.kind === "email" && record.state === "sending") {
      await sendEmail(record);
      return;
    }
    await Job.updateOne(
      { _id: record._id },
      {
        $set: { state: "working", startedAt: new Date() },
        $inc: { attempts: 1 },
      },
    );
    try {
      if (process.env.TEST_WORKER_DELAY_MS)
        await new Promise((resolve) =>
          setTimeout(resolve, Number(process.env.TEST_WORKER_DELAY_MS)),
        );
      if (record.kind === "validate") {
        await validateSubmission(record);
        await Job.updateOne(
          { _id: record._id },
          { $set: { state: "done", lastError: "" } },
        );
      } else await sendEmail(record);
    } catch (error) {
      await Job.updateOne(
        { _id: record._id, state: { $ne: "uncertain" } },
        {
          $set: {
            state: task.attemptsMade >= 3 ? "failed" : "retry",
            lastError: String(error),
          },
        },
      );
      throw error;
    }
  },
  { connection, concurrency: 3, lockDuration: 30000, maxStalledCount: 2 },
);
worker.on("error", (error) => console.error("Worker error", error));
worker.on("failed", async (task, error) => {
  if (task && task.attemptsMade >= 4)
    await Job.updateOne(
      { _id: task.data.recordId, state: { $nin: ["done", "uncertain"] } },
      { $set: { state: "failed", lastError: error.message } },
    );
});
let busy = false;
async function reconcile() {
  if (busy) return;
  busy = true;
  try {
    await scheduleReminders();
    await cleanupUploads();
    const records = await Job.find({
      state: { $in: ["pending", "retry", "working", "sending"] },
    }).limit(200);
    for (const record of records) {
      const jobId = String(record._id);
      const existing = await queue.getJob(jobId);
      if (existing) {
        const state = await existing.getState();
        if (
          ["failed", "completed"].includes(state) &&
          record.state === "pending"
        )
          await existing.remove();
        else continue;
      }
      await queue.add(
        record.kind,
        { recordId: jobId },
        {
          jobId,
          attempts: 4,
          backoff: { type: "exponential", delay: 2000 },
          removeOnComplete: { age: 3600 },
          removeOnFail: false,
        },
      );
    }
  } catch (error) {
    console.error("Reconciliation failed", String(error));
  } finally {
    busy = false;
  }
}
await reconcile();
const timer = setInterval(() => void reconcile(), 10000);
async function stop() {
  clearInterval(timer);
  await worker.close();
  await queue.close();
  process.exit(0);
}
process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());
console.log("Validation, reminder and email worker ready");
