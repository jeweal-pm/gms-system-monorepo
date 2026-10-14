import { HttpStatus, Logger } from "@nestjs/common";
import { partnerException } from "../common/errors";

const logger = new Logger("Customer");

const UNAVAILABLE_CODES = new Set(["P1001", "P1002", "P1008", "P1017", "P2024", "P2028"]);

export const customerNotFound = () => partnerException("CUSTOMER_NOT_FOUND", HttpStatus.NOT_FOUND);
export const customerStale = () => partnerException("CUSTOMER_STALE", HttpStatus.CONFLICT);
export const customerCodeTaken = () => partnerException("CUSTOMER_CODE_TAKEN", HttpStatus.CONFLICT, [{ path: "code", code: "duplicate" }]);

function prismaCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && /^P\d{4}$/.test(code) ? code : undefined;
}

/** Index/constraint names only (never values) from a Prisma unique-violation error. */
function violatedTarget(error: unknown): string {
  const meta = (error as { meta?: unknown }).meta;
  try {
    return JSON.stringify(meta ?? {});
  } catch {
    return "";
  }
}

function isPoolTimeout(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /timeout exceeded when trying to connect|Connection terminated|Transaction already closed|expired transaction/i.test(error.message);
}

/**
 * Maps Prisma/driver errors explicitly (error-handling.md "Partner implementation rules").
 * Passes through errors that are already partner HTTP exceptions.
 */
export function mapPersistenceError(error: unknown, operation: string): unknown {
  const code = prismaCode(error);
  if (code === "P2002") {
    if (violatedTarget(error).includes("code_key")) return customerCodeTaken();
    logger.error({ event: "customer.invariant_violation", operation, prismaCode: code });
    return partnerException("INTERNAL_SERVER_ERROR", HttpStatus.INTERNAL_SERVER_ERROR);
  }
  if (code === "P2025") return customerNotFound();
  if ((code && UNAVAILABLE_CODES.has(code)) || isPoolTimeout(error)) {
    logger.warn({ event: "customer.db_unavailable", operation, prismaCode: code ?? "driver" });
    return partnerException("PARTNER_UNAVAILABLE", HttpStatus.SERVICE_UNAVAILABLE);
  }
  return error;
}
