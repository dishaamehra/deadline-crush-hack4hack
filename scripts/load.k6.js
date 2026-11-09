import http from "k6/http";
import { check, fail } from "k6";
import crypto from "k6/crypto";
import exec from "k6/execution";
import { SharedArray } from "k6/data";
const accounts = new SharedArray("accounts", () =>
  JSON.parse(open("../load-accounts.json")),
);
const archive = open("./fixtures/project.zip", "b");
const digest = crypto.sha256(archive, "hex");
export const options = {
  scenarios: {
    submissions: {
      executor: "shared-iterations",
      vus: Number(__ENV.VUS || 100),
      iterations: accounts.length,
      maxDuration: "10m",
    },
  },
  thresholds: {
    "http_req_duration{kind:api}": ["p(95)<300"],
    checks: ["rate==1"],
  },
};
const base = __ENV.BASE_URL || "http://localhost:4000";
const headers = {
  "Content-Type": "application/json",
  Origin: __ENV.APP_URL || "http://localhost:5173",
};
function post(path, body) {
  const r = http.post(base + "/api" + path, JSON.stringify(body), {
    headers,
    tags: { kind: "api", name: path.replace(/[a-f0-9]{24}/g, ":id") },
  });
  if (r.status >= 300) fail(path + " failed " + r.status + " " + r.body);
  return r.json();
}
export default function () {
  const account = accounts[exec.scenario.iterationInTest];
  post("/auth/login", { email: account.email, password: account.password });
  const { upload } = post("/teams/" + account.teamId + "/uploads", {
    filename: "project.zip",
    size: archive.byteLength,
    hash: digest,
  });
  const { url } = post("/uploads/" + upload._id + "/sign", { part: 1 });
  const transfer = http.put(url, archive, { tags: { kind: "storage" } });
  check(transfer, { "storage accepted": (r) => r.status === 200 });
  post("/uploads/" + upload._id + "/complete", {});
  const key =
    "00000000-0000-4000-8000-" +
    String(exec.scenario.iterationInTest).padStart(12, "0");
  const first = post("/uploads/" + upload._id + "/finalise", { key });
  const repeat = post("/uploads/" + upload._id + "/finalise", { key });
  check(repeat, {
    "same receipt after retry": (r) =>
      r.submission._id === first.submission._id,
  });
}
