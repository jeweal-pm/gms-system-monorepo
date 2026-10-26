import { HttpStatus, Logger } from "@nestjs/common";
import { partnerException, type FieldError } from "../common/errors";
import { isPrismaUnavailable, prismaCode } from "../common/persistence";

/** quotation api-contract.md "Errors" (SA-QT-12). */
export const quotationNotFound = () => partnerException("QUOTATION_NOT_FOUND", HttpStatus.NOT_FOUND);
export const quotationChanged = () => partnerException("QUOTATION_CHANGED", HttpStatus.CONFLICT);
export const quotationStatusInvalid = () => partnerException("QUOTATION_STATUS_INVALID", HttpStatus.CONFLICT);
export const quotationReferenceInvalid = (fieldErrors: FieldError[]) => partnerException("QUOTATION_REFERENCE_INVALID", HttpStatus.UNPROCESSABLE_ENTITY, fieldErrors);
export const quotationPhotoInvalid = (path: string) => partnerException("QUOTATION_PHOTO_INVALID", HttpStatus.UNPROCESSABLE_ENTITY, [{ path, code: "invalid_photo" }]);

const logger = new Logger("Quotation");

/**
 * P2002 on (numbering, running no) / doc no = a concurrent save got the same number first (the row lock
 * makes this rare) → CHANGED so the client retries; P2003 = a reference vanished mid-save; connection
 * problems → 503; domain exceptions pass through.
 */
export function mapQuotationError(error: unknown, operation: string): unknown {
  const code = prismaCode(error);
  if (code === "P2002") return quotationChanged();
  if (code === "P2003") return quotationReferenceInvalid([{ path: "(reference)", code: "invalid_reference" }]);
  if (isPrismaUnavailable(error)) {
    logger.warn({ event: "quotation.db_unavailable", operation, prismaCode: code ?? "driver" });
    return partnerException("PARTNER_UNAVAILABLE", HttpStatus.SERVICE_UNAVAILABLE);
  }
  return error;
}
