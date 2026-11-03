import { HttpStatus, Logger } from "@nestjs/common";
import { partnerException } from "../common/errors";
import { isPrismaUnavailable, prismaCode } from "../common/persistence";

/** Stale `expectedVersion`, or a parallel first create of the row (error-handling.md). */
export const decimalSetupChanged = () => partnerException("DECIMAL_SETUP_CHANGED", HttpStatus.CONFLICT);

const logger = new Logger("DecimalSetup");

/** Unique race (P2002) → CHANGED; connection/pool/timeout → 503 PARTNER_UNAVAILABLE; anything else passes through. */
export function mapDecimalSetupError(error: unknown, operation: "get" | "save"): unknown {
  const code = prismaCode(error);
  if (code === "P2002") return decimalSetupChanged();
  if (isPrismaUnavailable(error)) {
    logger.warn({ event: "decimal_setup.db_unavailable", operation, prismaCode: code ?? "driver" });
    return partnerException("PARTNER_UNAVAILABLE", HttpStatus.SERVICE_UNAVAILABLE);
  }
  return error;
}
