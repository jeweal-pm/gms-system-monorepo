import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testUrl = process.env.PARTNER_TEST_DATABASE_URL;
const canRun = Boolean(testUrl && /^postgresql:\/\/[^/]+@127\.0\.0\.1:(?!5432\/)[0-9]+\/f1_system$/.test(testUrl));
const actorId = `logo-it-${randomUUID()}`;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
let root = "";
let prisma: typeof import("../../src/database/prisma-client").prisma;
let subject: InstanceType<typeof import("../../src/company-profile/company-profile.service").CompanyProfileService>;
let logoStorage: typeof import("../../src/company-profile/logo-storage");

describe.runIf(canRun)("IT-CP-DB isolated PostgreSQL company-logo retention", () => {
  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "partner-logo-db-it-"));
    vi.stubEnv("DATABASE_URL", testUrl!);
    vi.stubEnv("PARTNER_DATABASE_URL", testUrl!);
    vi.stubEnv("GMS_STORAGE_ROOT", path.join(root, "storage"));
    ({ prisma } = await import("../../src/database/prisma-client"));
    const { CompanyProfileService } = await import("../../src/company-profile/company-profile.service");
    logoStorage = await import("../../src/company-profile/logo-storage");
    subject = new CompanyProfileService();
    await prisma.companyProfile.create({ data: {
      id: 1,
      name: "Logo retention integration",
      contactName: "Test",
      phoneCountry: "US",
      phoneE164: "+12025550123",
      email: `${actorId}@example.test`,
      address: "1 Test Street",
      countryCode: "US",
      state: "Test State",
      city: "Test City",
      postcode: "10000",
      currencyCode: "USD",
      updatedBy: actorId,
    } });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.storedFile.deleteMany({ where: { sourceType: "company-profile", sourceId: "1" } });
      await prisma.companyProfile.deleteMany({ where: { id: 1 } });
      await prisma.$disconnect();
    }
    if (root) await rm(root, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("replaces and hides the logo while retaining every object and metadata tombstone", async () => {
    await subject.putLogo(actorId, 1, "image/png", PNG);
    const first = await prisma.companyProfile.findUniqueOrThrow({ where: { id: 1 } });
    const firstKey = first.logoStorageKey!;
    expect(await logoStorage.readLogoFile(firstKey)).toEqual(PNG);

    await subject.putLogo(actorId, 2, "image/jpeg", JPEG);
    const second = await prisma.companyProfile.findUniqueOrThrow({ where: { id: 1 } });
    const secondKey = second.logoStorageKey!;
    expect(secondKey).not.toBe(firstKey);
    expect(await logoStorage.readLogoFile(firstKey)).toEqual(PNG);
    expect(await logoStorage.readLogoFile(secondKey)).toEqual(JPEG);
    expect((await prisma.storedFile.findMany({ where: { sourceType: "company-profile", sourceId: "1" }, orderBy: { createdAt: "asc" } })).map((file) => file.status)).toEqual(["deleted", "ready"]);

    await subject.removeLogo(actorId, 3);
    expect((await prisma.companyProfile.findUniqueOrThrow({ where: { id: 1 } })).logoStorageKey).toBeNull();
    expect(await logoStorage.readLogoFile(secondKey)).toEqual(JPEG);
    expect((await prisma.storedFile.findUniqueOrThrow({ where: { bucket_objectKey: { bucket: "files", objectKey: secondKey } } })).status).toBe("deleted");
  });
});
