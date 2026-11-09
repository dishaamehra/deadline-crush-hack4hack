import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { Session, User } from "./models.js";
import { config } from "./config.js";
import { HttpError } from "./domain.js";
export type AuthRequest = Request & { user?: any };
export function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function checkPassword(password: string, hash: string) {
  const [salt, expected] = hash.split(":");
  return timingSafeEqual(
    scryptSync(password, salt, 64),
    Buffer.from(expected, "hex"),
  );
}
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function establish(res: Response, user: any) {
  const token = randomBytes(32).toString("hex");
  await Session.create({
    token: digest(token),
    userId: user._id,
    expiresAt: new Date(Date.now() + 7 * 86400000),
  });
  res.cookie("deadline_session", token, {
    httpOnly: true,
    secure: config.production,
    sameSite: "lax",
    maxAge: 7 * 86400000,
    path: "/",
  });
}
export async function identify(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
) {
  try {
    req.user = undefined;
    if (req.cookies.deadline_session) {
      const session = await Session.findOne({
        token: digest(req.cookies.deadline_session),
        expiresAt: { $gt: new Date() },
      });
      if (session)
        req.user = await User.findById(session.userId).select("-password");
    }
    next();
  } catch (error) {
    next(error);
  }
}
export function authenticated(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
) {
  if (!req.user) return next(new HttpError(401, "Sign in to continue"));
  next();
}
export async function logout(req: AuthRequest, res: Response) {
  if (req.cookies.deadline_session)
    await Session.deleteOne({ token: digest(req.cookies.deadline_session) });
  res.clearCookie("deadline_session", { path: "/" }).json({ ok: true });
}
