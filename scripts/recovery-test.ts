import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { connect, Job, Submission } from "../server/src/models.js";
import { config } from "../server/src/config.js";
await connect();
const url = "http://localhost:" + config.port;
let cookie = "";
async function call(path: string, method = "GET", body?: any) {
  const r = await fetch(url + "/api" + path, {
    method,
    headers: {
      Origin: config.origin,
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.headers.get("set-cookie"))
    cookie = r.headers.get("set-cookie")!.split(";")[0];
  const data: any = await r.json();
  if (!r.ok) throw new Error(data.error);
  return data;
}
await call("/auth/login", "POST", {
  email: "dishaa@example.test",
  password: process.env.DEMO_PASSWORD,
});
const { programs } = await call("/programs");
const teamId = programs[0].team._id;
const file = await readFile("scripts/fixtures/project.zip");
const { upload } = await call("/teams/" + teamId + "/uploads", "POST", {
  filename: "project.zip",
  size: file.length,
  hash: createHash("sha256").update(file).digest("hex"),
});
const { url: signed } = await call("/uploads/" + upload._id + "/sign", "POST", {
  part: 1,
});
const response = await fetch(signed, { method: "PUT", body: file });
if (!response.ok) throw new Error("Storage failed");
await call("/uploads/" + upload._id + "/complete", "POST", {});
const { submission } = await call(
  "/uploads/" + upload._id + "/finalise",
  "POST",
  { key: randomUUID() },
);
const start = (delay: string) =>
  spawn(process.execPath, ["--import", "tsx", "server/src/worker.ts"], {
    env: { ...process.env, TEST_WORKER_DELAY_MS: delay },
    stdio: "inherit",
  });
let worker = start("60000");
async function until(predicate: () => Promise<boolean>, timeout = 120000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Recovery timed out");
}
try {
  await until(
    async () =>
      !!(await Job.exists({ submissionId: submission._id, state: "working" })),
  );
  worker.kill("SIGKILL");
  await new Promise((resolve) => worker.once("exit", resolve));
  worker = start("0");
  await until(
    async () =>
      !!(await Job.exists({ submissionId: submission._id, state: "done" })),
  );
  const count = await Submission.countDocuments({ _id: submission._id });
  if (count !== 1) throw new Error("Receipt count changed");
  console.log(
    "Worker crash recovery passed. Receipt " +
      submission._id +
      " remains unique.",
  );
} finally {
  worker.kill("SIGTERM");
}
process.exit(0);
