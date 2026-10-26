import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/** IT-PH-01…04: user-admin service + real @gms/storage fs adapter + isolated persistence boundary. */
const state = vi.hoisted(() => ({
  photo: null as any,
  storedFiles: [] as any[],
  prisma: {
    userPhoto: { findUnique: vi.fn() },
    storedFile: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
  tx: {
    $queryRaw: vi.fn(),
    userPermission: { findMany: vi.fn() },
    userPhoto: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    storedFile: { create: vi.fn(), updateMany: vi.fn() },
    user: { delete: vi.fn() },
  },
}));

vi.mock("../../src/auth/auth", () => ({ auth: { api: { getSession: vi.fn() } }, hashLoginIdentity: () => "hash" }));
vi.mock("../../src/database/prisma-client", () => ({ prisma: state.prisma }));
vi.mock("better-auth/node", () => ({ fromNodeHeaders: (headers: unknown) => headers }));
vi.mock("argon2", () => ({ hash: vi.fn(async () => "argon-hash"), argon2id: 2 }));

const ADMIN_ID = "00000000-0000-4000-8000-000000000001";
const TARGET_ID = "00000000-0000-4000-8000-000000000002";
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const actor = { id: ADMIN_ID, isSuperAdmin: true, permissions: [] as string[] };
let root = "";
let subject: InstanceType<(typeof import("../../src/user-admin/user-admin.service"))["UserAdminService"]>;
let photoStorage: typeof import("../../src/user-admin/photo-storage");

beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "auth-photo-retention-it-"));
  process.env.GMS_STORAGE_ROOT = path.join(root, "storage");
  const userAdmin = await import("../../src/user-admin/user-admin.service");
  photoStorage = await import("../../src/user-admin/photo-storage");
  subject = new userAdmin.UserAdminService({} as never, { evictStatus: vi.fn() } as never);
});

afterAll(async () => {
  delete process.env.GMS_STORAGE_ROOT;
  await rm(root, { recursive: true, force: true });
});

beforeEach(() => {
  vi.clearAllMocks();
  state.photo = null;
  state.storedFiles.splice(0);
  state.tx.$queryRaw.mockResolvedValue([{ role: "user" }]);
  state.tx.userPhoto.findUnique.mockImplementation(async () => state.photo ? { ...state.photo } : null);
  state.prisma.userPhoto.findUnique.mockImplementation(async () => state.photo ? { ...state.photo } : null);
  state.prisma.storedFile.findUnique.mockImplementation(async ({ where }: any) =>
    state.storedFiles.find((file) => file.bucket === where.bucket_objectKey.bucket && file.objectKey === where.bucket_objectKey.objectKey) ?? null);
  state.tx.userPhoto.upsert.mockImplementation(async ({ create, update }: any) => {
    state.photo = { ...state.photo, ...(state.photo ? update : create) };
    return state.photo;
  });
  state.tx.userPhoto.deleteMany.mockImplementation(async () => {
    state.photo = null;
    return { count: 1 };
  });
  state.tx.storedFile.create.mockImplementation(async ({ data }: any) => {
    state.storedFiles.push({ ...data });
    return data;
  });
  state.tx.storedFile.updateMany.mockImplementation(async ({ where, data }: any) => {
    let count = 0;
    for (const file of state.storedFiles) {
      if (file.bucket === where.bucket && file.objectKey === where.objectKey && file.status === where.status) {
        Object.assign(file, data);
        count += 1;
      }
    }
    return { count };
  });
  state.tx.user.delete.mockImplementation(async () => {
    state.photo = null; // represent the UserPhoto FK cascade; StoredFile is intentionally independent.
    return { id: TARGET_ID };
  });
  state.prisma.$transaction.mockImplementation(async (callback: (tx: typeof state.tx) => unknown) => callback(state.tx));
});

describe("GMS user-photo retention through user-admin", () => {
  it("IT-PH-01 uploads and reads the active object with ready metadata", async () => {
    await subject.putPhoto(actor, TARGET_ID, "image/jpeg", JPEG);
    expect(state.photo).toMatchObject({ contentType: "image/jpeg", storageKey: expect.stringMatching(/^user-photo\//) });
    expect(state.storedFiles).toHaveLength(1);
    expect(state.storedFiles[0]).toMatchObject({ status: "ready", bucket: "files", sourceType: "auth.user-photo", sourceId: TARGET_ID, purgeAfter: null });
    await expect(subject.getPhoto(TARGET_ID)).resolves.toEqual({ data: JPEG, contentType: "image/jpeg", version: state.photo.sha256.slice(0, 16) });
  });

  it("IT-PH-02 replacement switches the active association but retains old metadata and both byte objects", async () => {
    await subject.putPhoto(actor, TARGET_ID, "image/jpeg", JPEG);
    const oldKey = state.photo.storageKey as string;
    await subject.putPhoto(actor, TARGET_ID, "image/png", PNG);
    const newKey = state.photo.storageKey as string;
    expect(newKey).not.toBe(oldKey);
    expect(state.storedFiles.map((item: any) => item.status).sort()).toEqual(["deleted", "ready"]);
    expect(state.storedFiles).toHaveLength(2);
    expect(await photoStorage.readPhotoObject(oldKey)).toEqual(JPEG);
    expect(await photoStorage.readPhotoObject(newKey)).toEqual(PNG);
  });

  it("IT-PH-03 UI remove hides the association and retains metadata and readable bytes", async () => {
    await subject.putPhoto(actor, TARGET_ID, "image/jpeg", JPEG);
    const key = state.photo.storageKey as string;
    await expect(subject.removePhoto(actor, TARGET_ID)).resolves.toEqual({ ok: true });
    expect(state.photo).toBeNull();
    expect(state.storedFiles).toHaveLength(1);
    expect(state.storedFiles[0]).toMatchObject({ objectKey: key, status: "deleted", purgeAfter: null });
    await expect(photoStorage.readPhotoObject(key)).resolves.toEqual(JPEG);
    await expect(subject.getPhoto(TARGET_ID)).rejects.toMatchObject({ status: 404 });
  });

  it("IT-PH-04 account deletion retains a tombstone and readable photo bytes after UserPhoto cascade", async () => {
    await subject.putPhoto(actor, TARGET_ID, "image/jpeg", JPEG);
    const key = state.photo.storageKey as string;
    await subject.delete(actor, TARGET_ID);
    expect(state.photo).toBeNull();
    expect(state.storedFiles).toHaveLength(1);
    expect(state.storedFiles[0]).toMatchObject({ objectKey: key, status: "deleted", purgeAfter: null });
    await expect(photoStorage.readPhotoObject(key)).resolves.toEqual(JPEG);
  });
});