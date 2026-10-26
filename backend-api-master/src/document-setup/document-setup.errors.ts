import { HttpStatus, Logger } from "@nestjs/common";
import { partnerException } from "../common/errors";
import { isPrismaUnavailable, prismaCode } from "../common/persistence";

export const documentSetupNotFound = () => partnerException("DOCUMENT_SETUP_NOT_FOUND", HttpStatus.NOT_FOUND);
export const documentSetupChanged = () => partnerException("DOCUMENT_SETUP_CHANGED", HttpStatus.CONFLICT);
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
