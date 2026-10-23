import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testUrl = process.env.AUTH_TEST_DATABASE_URL;
const canRun = Boolean(testUrl && /^postgresql:\/\/[^/]+@127\.0\.0\.1:(?!5432\/)[0-9]+\/f1_system$/.test(testUrl));
const userId = `photo-retention-it-${randomUUID()}`;
const actor = { id: `photo-admin-${randomUUID()}`, isSuperAdmin: true, permissions: [] as string[] };
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
let root = "";
let prisma: typeof import("../../src/database/prisma-client").prisma;
let subject: InstanceType<typeof import("../../src/user-admin/user-admin.service").UserAdminService>;
let photoStorage: typeof import("../../src/user-admin/photo-storage");

describe.runIf(canRun)("IT-PH-DB isolated PostgreSQL user-photo retention", () => {
  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "auth-photo-db-it-"));
    vi.stubEnv("DATABASE_URL", testUrl!);
    vi.stubEnv("GMS_STORAGE_ROOT", path.join(root, "storage"));
    ({ prisma } = await import("../../src/database/prisma-client"));
    const { UserAdminService } = await import("../../src/user-admin/user-admin.service");
    photoStorage = await import("../../src/user-admin/photo-storage");
    subject = new UserAdminService({} as never, { evictStatus: vi.fn() } as never);
    const now = new Date();
    await prisma.user.create({ data: {
      id: userId, name: "Photo retention integration", username: `photo-${randomUUID()}@example.test`,
      email: `${userId}@users.invalid`, createdAt: now, updatedAt: now,
    } });
  });

  afterAll(async () => {
    if (prisma) {
      // Remove only isolated test rows; production upload objects are never targeted by cleanup.
      await prisma.storedFile.deleteMany({ where: { sourceType: "auth.user-photo", sourceId: userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
    }
    if (root) await rm(root, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("writes and reads a ready object, replaces it without deleting history, then hides on remove", async () => {
    await subject.putPhoto(actor, userId, "image/jpeg", JPEG);
    const first = await prisma.userPhoto.findUniqueOrThrow({ where: { userId } });
    const firstRecord = await prisma.storedFile.findUniqueOrThrow({ where: { bucket_objectKey: { bucket: "files", objectKey: first.storageKey! } } });
    expect(firstRecord).toMatchObject({ status: "ready", sourceType: "auth.user-photo", sourceId: userId, purgeAfter: null });
    await expect(subject.getPhoto(userId)).resolves.toMatchObject({ data: JPEG, contentType: "image/jpeg" });

    await subject.putPhoto(actor, userId, "image/png", PNG);
    const latest = await prisma.userPhoto.findUniqueOrThrow({ where: { userId } });
    expect(latest.storageKey).not.toBe(first.storageKey);
    const history = await prisma.storedFile.findMany({ where: { sourceType: "auth.user-photo", sourceId: userId }, orderBy: { createdAt: "asc" } });
    expect(history.map((file) => file.status)).toEqual(["deleted", "ready"]);
    expect(await photoStorage.readPhotoObject(first.storageKey!)).toEqual(JPEG);
    expect(await photoStorage.readPhotoObject(latest.storageKey!)).toEqual(PNG);

    await subject.removePhoto(actor, userId);
    expect(await prisma.userPhoto.findUnique({ where: { userId } })).toBeNull();
    expect((await prisma.storedFile.findUniqueOrThrow({ where: { bucket_objectKey: { bucket: "files", objectKey: latest.storageKey! } } })).status).toBe("deleted");
    expect(await photoStorage.readPhotoObject(latest.storageKey!)).toEqual(PNG);
  });

  it("retains photo metadata and bytes after user deletion cascades UserPhoto", async () => {
    await subject.putPhoto(actor, userId, "image/jpeg", JPEG);
    const photo = await prisma.userPhoto.findUniqueOrThrow({ where: { userId } });
    await subject.delete(actor, userId);
    expect(await prisma.userPhoto.findUnique({ where: { userId } })).toBeNull();
    const retained = await prisma.storedFile.findUniqueOrThrow({ where: { bucket_objectKey: { bucket: "files", objectKey: photo.storageKey! } } });
    expect(retained).toMatchObject({ status: "deleted", purgeAfter: null, sourceId: userId });
    expect(await photoStorage.readPhotoObject(photo.storageKey!)).toEqual(JPEG);
  });
});
