import { HttpException } from "@nestjs/common";
import type { Request } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
// Static import is fine: vi.mock calls are hoisted above it (no top-level await).
import { UserAdminService } from "../../src/user-admin/user-admin.service";

/**
 * UT-DA-S01…S11: UserAdminService enforces delegated-admin.md DA-01…05; UT-PH-S01…S06: user photos
 * (user-photo.md PH-02/05/06/09). Prisma, better-auth, Argon2 and the photo files are mocked.
 */

const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    user: { update: vi.fn(), delete: vi.fn() },
    userPermission: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    userLocation: { deleteMany: vi.fn(), createMany: vi.fn() },
    account: { updateMany: vi.fn(), create: vi.fn() },
    loginLockout: { deleteMany: vi.fn() },
    session: { deleteMany: vi.fn() },
    userPhoto: { upsert: vi.fn(), deleteMany: vi.fn() },
  };
  return {
    tx,
    getSession: vi.fn(),
    files: { replacePhotoFile: vi.fn(async () => undefined), readPhotoFile: vi.fn(), removePhotoFile: vi.fn(async () => undefined) },
    prisma: {
      user: { findUnique: vi.fn(), findMany: vi.fn() },
      userPermission: { findMany: vi.fn() },
      userPhoto: { findUnique: vi.fn() },
      $transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
    },
  };
});

vi.mock("../../src/auth/auth", () => ({ auth: { api: { getSession: mocks.getSession } }, hashLoginIdentity: () => "hash" }));
vi.mock("../../src/database/prisma-client", () => ({ prisma: mocks.prisma }));
vi.mock("better-auth/node", () => ({ fromNodeHeaders: (headers: unknown) => headers }));
vi.mock("argon2", () => ({ hash: vi.fn(async () => "argon-hash"), argon2id: 2 }));
vi.mock("../../src/user-admin/photo-storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/user-admin/photo-storage")>()),
  ...mocks.files,
}));

type Service = InstanceType<typeof UserAdminService>;

const ADMIN_ID = "00000000-0000-4000-8000-000000000001";
const TARGET_ID = "00000000-0000-4000-8000-000000000002";
const request = { headers: {} } as Request;

function grantRows(keys: string[]) {
  return keys.map((key) => {
    const [menuKey, action] = key.split(":");
    return { menuKey, action };
  });
}

function service(): Service {
  const license = { resolveStatus: vi.fn(async () => ({ state: "VALID" })), evictStatus: vi.fn() };
  const provisioning = { provision: vi.fn(async () => ({ id: TARGET_ID, updatedAt: new Date("2026-10-17T00:00:00Z") })), countSeats: vi.fn(async () => 1) };
  return new UserAdminService(provisioning as never, license as never);
}

/** Signs in a regular user holding `keys` (loadSessionAuthz reads them through prisma.userPermission). */
function signInAs(keys: string[], role = "user") {
  mocks.getSession.mockResolvedValue({ user: { id: ADMIN_ID, role, active: true, username: "admin" } });
  mocks.prisma.userPermission.findMany.mockResolvedValue(grantRows(keys));
}

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof HttpException) {
      const body = error.getResponse() as { error: { code: string } };
      return { status: error.getStatus(), code: body.error.code };
    }
    throw error;
  }
  throw new Error("expected the call to fail");
}

const createBody = (permissions: string[]) => ({
  username: "new.user",
  password: "pass1234",
  name: "New User",
  phone: null,
  locationKeys: ["primary"],
  active: true,
  permissions,
});

const ADMIN_GRANTS = ["user-and-permission:VIEW", "user-and-permission:ADD", "user-and-permission:EDIT", "user-and-permission:DELETE", "vendor:VIEW", "vendor:ADD"];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.files.removePhotoFile.mockResolvedValue(undefined);
  mocks.tx.user.update.mockResolvedValue({ updatedAt: new Date("2026-10-17T01:00:00Z") });
});

