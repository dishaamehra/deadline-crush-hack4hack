import { createTransport } from "nodemailer";
import "./config.js";

if (process.env.NODE_ENV === "production")
  throw new Error("This smoke command is for local development only");

const mail = createTransport({
  host: process.env.SMTP_HOST || "localhost",
  port: Number(process.env.SMTP_PORT || 1025),
  secure: process.env.SMTP_SECURE === "true",
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
    : undefined,
});
try {
  const result = await mail.sendMail({
    from: process.env.EMAIL_FROM || "Deadline Crush <demo@localhost>",
    to: "organiser@example.test",
    subject: "Deadline Crush local email smoke test",
    text: "Mailpit received this message from the local application SMTP configuration. This is not a deadline reminder.",
  });
  console.log("SMTP accepted:", result.accepted.join(", "));
  console.log("Open http://localhost:8025 to inspect the message in Mailpit.");
} finally {
  mail.close();
}
