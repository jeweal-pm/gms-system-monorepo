import { HttpStatus, Logger } from "@nestjs/common";
import { partnerException } from "../common/errors";
import { isPrismaUnavailable, prismaCode } from "../common/persistence";

export const documentSetupNotFound = () => partnerException("DOCUMENT_SETUP_NOT_FOUND", HttpStatus.NOT_FOUND);
export const documentSetupChanged = () => partnerException("DOCUMENT_SETUP_CHANGED", HttpStatus.CONFLICT);
/** SA-QT-05: a numbering row that issued a document number cannot be changed or removed. */
export const documentSetupRowInUse = (path: string) => partnerException("DOCUMENT_SETUP_ROW_IN_USE", HttpStatus.CONFLICT, [{ path, code: "in_use" }]);
export const documentSetupCodeTaken = () => partnerException("DOCUMENT_SETUP_CODE_TAKEN", HttpStatus.CONFLICT, [{ path: "code", code: "duplicate" }]);

const logger = new Logger("DocumentSetup");

/** Unique races (P2002) → CHANGED; connection/pool/timeout → 503; domain exceptions pass through. */
export function mapDocumentSetupError(error: unknown, operation: string): unknown {
  const code = prismaCode(error);
  if (code === "P2002") return documentSetupChanged();
  if (isPrismaUnavailable(error)) {
    logger.warn({ event: "document_setup.db_unavailable", operation, prismaCode: code ?? "driver" });
    return partnerException("PARTNER_UNAVAILABLE", HttpStatus.SERVICE_UNAVAILABLE);
  }
  return error;
}