describe("requireAccess (DA-01)", () => {
  it("UT-DA-S01 a user without user-and-permission:VIEW is denied with PERMISSION_DENIED", async () => {
    signInAs(["vendor:VIEW"]);
    expect(await failure(service().requireAccess(request, "VIEW"))).toEqual({ status: 403, code: "PERMISSION_DENIED" });
  });

  it("UT-DA-S02 VIEW does not grant ADD/EDIT/DELETE", async () => {
    signInAs(["user-and-permission:VIEW"]);
    const subject = service();
    await expect(subject.requireAccess(request, "VIEW")).resolves.toMatchObject({ id: ADMIN_ID, isSuperAdmin: false });
    for (const action of ["ADD", "EDIT", "DELETE"] as const) {
      expect(await failure(subject.requireAccess(request, action))).toEqual({ status: 403, code: "PERMISSION_DENIED" });
    }
  });

  it("UT-DA-S03 Super Admin passes without a grant lookup", async () => {
    signInAs([], "admin");
    await expect(service().requireAccess(request, "DELETE")).resolves.toEqual({ id: ADMIN_ID, isSuperAdmin: true, permissions: [] });
    expect(mocks.prisma.userPermission.findMany).not.toHaveBeenCalled();
  });
});

describe("create / update grants (DA-02)", () => {
  it("UT-DA-S04 create rejects a permission the admin does not hold", async () => {
    signInAs(ADMIN_GRANTS);
    const subject = service();
    const actor = await subject.requireAccess(request, "ADD");
    expect(await failure(subject.create(actor, createBody(["vendor:VIEW", "vendor:DELETE"])))).toEqual({ status: 403, code: "PERMISSION_GRANT_NOT_ALLOWED" });
  });

  it("UT-DA-S05 create succeeds with grants the admin holds", async () => {
    signInAs(ADMIN_GRANTS);
    const subject = service();
    const actor = await subject.requireAccess(request, "ADD");
    await expect(subject.create(actor, createBody(["vendor:VIEW", "vendor:ADD"]))).resolves.toMatchObject({ id: TARGET_ID });
  });

  it("UT-DA-S06 update rejects adding a permission the admin does not hold", async () => {
    signInAs(ADMIN_GRANTS);
    const subject = service();
    const actor = await subject.requireAccess(request, "EDIT");
    expect(await failure(subject.update(actor, TARGET_ID, { permissions: ["sale:VIEW"] }))).toEqual({ status: 403, code: "PERMISSION_GRANT_NOT_ALLOWED" });
  });
});

