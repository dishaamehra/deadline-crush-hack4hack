import dotenv from "dotenv";
import { resolve } from "node:path";
dotenv.config({
  path: resolve(
    process.cwd(),
    process.cwd().endsWith("server") ? "../.env" : ".env",
  ),
});
export const config = {
  port: Number(process.env.PORT || 4000),
  mongo:
    process.env.MONGODB_URI ||
    "mongodb://localhost:27017/deadline?replicaSet=rs0&directConnection=true",
  redis: process.env.REDIS_URL || "redis://localhost:6379",
  origin: process.env.APP_URL || "http://localhost:5173",
  production: process.env.NODE_ENV === "production",
  bucket: process.env.S3_BUCKET || "deadline",
  endpoint: process.env.S3_ENDPOINT || "http://localhost:9000",
  publicEndpoint:
    process.env.S3_PUBLIC_ENDPOINT ||
    process.env.S3_ENDPOINT ||
    "http://localhost:9000",
  region: process.env.S3_REGION || "us-east-1",
  accessKeyId: process.env.S3_ACCESS_KEY || "local-development",
  secretAccessKey: process.env.S3_SECRET_KEY || "local-development-secret",
};
export const MAX_FILE = 100 * 1024 * 1024;
export const PART_SIZE = 8 * 1024 * 1024;

if (config.production) {
  for (const key of [
    "APP_URL",
    "MONGODB_URI",
    "REDIS_URL",
    "S3_ENDPOINT",
    "S3_ACCESS_KEY",
    "S3_SECRET_KEY",
  ]) {
    if (!process.env[key])
      throw new Error("Production configuration requires " + key);
  }
  if (!config.origin.startsWith("https://"))
    throw new Error("Production APP_URL must use HTTPS");
  if (config.accessKeyId === "local-development")
    throw new Error("Configure production object-store credentials");
}
