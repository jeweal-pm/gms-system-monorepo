import { uuidV7 } from "@gms/storage";
import { createHash } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { validationException, type FieldError } from "../common/errors";
import { toIso, WRITE_TX, type Tx } from "../common/persistence";
import { COUNTRY_CODES, COUNTRY_OPTIONS } from "../common/reference-data";
import { currencyOptions, isCurrencyAllowed } from "../currency/currency-directory";
import { prisma } from "../database/prisma-client";
import type { CompanyProfile } from "../generated/prisma/client";
import { companyLogoNotFound, companyProfileConflict, companyProfileNotFound, imageTooLarge, mapCompanyProfileError, unsupportedImage } from "./company-profile.errors";
import { LOGO_MAX_BYTES, LOGO_TYPES, type LogoContentType, type SaveCompanyProfileInput } from "./company-profile.schemas";
import { readLegacyLogoFile, readLogoFile, signatureMatches, storeLogoFile } from "./logo-storage";

const PROFILE_ID = 1;

/** Contract output (api-contract.md `CompanyProfile`); the logo version is the sha256 prefix. */
function toProfile(row: CompanyProfile) {
  return {
    name: row.name,
    taxId: row.taxId,
    contactName: row.contactName,
    phone: { country: row.phoneCountry, e164: row.phoneE164 },
    email: row.email,
    website: row.website,
    address: row.address,
    address2: row.address2,
    roadStreet: row.roadStreet,
    countryCode: row.countryCode,
    state: row.state,
    city: row.city,
    postcode: row.postcode,
    currencyCode: row.currencyCode,
    bankDetails: row.bankDetails,
    showBankDetailsOnInvoice: row.showBankDetailsOnInvoice,
    version: row.version,
    logo: row.logoSha256 && row.logoContentType && row.logoSizeBytes
      ? { version: row.logoSha256.slice(0, 16), contentType: row.logoContentType as LogoContentType, sizeBytes: row.logoSizeBytes }
      : null,
    updatedAt: toIso(row.updatedAt),
    updatedBy: row.updatedBy,
  };
}

function profileData(input: SaveCompanyProfileInput) {
  return {
    name: input.name,
    taxId: input.taxId,
    contactName: input.contactName,
    phoneCountry: input.phone.country,
    phoneE164: input.phone.e164,
    email: input.email,
    website: input.website,
    address: input.address,
    address2: input.address2,
    roadStreet: input.roadStreet,
    countryCode: input.countryCode,
    state: input.state,
    city: input.city,
    postcode: input.postcode,
    currencyCode: input.currencyCode,
    bankDetails: input.bankDetails,
    showBankDetailsOnInvoice: input.showBankDetailsOnInvoice,
  };
}

/**
 * Country must be in the reference list; the currency must be active in the currency master or equal to
 * the stored one (currency SA-CUR-05). The chosen currency is the base for every exchange rate (SA-CUR-02).
 */
function membershipErrors(input: SaveCompanyProfileInput, currencyAllowed: boolean): FieldError[] {
  const errors: FieldError[] = [];
  if (!COUNTRY_CODES.has(input.countryCode)) errors.push({ path: "countryCode", code: "unknown" });
  if (!currencyAllowed) errors.push({ path: "currencyCode", code: "unknown" });
  return errors;
}

/** Locks the single row and checks the expected version (SA-CP-08). */
async function lockForChange(tx: Tx, expectedVersion: number) {
  const [row] = await tx.$queryRaw<{ version: number }[]>`SELECT "version" FROM "partner"."company_profile" WHERE "id" = ${PROFILE_ID} FOR UPDATE`;
  if (!row) throw companyProfileNotFound();
  if (row.version !== expectedVersion) throw companyProfileConflict();
}

type LogoState = Pick<CompanyProfile, "logoContentType" | "logoSizeBytes" | "logoSha256" | "logoStorageKey" | "logoUpdatedAt">;

/**
 * Hide the old logo in metadata while preserving its bytes. Legacy logos are first copied into an
 * immutable object, then recorded as a deleted tombstone; the named-volume source remains intact.
 */
