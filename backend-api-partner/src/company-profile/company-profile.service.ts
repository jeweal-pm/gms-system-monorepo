import { createHash } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { validationException, type FieldError } from "../common/errors";
import { toIso, WRITE_TX, type Tx } from "../common/persistence";
import { COUNTRY_CODES, CURRENCY_CODES, OPTIONS_RESPONSE } from "../common/reference-data";
import { prisma } from "../database/prisma-client";
import type { CompanyProfile } from "../generated/prisma/client";
import { companyLogoNotFound, companyProfileConflict, companyProfileNotFound, imageTooLarge, mapCompanyProfileError, unsupportedImage } from "./company-profile.errors";
import { LOGO_MAX_BYTES, LOGO_TYPES, type LogoContentType, type SaveCompanyProfileInput } from "./company-profile.schemas";
import { readLogoFile, removeLogoFile, replaceLogoFile, signatureMatches } from "./logo-storage";

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

/** Currency/country must be in the reference lists (same lists as vendor/customer options). */
function membershipErrors(input: SaveCompanyProfileInput): FieldError[] {
  const errors: FieldError[] = [];
  if (!COUNTRY_CODES.has(input.countryCode)) errors.push({ path: "countryCode", code: "unknown" });
  if (!CURRENCY_CODES.has(input.currencyCode)) errors.push({ path: "currencyCode", code: "unknown" });
  return errors;
}

/** Locks the single row and checks the expected version (SA-CP-08). */
async function lockForChange(tx: Tx, expectedVersion: number) {
  const [row] = await tx.$queryRaw<{ version: number }[]>`SELECT "version" FROM "partner"."company_profile" WHERE "id" = ${PROFILE_ID} FOR UPDATE`;
  if (!row) throw companyProfileNotFound();
  if (row.version !== expectedVersion) throw companyProfileConflict();
}

@Injectable()
export class CompanyProfileService {
  private readonly logger = new Logger("CompanyProfile");

  /** Same frozen lists as `vendor.options` (SA-CP-11). */
  options() {
    return OPTIONS_RESPONSE;
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
    const invalid = membershipErrors(input);
    if (invalid.length > 0) throw validationException(invalid);
    const data = profileData(input);
    try {
      const row = await prisma.$transaction(async (tx) => {
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

  /** Overwrites the logo file under the row lock, then records its metadata (SA-CP-05/06). */
  async putLogo(actorId: string, expectedVersion: number, contentType: string, data: Buffer) {
    if (!(LOGO_TYPES as readonly string[]).includes(contentType)) throw unsupportedImage();
    if (data.length > LOGO_MAX_BYTES) throw imageTooLarge();
    if (data.length === 0 || !signatureMatches(contentType, data)) throw unsupportedImage();
    const sha256 = createHash("sha256").update(data).digest("hex");
    try {
      const row = await prisma.$transaction(async (tx) => {
        await lockForChange(tx, expectedVersion);
        await replaceLogoFile(data);
        const now = new Date();
        return tx.companyProfile.update({
          where: { id: PROFILE_ID },
          data: { logoContentType: contentType, logoSizeBytes: data.length, logoSha256: sha256, logoUpdatedAt: now, version: { increment: 1 }, updatedBy: actorId, updatedAt: now },
        });
      }, WRITE_TX);
      this.logger.log({ event: "company_profile.logo_replaced", actorId, sizeBytes: data.length, contentType, version: row.version });
      return { profile: toProfile(row) };
    } catch (error) {
      throw mapCompanyProfileError(error, "putLogo");
    }
  }

  async getLogo() {
    let row: Pick<CompanyProfile, "logoContentType" | "logoSha256"> | null;
    try {
      row = await prisma.companyProfile.findUnique({ where: { id: PROFILE_ID }, select: { logoContentType: true, logoSha256: true } });
    } catch (error) {
      throw mapCompanyProfileError(error, "getLogo");
    }
    if (!row?.logoContentType || !row.logoSha256) throw companyLogoNotFound();
    let data: Buffer | null;
    try {
      data = await readLogoFile();
    } catch (error) {
      throw mapCompanyProfileError(error, "getLogo");
    }
    if (!data) {
      // Metadata without a file (e.g. a volume restored without the file): report it, serve nothing.
      this.logger.warn({ event: "company_profile.logo_file_missing" });
      throw companyLogoNotFound();
    }
    return { data, contentType: row.logoContentType, version: row.logoSha256.slice(0, 16) };
  }

  async removeLogo(actorId: string, expectedVersion: number) {
    try {
      const row = await prisma.$transaction(async (tx) => {
        await lockForChange(tx, expectedVersion);
        await removeLogoFile();
        const now = new Date();
        return tx.companyProfile.update({
          where: { id: PROFILE_ID },
          data: { logoContentType: null, logoSizeBytes: null, logoSha256: null, logoUpdatedAt: null, version: { increment: 1 }, updatedBy: actorId, updatedAt: now },
        });
      }, WRITE_TX);
      this.logger.log({ event: "company_profile.logo_removed", actorId, version: row.version });
      return { profile: toProfile(row) };
    } catch (error) {
      throw mapCompanyProfileError(error, "removeLogo");
    }
  }
}
