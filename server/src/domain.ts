import { createHash } from "node:crypto";
import { z } from "zod";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function requireCondition(
  condition: unknown,
  status: number,
  message: string,
): asserts condition {
  if (!condition) throw new HttpError(status, message);
}
export const projectSchema = z.object({
  title: z.string().max(120).default(""),
  shortDescription: z.string().max(300).default(""),
  description: z.string().max(10000).default(""),
  stack: z.string().max(500).default(""),
  github: z.string().max(2048).default(""),
  demo: z.string().max(2048).default(""),
  extra: z.record(z.string(), z.string().max(3000)).default({}),
});
export const eventSchema = z
  .object({
    title: z.string().min(4).max(120),
    slug: z.string().regex(/^[a-z0-9-]{4,100}$/),
    summary: z.string().min(10).max(1000),
    organizer: z.string().min(2).max(100),
    mode: z.enum(["Online", "Offline", "Hybrid"]).default("Online"),
    city: z.string().max(100).default(""),
    format: z.string().max(50).default("Hackathon"),
    theme: z.string().max(50).default("Open Innovation"),
    fee: z.enum(["Free", "Paid"]).default("Free"),
    prize: z.string().max(180).default(""),
    prizeAmount: z.number().min(0).default(0),
    featured: z.boolean().default(false),
    minTeam: z.number().int().min(1).max(20).default(2),
    maxTeam: z.number().int().min(1).max(20).default(4),
    registrationEnd: z.string().datetime({ offset: true }),
    deadline: z.string().datetime({ offset: true }),
    graceMinutes: z.number().int().min(0).max(60).default(5),
    overview: z.string().max(12000).default(""),
    rules: z.string().max(6000).default(""),
    eligibility: z.string().max(1000).default(""),
    requirements: z.array(z.string().min(1).max(80)).max(10).default([]),
    announcements: z.array(z.string().max(1000)).max(20).default([]),
    faqs: z
      .array(
        z.object({
          question: z.string().max(300),
          answer: z.string().max(2000),
        }),
      )
      .max(20)
      .default([]),
  })
  .refine((e) => e.maxTeam >= e.minTeam, {
    message: "Maximum team size must cover the minimum",
  })
  .refine((e) => Date.parse(e.registrationEnd) <= Date.parse(e.deadline), {
    message: "Registration must close before submissions",
  });
export function missing(project: any, requirements: string[] = []) {
  const result = [
    "title",
    "shortDescription",
    "description",
    "stack",
    "github",
    "demo",
  ].filter((k) => !project?.[k]?.trim());
  for (const k of requirements)
    if (!project?.extra?.[k]?.trim()) result.push(k);
  return result;
}
export function httpsUrl(value: string) {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      (!u.port || u.port === "443")
    );
  } catch {
    return false;
  }
}
export function eligibility(start: Date, receipt: Date, policy: any) {
  const deadline = new Date(policy.deadline).getTime();
  return (
    receipt.getTime() <= deadline ||
    (start.getTime() <= deadline &&
      receipt.getTime() <= deadline + policy.graceMinutes * 60000)
  );
}
export function fingerprint(value: any) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function safeEntry(name: string) {
  return (
    !name.includes("\\") &&
    !name.startsWith("/") &&
    !/^[a-z]:/i.test(name) &&
    !name.split("/").includes("..") &&
    !name.includes("\0")
  );
}
export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function eventStatus(event: any, now = Date.now()) {
  if (now > new Date(event.deadline).getTime()) return "Ended";
  if (now > new Date(event.registrationEnd).getTime()) return "In progress";
  return "Open";
}
