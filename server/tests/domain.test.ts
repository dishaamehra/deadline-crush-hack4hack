import { describe, it, expect } from "vitest";
import {
  eligibility,
  missing,
  safeEntry,
  csvCell,
  eventSchema,
  httpsUrl,
  eventStatus,
  fingerprint,
} from "../src/domain.js";
import { passwordHash, checkPassword } from "../src/auth.js";
import { inspectZip, sha256, publicAddress } from "../src/validation.js";
const deadline = new Date("2026-11-15T18:29:00Z");
const policy = { deadline, graceMinutes: 5 };
describe("deadline receipt policy", () => {
  it("accepts a receipt at the deadline", () =>
    expect(eligibility(new Date(+deadline - 1), deadline, policy)).toBe(true));
  it("accepts a started upload at the exact grace cutoff", () =>
    expect(eligibility(deadline, new Date(+deadline + 300000), policy)).toBe(
      true,
    ));
  it("marks the next millisecond late", () =>
    expect(eligibility(deadline, new Date(+deadline + 300001), policy)).toBe(
      false,
    ));
  it("rejects an upload initiated during grace", () =>
    expect(
      eligibility(new Date(+deadline + 1), new Date(+deadline + 2), policy),
    ).toBe(false));
  it("honours zero grace", () =>
    expect(
      eligibility(deadline, new Date(+deadline + 1), {
        ...policy,
        graceMinutes: 0,
      }),
    ).toBe(false));
});
describe("input and data boundaries", () => {
  it("lists required missing fields", () =>
    expect(missing({ title: "A" })).toContain("github"));
  it("requires configured extra fields", () =>
    expect(missing({ extra: {} }, ["Video"])).toContain("Video"));
  it("accepts an HTTPS link", () =>
    expect(httpsUrl("https://example.com/demo")).toBe(true));
  it("rejects credential-bearing links", () =>
    expect(httpsUrl("https://user:pass@example.com")).toBe(false));
  it("rejects HTTP links", () =>
    expect(httpsUrl("http://example.com")).toBe(false));
  it("rejects custom ports", () =>
    expect(httpsUrl("https://example.com:123")).toBe(false));
  it("rejects private IPv4", () =>
    expect(publicAddress("127.0.0.1")).toBe(false));
  it("rejects mapped private IPv6", () =>
    expect(publicAddress("::ffff:192.168.1.2")).toBe(false));
  it("rejects link-local metadata addresses", () =>
    expect(publicAddress("169.254.169.254")).toBe(false));
  it("permits public IPs", () => expect(publicAddress("1.1.1.1")).toBe(true));
  it("rejects relative traversal", () =>
    expect(safeEntry("../../secret")).toBe(false));
  it("rejects Windows paths", () =>
    expect(safeEntry("C:\\secret")).toBe(false));
  it("rejects absolute paths", () => expect(safeEntry("/secret")).toBe(false));
  it("permits a normal nested entry", () =>
    expect(safeEntry("src/index.ts")).toBe(true));
  it("neutralises CSV formulas", () =>
    expect(csvCell("=SUM(A1)")).toBe('"\'=SUM(A1)"'));
  it("quotes CSV commas and quotes", () =>
    expect(csvCell('a,"b"')).toBe('"a,""b"""'));
  it("hashes consistently", () =>
    expect(sha256(Buffer.from("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    ));
  it("rejects a renamed non-ZIP", async () =>
    expect(inspectZip(Buffer.from("not a ZIP"))).rejects.toThrow());
  it("rejects a corrupt ZIP header", async () =>
    expect(inspectZip(Buffer.from([80, 75, 3, 4, 0, 0]))).rejects.toThrow());
  it("distinguishes content in request fingerprints", () =>
    expect(fingerprint({ id: 1 })).not.toBe(fingerprint({ id: 2 })));
  it("derives closed registration status", () =>
    expect(
      eventStatus(
        {
          deadline: new Date(+deadline + 100),
          registrationEnd: new Date(+deadline - 100),
        },
        +deadline,
      ),
    ).toBe("In progress"));
  it("derives ended status", () =>
    expect(
      eventStatus({ deadline, registrationEnd: deadline }, +deadline + 1),
    ).toBe("Ended"));
  it("rejects impossible team limits", () =>
    expect(
      eventSchema.safeParse({
        title: "Test event",
        slug: "test-event",
        summary: "A sample event summary",
        organizer: "Demo",
        registrationEnd: deadline.toISOString(),
        deadline: deadline.toISOString(),
        minTeam: 4,
        maxTeam: 2,
      }).success,
    ).toBe(false));
  it("stores salted hashes", () =>
    expect(passwordHash("correct-password")).not.toBe(
      passwordHash("correct-password"),
    ));
  it("verifies a password and rejects a wrong password", () => {
    const hash = passwordHash("correct-password");
    expect(checkPassword("correct-password", hash)).toBe(true);
    expect(checkPassword("wrong-password", hash)).toBe(false);
  });
});
