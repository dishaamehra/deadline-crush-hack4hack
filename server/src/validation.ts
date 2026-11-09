import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { Agent, request } from "undici";
import yauzl from "yauzl";
import { MAX_FILE } from "./config.js";
import { safeEntry, httpsUrl } from "./domain.js";
export class InvalidFile extends Error {}
export function publicAddress(address: string) {
  const parsed = ipaddr.process(address);
  return parsed.range() === "unicast";
}
export async function checkLink(value: string, redirects = 0): Promise<void> {
  if (!httpsUrl(value))
    throw new InvalidFile("Project links must be HTTPS URLs");
  const url = new URL(value);
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new InvalidFile(
      "Project link points to a private or reserved address",
    );
  const chosen = addresses[0];
  const agent = new Agent({
    connect: {
      lookup: (_host, _options, callback: any) =>
        callback(null, chosen.address, chosen.family),
        family: chosen.family,
        autoSelectFamily: false,

    },
  });
  try {
    const response = await request(url, {
      method: "HEAD",
      dispatcher: agent,
      headersTimeout: 10000,
      bodyTimeout: 10000,
    });
    await response.body.dump();
    if (
      response.statusCode >= 300 &&
      response.statusCode < 400 &&
      response.headers.location
    ) {
      if (redirects >= 3) throw new InvalidFile("Too many redirects");
      return await checkLink(
        new URL(String(response.headers.location), url).href,
        redirects + 1,
      );
    }
    if (response.statusCode === 429 || response.statusCode >= 500)
      throw new Error("Temporary link service failure");
    if (response.statusCode >= 400)
      throw new InvalidFile("Link returned HTTP " + response.statusCode);
  } finally {
    await agent.close();
  }
}
export async function collectFile(body: any): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const part of body) {
    size += part.length;
    if (size > MAX_FILE) throw new InvalidFile("File exceeds 100 MiB");
    chunks.push(Buffer.from(part));
  }
  return Buffer.concat(chunks);
}
export function sha256(data: Buffer) {
  return createHash("sha256").update(data).digest("hex");
}
export async function inspectZip(data: Buffer): Promise<string> {
  if (data.length < 4 || data.readUInt32LE(0) !== 0x04034b50)
    throw new InvalidFile("File content is not a nonempty ZIP archive");
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(
      data,
      { lazyEntries: true, validateEntrySizes: true },
      (error, zip) => {
        if (error || !zip)
          return reject(new InvalidFile("ZIP archive cannot be opened"));
        let count = 0,
          total = 0,
          preview = "",
          settled = false;
        const fail = (message: string) => {
          if (settled) return;
          settled = true;
          zip.close();
          reject(new InvalidFile(message));
        };
        zip.on("error", () => fail("ZIP integrity check failed"));
        zip.on("entry", (entry) => {
          count++;
          if (count > 5000 || !safeEntry(entry.fileName))
            return fail("Archive entry limit or path rule violated");
          if (entry.generalPurposeBitFlag & 1)
            return fail("Encrypted archives are unsupported");
          if (/\.(zip|7z|rar|tar|gz)$/i.test(entry.fileName))
            return fail("Nested archives are unsupported");
          const mode = (entry.externalFileAttributes >>> 16) & 0xf000;
          if (mode === 0xa000) return fail("Symbolic links are unsupported");
          if (
            entry.uncompressedSize > 500 * 1024 * 1024 ||
            entry.uncompressedSize / Math.max(1, entry.compressedSize) > 100
          )
            return fail("Archive expansion limit exceeded");
          if (entry.fileName.endsWith("/")) return zip.readEntry();
          zip.openReadStream(entry, (err, stream) => {
            if (err || !stream) return fail("Archive entry cannot be read");
            let readme = Buffer.alloc(0),
              entryBytes = 0;
            stream.on("data", (chunk: Buffer) => {
              total += chunk.length;
              entryBytes += chunk.length;
              if (
                total > 500 * 1024 * 1024 ||
                entryBytes > entry.uncompressedSize
              ) {
                stream.destroy();
                return fail("Archive expansion limit exceeded");
              }
              if (
                /(^|\/)readme(\.md|\.txt)?$/i.test(entry.fileName) &&
                readme.length < 32000
              )
                readme = Buffer.concat([readme, chunk]).subarray(0, 32000);
            });
            stream.on("error", () =>
              fail("Archive entry decompression failed"),
            );
            stream.on("end", () => {
              if (settled) return;
              if (readme.length && !preview) preview = readme.toString("utf8");
              zip.readEntry();
            });
          });
        });
        zip.on("end", () => {
          if (!settled) {
            settled = true;
            resolve(preview || "No README was included.");
          }
        });
        zip.readEntry();
      },
    );
  });
}
