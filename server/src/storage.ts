import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  ListPartsCommand,
  CompleteMultipartUploadCommand,
  HeadObjectCommand,
  GetObjectCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config, PART_SIZE } from "./config.js";
import { requireCondition } from "./domain.js";
const options = {
  region: config.region,
  forcePathStyle: true,
  credentials: {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  },
};
const s3 = new S3Client({ ...options, endpoint: config.endpoint });
const publicS3 = new S3Client({ ...options, endpoint: config.publicEndpoint });
const identity = (u: any) => ({
  Bucket: config.bucket,
  Key: u.key,
  UploadId: u.storageId,
});
export async function initiate(key: string) {
  return (
    await s3.send(
      new CreateMultipartUploadCommand({
        Bucket: config.bucket,
        Key: key,
        ContentType: "application/zip",
      }),
    )
  ).UploadId!;
}
export async function parts(u: any) {
  const result = await s3.send(new ListPartsCommand(identity(u)));
  return (result.Parts || []).map((p) => ({
    part: p.PartNumber!,
    etag: p.ETag!,
    size: p.Size!,
  }));
}
export async function sign(u: any, part: number) {
  const expected = Math.min(PART_SIZE, u.size - (part - 1) * PART_SIZE);
  requireCondition(expected > 0 && part >= 1, 400, "Invalid part number");
  return getSignedUrl(
    publicS3,
    new UploadPartCommand({
      ...identity(u),
      PartNumber: part,
      ContentLength: expected,
    }),
    { expiresIn: 900 },
  );
}
export async function head(u: any) {
  return s3.send(new HeadObjectCommand({ Bucket: config.bucket, Key: u.key }));
}
export async function complete(u: any) {
  try {
    const existing = await head(u);
    requireCondition(
      existing.ContentLength === u.size,
      400,
      "Stored object size mismatch",
    );
    return;
  } catch (error: any) {
    if (error.$metadata?.httpStatusCode !== 404 && error.name !== "NotFound")
      throw error;
  }
  const uploaded = await parts(u);
  const total = Math.ceil(u.size / PART_SIZE);
  requireCondition(
    uploaded.length === total,
    409,
    "Upload every part before completion",
  );
  for (let i = 0; i < total; i++)
    requireCondition(
      uploaded[i].part === i + 1 &&
        uploaded[i].size === Math.min(PART_SIZE, u.size - i * PART_SIZE),
      400,
      "Part size mismatch",
    );
  await s3.send(
    new CompleteMultipartUploadCommand({
      ...identity(u),
      MultipartUpload: {
        Parts: uploaded.map((p) => ({ PartNumber: p.part, ETag: p.etag })),
      },
    }),
  );
  const stored = await head(u);
  requireCondition(
    stored.ContentLength === u.size,
    400,
    "Stored object size mismatch",
  );
}
export async function read(u: any) {
  return (
    await s3.send(new GetObjectCommand({ Bucket: config.bucket, Key: u.key }))
  ).Body!;
}
export async function download(u: any) {
  return getSignedUrl(
    publicS3,
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: u.key,
      ResponseContentDisposition: "attachment",
    }),
    { expiresIn: 120 },
  );
}
export async function abort(u: any) {
  await s3.send(new AbortMultipartUploadCommand(identity(u)));
}