async function hideCurrentLogo(tx: Tx, current: LogoState | null, now: Date): Promise<void> {
  if (!current) return;
  if (current.logoStorageKey) {
    await tx.storedFile.updateMany({
      where: { bucket: "files", objectKey: current.logoStorageKey, status: "ready" },
      data: { status: "deleted", deletedAt: now, purgeAfter: null },
    });
    return;
  }
  if (!current.logoContentType || !current.logoSha256 || !current.logoSizeBytes) return;
  if (!(LOGO_TYPES as readonly string[]).includes(current.logoContentType)) return;

  let legacyBytes: Buffer | null;
  try {
    legacyBytes = await readLegacyLogoFile();
  } catch {
    throw Object.assign(new Error("GMS legacy logo read failed"), { code: "EIO" });
  }
  if (!legacyBytes || legacyBytes.length === 0 || legacyBytes.length > LOGO_MAX_BYTES) return;

  let archived;
  try {
    archived = await storeLogoFile(legacyBytes, current.logoContentType as LogoContentType);
  } catch {
    throw Object.assign(new Error("GMS legacy logo archive failed"), { code: "EIO" });
  }
  const createdAt = current.logoUpdatedAt ?? now;
  await tx.storedFile.create({
    data: {
      id: uuidV7(),
      kind: "company-logo",
      bucket: "files",
      objectKey: archived.key,
      filename: archived.key.split("/").at(-1)!,
      contentType: current.logoContentType,
      sizeBytes: BigInt(archived.sizeBytes),
      sha256: archived.sha256,
      status: "deleted",
      sourceType: "company-profile",
      sourceId: String(PROFILE_ID),
      createdBy: null,
      createdAt,
      readyAt: createdAt,
      deletedAt: now,
      purgeAfter: null,
    },
  });
}

@Injectable()
export class CompanyProfileService {
  private readonly logger = new Logger("CompanyProfile");

  /** Same lists as `vendor.options` (SA-CP-11); currencies from the currency master (SA-CUR-05). */
  async options() {
    try {
      return { currencies: await currencyOptions(), countries: COUNTRY_OPTIONS };
    } catch (error) {
      throw mapCompanyProfileError(error, "options");
    }
  }

  async get() {
    try {
      const row = await prisma.companyProfile.findUnique({ where: { id: PROFILE_ID } });
      return { profile: row ? toProfile(row) : null };
    } catch (error) {
      throw mapCompanyProfileError(error, "get");
    }
  }

  /** Whole replacement. `expectedVersion: null` creates the row (CONFLICT if it exists). */
  async save(actorId: string, input: SaveCompanyProfileInput) {
    const data = profileData(input);
    try {
      const row = await prisma.$transaction(async (tx) => {
        const stored = await tx.companyProfile.findUnique({ where: { id: PROFILE_ID }, select: { currencyCode: true } });
        const invalid = membershipErrors(input, await isCurrencyAllowed(tx, input.currencyCode, stored?.currencyCode));
        if (invalid.length > 0) throw validationException(invalid);
        const now = new Date();
        if (input.expectedVersion === null) {
          return tx.companyProfile.create({ data: { id: PROFILE_ID, ...data, version: 1, updatedBy: actorId, updatedAt: now } });
        }
        const updated = await tx.companyProfile.updateMany({
          where: { id: PROFILE_ID, version: input.expectedVersion },
          data: { ...data, version: { increment: 1 }, updatedBy: actorId, updatedAt: now },
        });
        if (updated.count === 0) {
          const exists = await tx.companyProfile.count({ where: { id: PROFILE_ID } });
          throw exists === 0 ? companyProfileNotFound() : companyProfileConflict();
        }
        return tx.companyProfile.findUniqueOrThrow({ where: { id: PROFILE_ID } });
      }, WRITE_TX);
      this.logger.log({ event: input.expectedVersion === null ? "company_profile.created" : "company_profile.updated", actorId, version: row.version });
      return { profile: toProfile(row) };
    } catch (error) {
      throw mapCompanyProfileError(error, "save");
    }
  }