describe("manageable targets (DA-03…05)", () => {
  it("UT-DA-S07 update of a user holding more than the admin is USER_NOT_MANAGEABLE (before Argon2)", async () => {
    signInAs(ADMIN_GRANTS);
    const subject = service();
    const actor = await subject.requireAccess(request, "EDIT");
    mocks.prisma.user.findUnique.mockResolvedValue({ role: "user", permissions: grantRows(["sale:VIEW"]) });
    expect(await failure(subject.update(actor, TARGET_ID, { name: "Renamed", password: "newpass1" }))).toEqual({ status: 403, code: "USER_NOT_MANAGEABLE" });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("UT-DA-S08 a delegated admin can't edit a Super Admin or their own account", async () => {
    signInAs(ADMIN_GRANTS);
    const subject = service();
    const actor = await subject.requireAccess(request, "EDIT");
    mocks.prisma.user.findUnique.mockResolvedValue({ role: "admin", permissions: [] });
    expect(await failure(subject.update(actor, TARGET_ID, { name: "X" }))).toEqual({ status: 403, code: "USER_NOT_MANAGEABLE" });
    mocks.prisma.user.findUnique.mockResolvedValue({ role: "user", permissions: [] });
    expect(await failure(subject.update(actor, ADMIN_ID, { name: "Me" }))).toEqual({ status: 403, code: "USER_NOT_MANAGEABLE" });
  });

  it("UT-DA-S09 the row-locked re-check also blocks a target that gained grants meanwhile", async () => {
    signInAs(ADMIN_GRANTS);
    const subject = service();
    const actor = await subject.requireAccess(request, "EDIT");
    mocks.prisma.user.findUnique.mockResolvedValue({ role: "user", permissions: grantRows(["vendor:VIEW"]) });
    mocks.tx.$queryRaw.mockResolvedValue([{ role: "user", username: "target", updatedAt: new Date() }]);
    mocks.tx.userPermission.findMany.mockResolvedValue(grantRows(["vendor:VIEW", "sale:DELETE"]));
    expect(await failure(subject.update(actor, TARGET_ID, { name: "Renamed" }))).toEqual({ status: 403, code: "USER_NOT_MANAGEABLE" });
    expect(mocks.tx.user.update).not.toHaveBeenCalled();
  });

  it("UT-DA-S10 delete: unmanageable target refused; manageable target deleted", async () => {
    signInAs(ADMIN_GRANTS);
    const subject = service();
    const actor = await subject.requireAccess(request, "DELETE");
    mocks.tx.$queryRaw.mockResolvedValue([{ role: "user" }]);
    mocks.tx.userPermission.findMany.mockResolvedValue(grantRows(["sale:VIEW"]));
    expect(await failure(subject.delete(actor, TARGET_ID))).toEqual({ status: 403, code: "USER_NOT_MANAGEABLE" });
    expect(mocks.tx.user.delete).not.toHaveBeenCalled();

    mocks.tx.userPermission.findMany.mockResolvedValue(grantRows(["vendor:VIEW"]));
    await expect(subject.delete(actor, TARGET_ID)).resolves.toEqual({ ok: true });
    expect(mocks.tx.user.delete).toHaveBeenCalledWith({ where: { id: TARGET_ID } });
  });

  it("UT-DA-S11 get reports manageable per caller", async () => {
    signInAs(ADMIN_GRANTS);
    const subject = service();
    const actor = await subject.requireAccess(request, "VIEW");
    const row = (permissions: string[], role = "user") => ({
      id: TARGET_ID, name: "T", username: "t", role, active: true, updatedAt: new Date(), phoneE164: null, phoneCountry: null,
      locations: [], permissions: grantRows(permissions), photo: null,
    });
    mocks.prisma.user.findUnique.mockResolvedValue(row(["vendor:VIEW"]));
    await expect(subject.get(actor, TARGET_ID)).resolves.toMatchObject({ manageable: true, permissions: ["vendor:VIEW"] });
    mocks.prisma.user.findUnique.mockResolvedValue(row(["sale:VIEW"]));
    await expect(subject.get(actor, TARGET_ID)).resolves.toMatchObject({ manageable: false });
    mocks.prisma.user.findUnique.mockResolvedValue(row([], "admin"));
    await expect(subject.get(actor, TARGET_ID)).resolves.toMatchObject({ manageable: false, permissions: "ALL" });
  });
});

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

describe("user photo (PH)", () => {
  it("UT-PH-S01 rejects a wrong type, a bad signature and an oversized file before any DB work", async () => {
    signInAs([], "admin");
    const subject = service();
    const actor = await subject.requireAccess(request, "EDIT");
    expect(await failure(subject.putPhoto(actor, TARGET_ID, "image/gif", JPEG))).toEqual({ status: 415, code: "PHOTO_TYPE_NOT_ALLOWED" });
    expect(await failure(subject.putPhoto(actor, TARGET_ID, "image/png", JPEG))).toEqual({ status: 415, code: "PHOTO_TYPE_NOT_ALLOWED" });
    expect(await failure(subject.putPhoto(actor, TARGET_ID, "image/jpeg", Buffer.alloc(5 * 1024 * 1024 + 1, 0xff)))).toEqual({ status: 413, code: "PHOTO_TOO_LARGE" });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("UT-PH-S02 Super Admin replaces a photo: file written, metadata upserted, version = sha256 prefix", async () => {
    signInAs([], "admin");
    const subject = service();
    const actor = await subject.requireAccess(request, "EDIT");
    mocks.tx.$queryRaw.mockResolvedValue([{ role: "admin" }]);
    const result = await subject.putPhoto(actor, TARGET_ID, "image/jpeg", JPEG);
    expect(result.photoVersion).toMatch(/^[0-9a-f]{16}$/);
    expect(mocks.files.replacePhotoFile).toHaveBeenCalledWith(TARGET_ID, JPEG);
    expect(mocks.tx.userPhoto.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: TARGET_ID } }));
    expect(mocks.tx.user.update).not.toHaveBeenCalled();
  });

  it("UT-PH-S03 nobody changes their own photo here; a delegated admin can't change an unmanageable user's", async () => {
    signInAs([], "admin");
    const superAdmin = await service().requireAccess(request, "EDIT");
    mocks.tx.$queryRaw.mockResolvedValue([{ role: "admin" }]);
    expect(await failure(service().putPhoto(superAdmin, ADMIN_ID, "image/jpeg", JPEG))).toEqual({ status: 403, code: "USER_NOT_MANAGEABLE" });

    signInAs(ADMIN_GRANTS);
    const subject = service();
    const delegated = await subject.requireAccess(request, "EDIT");
    mocks.tx.$queryRaw.mockResolvedValue([{ role: "user" }]);
    mocks.tx.userPermission.findMany.mockResolvedValue(grantRows(["sale:VIEW"]));
    expect(await failure(subject.putPhoto(delegated, TARGET_ID, "image/jpeg", JPEG))).toEqual({ status: 403, code: "USER_NOT_MANAGEABLE" });
    expect(await failure(subject.removePhoto(delegated, TARGET_ID))).toEqual({ status: 403, code: "USER_NOT_MANAGEABLE" });
    expect(mocks.files.replacePhotoFile).not.toHaveBeenCalled();
    expect(mocks.files.removePhotoFile).not.toHaveBeenCalled();
  });

  it("UT-PH-S04 remove deletes the file and the metadata; unknown user is USER_NOT_FOUND", async () => {
    signInAs(ADMIN_GRANTS);
    const subject = service();
    const actor = await subject.requireAccess(request, "EDIT");
    mocks.tx.$queryRaw.mockResolvedValue([{ role: "user" }]);
    mocks.tx.userPermission.findMany.mockResolvedValue(grantRows(["vendor:VIEW"]));
    await expect(subject.removePhoto(actor, TARGET_ID)).resolves.toEqual({ ok: true });
    expect(mocks.files.removePhotoFile).toHaveBeenCalledWith(TARGET_ID);
    expect(mocks.tx.userPhoto.deleteMany).toHaveBeenCalledWith({ where: { userId: TARGET_ID } });

    mocks.tx.$queryRaw.mockResolvedValue([]);
    expect(await failure(subject.removePhoto(actor, TARGET_ID))).toEqual({ status: 404, code: "USER_NOT_FOUND" });
  });

  it("UT-PH-S05 get: metadata without a file or no metadata is PHOTO_NOT_FOUND", async () => {
    const subject = service();
    mocks.prisma.userPhoto.findUnique.mockResolvedValue(null);
    expect(await failure(subject.getPhoto(TARGET_ID))).toEqual({ status: 404, code: "PHOTO_NOT_FOUND" });
    mocks.prisma.userPhoto.findUnique.mockResolvedValue({ contentType: "image/jpeg", sha256: "a".repeat(64) });
    mocks.files.readPhotoFile.mockResolvedValue(null);
    expect(await failure(subject.getPhoto(TARGET_ID))).toEqual({ status: 404, code: "PHOTO_NOT_FOUND" });
    mocks.files.readPhotoFile.mockResolvedValue(JPEG);
    await expect(subject.getPhoto(TARGET_ID)).resolves.toEqual({ data: JPEG, contentType: "image/jpeg", version: "a".repeat(16) });
  });

  it("UT-PH-S06 deleting a user also removes the photo file", async () => {
    signInAs([], "admin");
    const subject = service();
    const actor = await subject.requireAccess(request, "DELETE");
    mocks.tx.$queryRaw.mockResolvedValue([{ role: "user" }]);
    await subject.delete(actor, TARGET_ID);
    expect(mocks.files.removePhotoFile).toHaveBeenCalledWith(TARGET_ID);
  });
});
