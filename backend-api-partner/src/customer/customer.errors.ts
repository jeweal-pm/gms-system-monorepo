import { HttpStatus } from "@nestjs/common";
import { partnerException } from "../common/errors";
import { persistenceErrorMapper } from "../common/persistence";

export const customerNotFound = () => partnerException("CUSTOMER_NOT_FOUND", HttpStatus.NOT_FOUND);
export const customerStale = () => partnerException("CUSTOMER_STALE", HttpStatus.CONFLICT);
export const customerCodeTaken = () => partnerException("CUSTOMER_CODE_TAKEN", HttpStatus.CONFLICT, [{ path: "code", code: "duplicate" }]);

/**
 * Maps Prisma/driver errors explicitly (error-handling.md "Partner implementation rules").
 * Passes through errors that are already partner HTTP exceptions.
 */
export const mapPersistenceError = persistenceErrorMapper({
  entity: "customer",
  logContext: "Customer",
  codeKeyMarker: "code_key",
  notFound: customerNotFound,
  codeTaken: customerCodeTaken,
});