  /** Stores immutable logo bytes and switches the current profile pointer under the row lock. */
  async putLogo(actorId: string, expectedVersion: number, contentType: string, data: Buffer) {
    if (!(LOGO_TYPES as readonly string[]).includes(contentType)) throw unsupportedImage();
    if (data.length > LOGO_MAX_BYTES) throw imageTooLarge();
    if (data.length === 0 || !signatureMatches(contentType, data)) throw unsupportedImage();
    try {
      const row = await prisma.$transaction(async (tx) => {
        await lockForChange(tx, expectedVersion);
        const now = new Date();
        const current = await tx.companyProfile.findUnique({
          where: { id: PROFILE_ID },
          select: { logoContentType: true, logoSizeBytes: true, logoSha256: true, logoStorageKey: true, logoUpdatedAt: true },
        });
        await hideCurrentLogo(tx, current, now);
        // Storage objects are immutable and permanent. If this DB transaction later rolls back,
        // the uploaded object remains as an orphan for reconciliation; it is never unlinked here.
        let stored;
        try {
          stored = await storeLogoFile(data, contentType as LogoContentType);
        } catch {
          throw Object.assign(new Error("GMS storage write failed"), { code: "EIO" });
        }
        await tx.storedFile.create({
          data: {
            id: uuidV7(),
            kind: "company-logo",
            bucket: "files",
            objectKey: stored.key,
            filename: stored.key.split("/").at(-1)!,
            contentType,
            sizeBytes: BigInt(stored.sizeBytes),
            sha256: stored.sha256,
            status: "ready",
            sourceType: "company-profile",
            sourceId: String(PROFILE_ID),
            createdBy: actorId,
            createdAt: now,
            readyAt: now,
            purgeAfter: null,
          },
        });
        return tx.companyProfile.update({
          where: { id: PROFILE_ID },
          data: { logoContentType: contentType, logoSizeBytes: data.length, logoSha256: stored.sha256, logoStorageKey: stored.key, logoUpdatedAt: now, version: { increment: 1 }, updatedBy: actorId, updatedAt: now },
        });
      }, WRITE_TX);
      this.logger.log({ event: "company_profile.logo_replaced", actorId, sizeBytes: data.length, contentType, version: row.version });
      return { profile: toProfile(row) };
    } catch (error) {
      throw mapCompanyProfileError(error, "putLogo");
    }
  }

  async getLogo() {
    let row: Pick<CompanyProfile, "logoContentType" | "logoSha256" | "logoSizeBytes" | "logoStorageKey"> | null;
    try {
      row = await prisma.companyProfile.findUnique({ where: { id: PROFILE_ID }, select: { logoContentType: true, logoSha256: true, logoSizeBytes: true, logoStorageKey: true } });
    } catch (error) {
      throw mapCompanyProfileError(error, "getLogo");
    }
    if (!row?.logoContentType || !row.logoSha256) throw companyLogoNotFound();
    let data: Buffer | null;
    try {
      data = row.logoStorageKey ? await readLogoFile(row.logoStorageKey) : await readLegacyLogoFile();
    } catch {
      throw mapCompanyProfileError(Object.assign(new Error("GMS storage read failed"), { code: "EIO" }), "getLogo");
    }
    if (!data) {
      // Metadata without a file (e.g. a volume restored without the file): report it, serve nothing.
      this.logger.warn({ event: "company_profile.logo_file_missing" });
      throw companyLogoNotFound();
    }
    if (row.logoSizeBytes !== data.length || createHash("sha256").update(data).digest("hex") !== row.logoSha256 || !signatureMatches(row.logoContentType, data)) {
      this.logger.warn({ event: "company_profile.logo_integrity_mismatch" });
      throw companyLogoNotFound();
    }
    return { data, contentType: row.logoContentType, version: row.logoSha256.slice(0, 16) };
  }

  async removeLogo(actorId: string, expectedVersion: number) {
    try {
      const row = await prisma.$transaction(async (tx) => {
        await lockForChange(tx, expectedVersion);
        const now = new Date();
        const current = await tx.companyProfile.findUnique({
          where: { id: PROFILE_ID },
          select: { logoContentType: true, logoSizeBytes: true, logoSha256: true, logoStorageKey: true, logoUpdatedAt: true },
        });
        await hideCurrentLogo(tx, current, now);
        return tx.companyProfile.update({
          where: { id: PROFILE_ID },
          data: { logoContentType: null, logoSizeBytes: null, logoSha256: null, logoStorageKey: null, logoUpdatedAt: null, version: { increment: 1 }, updatedBy: actorId, updatedAt: now },
        });
      }, WRITE_TX);
      this.logger.log({ event: "company_profile.logo_removed", actorId, version: row.version });
      return { profile: toProfile(row) };
    } catch (error) {
      throw mapCompanyProfileError(error, "removeLogo");
    }
  }
}
