import { HttpStatus, Logger } from "@nestjs/common";
import { partnerException } from "../common/errors";
import { isPrismaUnavailable } from "../common/persistence";

export const companyProfileNotFound = () => partnerException("COMPANY_PROFILE_NOT_FOUND", HttpStatus.NOT_FOUND);
export const companyLogoNotFound = () => partnerException("COMPANY_LOGO_NOT_FOUND", HttpStatus.NOT_FOUND);
export const companyProfileConflict = () => partnerException("CONFLICT", HttpStatus.CONFLICT);
export const unsupportedImage = () => partnerException("UNSUPPORTED_MEDIA_TYPE", HttpStatus.UNSUPPORTED_MEDIA_TYPE);
export const imageTooLarge = () => partnerException("PAYLOAD_TOO_LARGE", HttpStatus.PAYLOAD_TOO_LARGE);

const logger = new Logger("CompanyProfile");

function prismaCode(error: unknown): string | undefined {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" ? code : undefined;
}

/**
 * company-profile error-handling.md: duplicate first save (P2002) → CONFLICT; connection/pool/timeout →
 * 503; file-system failures → 500 `company_profile.storage_error` (no path or value logged);
 * partner HTTP exceptions pass through.
 */
export function mapCompanyProfileError(error: unknown, operation: string): unknown {
  const code = prismaCode(error);
  if (code === "P2002") return companyProfileConflict();
  if (isPrismaUnavailable(error)) {
    logger.warn({ event: "company_profile.db_unavailable", operation, prismaCode: code ?? "driver" });
    return partnerException("PARTNER_UNAVAILABLE", HttpStatus.SERVICE_UNAVAILABLE);
  }
  if (code && /^E[A-Z]+$/.test(code)) {
    logger.error({ event: "company_profile.storage_error", operation, errno: code });
    return partnerException("INTERNAL_SERVER_ERROR", HttpStatus.INTERNAL_SERVER_ERROR);
  }
  return error;
}
