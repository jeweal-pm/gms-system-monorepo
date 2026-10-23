import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertSafeKey, buildKey, createStorage, uuidV7, type BucketName } from "../src/index";

async function makeRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "gms-storage-test-"));
}

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

describe("storage key validation (unit)", () => {
  it("GMS-ST-UNIT-01 builds flat module-scoped keys with UUIDv7 filenames", () => {
    const key = buildKey({ module: "company-profile", ext: "png" });
    expect(key).toMatch(/^company-profile\/[0-9a-f-]{36}\.png$/);
    expect(uuidV7()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("GMS-ST-UNIT-04 accepts a module-selected safe filename", () => {
    expect(buildKey({ module: "company-profile", filename: "brand-logo-v2.png" }))
      .toBe("company-profile/brand-logo-v2.png");
  });

  it.each(["", "../secret", "/absolute", "auth\\user", "auth//file", "auth/./file", "auth/../../x", "bad space"]) (
    "GMS-ST-UNIT-02 rejects unsafe key %j",
    (key) => expect(() => assertSafeKey(key)).toThrow("Unsafe storage key"),
  );

  it("GMS-ST-UNIT-03 rejects invalid module names and extensions", () => {
    expect(() => buildKey({ module: "../auth", ext: "png" })).toThrow("Invalid storage key part");
    expect(() => buildKey({ module: "company profile", ext: "png" })).toThrow("Invalid storage key part");
    expect(() => buildKey({ module: "company-profile", ext: "png/other" })).toThrow("Invalid storage key part");
    expect(() => buildKey({ module: "company-profile", filename: "../outside.png" })).toThrow("Invalid storage filename");
    expect(() => buildKey({ module: "company-profile", filename: "logo.png\\\\other" })).toThrow("Invalid storage filename");
  });
});

describe("filesystem storage driver (integration)", () => {
  let root = "";
  let storage: ReturnType<typeof createStorage>;

  beforeEach(async () => {
    root = await makeRoot();
    storage = createStorage(root, { writePrefixes: ["user-photo"], readPrefixes: ["user-photo", "auth/user-photo"] });
  });

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
    root = "";
  });

  it("GMS-ST-INT-01 streams, hashes, stores, reads, and heads an object", async () => {
    const key = "user-photo/photo.png";
    const body = Buffer.from("first chunk: ✨ second chunk");
    const sha256 = createHash("sha256").update(body).digest("hex");
    const result = await storage.putStream("files", key, Readable.from([body.subarray(0, 12), body.subarray(12)]), {
      contentType: "image/png",
      contentLength: body.byteLength,
      sha256,
    });

    expect(result).toMatchObject({ bucket: "files", key, size: body.byteLength, contentType: "image/png", sha256, etag: sha256 });
    await expect(readAll(await storage.get("files", key))).resolves.toEqual(body);
    await expect(storage.head("files", key, "image/png")).resolves.toMatchObject({ size: body.byteLength, contentType: "image/png" });
  });

  it("GMS-ST-INT-02 rejects traversal and never writes outside the bucket", async () => {
    await expect(storage.put("files", "../escaped.txt", Buffer.from("no"), { contentType: "text/plain" })).rejects.toThrow("Unsafe storage key");
    await expect(storage.get("files", "../../outside.txt")).rejects.toThrow("Unsafe storage key");
    await expect(readFile(path.join(root, "escaped.txt"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("GMS-ST-INT-11 prevents writes outside the configured module and legacy prefixes", async () => {
    await expect(storage.put("files", "company-profile/logo.png", Buffer.from("no"), { contentType: "image/png" }))
      .rejects.toThrow("outside the allowed write prefixes");
    await expect(storage.get("files", "company-profile/logo.png"))
      .rejects.toThrow("outside the allowed read prefixes");
    await expect(storage.list("files", "company-profile"))
      .rejects.toThrow("outside the allowed read prefixes");
    const legacy = "auth/user-photo/2026/10/old.png";
    const legacyPath = path.join(root, "files", ...legacy.split("/"));
    await mkdir(path.dirname(legacyPath), { recursive: true });
    await writeFile(legacyPath, "legacy bytes");
    await expect(readAll(await storage.get("files", legacy))).resolves.toEqual(Buffer.from("legacy bytes"));
    await expect(storage.put("files", legacy, Buffer.from("no"), { contentType: "image/png" }))
      .rejects.toThrow("outside the allowed write prefixes");
    await expect(storage.get("files", "auth/admin-keys/old.pem")).rejects.toThrow("outside the allowed read prefixes");
  });

  it("GMS-ST-INT-13 rejects an invalid runtime bucket before path construction", async () => {
    await expect(storage.head("files/../../outside" as BucketName, "user-photo/attack.png"))
      .rejects.toThrow("Invalid storage bucket");
    await expect(readFile(path.join(root, "outside", "user-photo", "attack.png"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("GMS-ST-INT-12 never overwrites an immutable object key", async () => {
    const key = "user-photo/immutable.png";
    const original = Buffer.from("original upload");
    await storage.put("files", key, original, { contentType: "image/png" });
    await expect(storage.put("files", key, Buffer.from("replacement"), { contentType: "image/png" }))
      .rejects.toMatchObject({ code: "EEXIST" });
    await expect(readAll(await storage.get("files", key))).resolves.toEqual(original);
  });

  it.each([
    { caseId: "GMS-ST-INT-03", options: { contentType: "image/png", contentLength: 99 } },
    { caseId: "GMS-ST-INT-04", options: { contentType: "image/png", sha256: "0".repeat(64) } },
    { caseId: "GMS-ST-INT-05", options: { contentType: "image/png", sha256: "not-a-sha256" } },
  ])("$caseId leaves no published object or upload temporary file on validation failure", async ({ options }) => {
    const key = "user-photo/invalid.png";
    await expect(storage.putStream("files", key, Readable.from([Buffer.from("image bytes")]), options)).rejects.toThrow(/mismatch/i);
    await expect(storage.head("files", key)).resolves.toBeNull();
    const targetDirectory = path.join(root, "files", "user-photo");
    await expect(readdir(targetDirectory)).resolves.toEqual([]);
  });

  it("GMS-ST-INT-06 rejects symlink reads/writes and does not list linked files", async (context) => {
    const outside = path.join(root, "outside");
    const bucketDirectory = path.join(root, "files", "user-photo");
    await mkdir(bucketDirectory, { recursive: true });
    await mkdir(outside, { recursive: true });
    await writeFile(path.join(outside, "secret.png"), "outside secret");
    try {
      await symlink(outside, path.join(bucketDirectory, "linked"), process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP"].includes((error as NodeJS.ErrnoException).code ?? "")) {
        context.skip(); // This host cannot create a symlink fixture to exercise the filesystem boundary.
      }
      throw error;
    }

    await expect(storage.get("files", "user-photo/linked/secret.png")).rejects.toThrow(/symbolic link/i);
    await expect(storage.put("files", "user-photo/linked/created.png", Buffer.from("no"), { contentType: "image/png" })).rejects.toThrow(/symbolic link/i);
    await expect(storage.list("files", "user-photo/linked")).rejects.toThrow(/symbolic link/i);
    await expect(readFile(path.join(outside, "created.png"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("GMS-ST-INT-07 safely lists only regular files under the requested prefix with a bounded limit", async () => {
    for (const name of ["a.png", "b.png", "c.png"]) {
      await storage.put("files", `user-photo/${name}`, Buffer.from(name), { contentType: "image/png" });
    }
    await storage.put("files", "user-photo/company-9.png", Buffer.from("logo"), { contentType: "image/png" });

    await expect(storage.list("files", "user-photo", 2)).resolves.toHaveLength(2);
    await expect(storage.list("files", "user-photo")).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "user-photo/a.png" })]),
    );
    await expect(storage.list("files", "../partner")).rejects.toThrow("Unsafe storage key");
    await expect(storage.list("files", "user-photo", 201)).rejects.toThrow("Invalid list limit");
  });

  it.each(["files", "public"] as const)("GMS-ST-INT-08 permanently retains user-uploaded objects in %s, even on delete request", async (bucket) => {
    const key = "user-photo/image.webp";
    const bytes = Buffer.from("uploaded image");
    await storage.put(bucket, key, bytes, { contentType: "image/webp" });

    await expect(storage.delete(bucket, key)).rejects.toThrow("User-uploaded objects are permanently retained");
    await expect(readAll(await storage.get(bucket, key))).resolves.toEqual(bytes);
    await expect(storage.head(bucket, key)).resolves.toMatchObject({ size: bytes.byteLength });
  });

  it("GMS-ST-INT-09 permits explicit deletion only in system-generated buckets", async () => {
    for (const bucket of ["documents", "exports"] as const) {
      const key = "user-photo/report.pdf";
      await storage.put(bucket, key, Buffer.from("generated report"), { contentType: "application/pdf" });
      await storage.delete(bucket, key);
      await expect(storage.head(bucket, key)).resolves.toBeNull();
    }
  });

  it("GMS-ST-INT-10 removes only an incomplete temporary upload after a stream failure", async () => {
    const failedBody = new Readable({
      read() {
        this.push(Buffer.from("partial"));
        this.destroy(new Error("simulated source failure"));
      },
    });
    const key = "user-photo/interrupted.png";
    await expect(storage.putStream("files", key, failedBody, { contentType: "image/png" })).rejects.toThrow("simulated source failure");
    await expect(storage.head("files", key)).resolves.toBeNull();
    await expect(readdir(path.join(root, "files", "user-photo"))).resolves.toEqual([]);
  });
});
