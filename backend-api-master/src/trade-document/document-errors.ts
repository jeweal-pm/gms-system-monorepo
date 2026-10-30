import { HttpStatus, Logger } from "@nestjs/common";
import { partnerException, type FieldError } from "../common/errors";
import { isPrismaUnavailable, prismaCode } from "../common/persistence";

/**
 * Domain errors of one trade document type (memo out `MEMO_OUT_*`, memo out return `MEMO_OUT_RETURN_*`, ADR-0033;
 * memo receive / memo return, memo-return SA rev 1), same codes and statuses as quotation's (api-contract "Errors").
 * `<CODE>_IN_USE`: another document depends on this one (a memo receive whose lines were returned).
 */
export function documentErrors(code: string, logContext: string, event: string) {
  const logger = new Logger(logContext);
  const notFound = () => partnerException(`${code}_NOT_FOUND`, HttpStatus.NOT_FOUND);
  const changed = () => partnerException(`${code}_CHANGED`, HttpStatus.CONFLICT);
  const statusInvalid = () => partnerException(`${code}_STATUS_INVALID`, HttpStatus.CONFLICT);
  const inUse = () => partnerException(`${code}_IN_USE`, HttpStatus.CONFLICT);
  const referenceInvalid = (fieldErrors: FieldError[]) => partnerException(`${code}_REFERENCE_INVALID`, HttpStatus.UNPROCESSABLE_ENTITY, fieldErrors);
  /**
   * P2002 on (numbering, running no) / doc no = a concurrent save got the same number first → CHANGED so the
   * client retries; P2003 = a reference vanished mid-save; connection problems → 503; domain errors pass through.
   */
  const map = (error: unknown, operation: string): unknown => {
    const prisma = prismaCode(error);
    if (prisma === "P2002") return changed();
    if (prisma === "P2003") return referenceInvalid([{ path: "(reference)", code: "invalid_reference" }]);
    if (isPrismaUnavailable(error)) {
      logger.warn({ event: `${event}.db_unavailable`, operation, prismaCode: prisma ?? "driver" });
      return partnerException("PARTNER_UNAVAILABLE", HttpStatus.SERVICE_UNAVAILABLE);
    }
    return error;
  };
  return { notFound, changed, statusInvalid, inUse, referenceInvalid, map };
}

export type DocumentErrors = ReturnType<typeof documentErrors>;
