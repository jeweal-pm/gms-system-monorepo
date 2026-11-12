import { HttpStatus, Logger } from "@nestjs/common";
import { partnerException } from "../common/errors";
import { isPrismaUnavailable, prismaCode } from "../common/persistence";

/** Stale `expectedVersion` (or the row is missing): the client refetches the list (error-handling.md). */
export const approvalSettingChanged = () => partnerException("APPROVAL_SETTING_CHANGED", HttpStatus.CONFLICT);

/** Turn OFF refused while documents of the type wait (ADR-0050 D4): counts for the blocked dialog, each capped at 100. */
export const approvalSettingHasWaiting = (waiting: { pending: number; revision: number }) =>
  partnerException("APPROVAL_SETTING_HAS_WAITING", HttpStatus.CONFLICT, null, { pending: waiting.pending, revision: waiting.revision });

const logger = new Logger("ApprovalSetting");

/** Connection/pool/transaction-timeout failures → 503 PARTNER_UNAVAILABLE; domain errors pass through. */
export function mapApprovalSettingError(error: unknown, operation: "list" | "update" | "readForSave"): unknown {
  if (isPrismaUnavailable(error)) {
    logger.warn({ event: "approval_setting.db_unavailable", operation, prismaCode: prismaCode(error) ?? "driver" });
    return partnerException("PARTNER_UNAVAILABLE", HttpStatus.SERVICE_UNAVAILABLE);
  }
  return error;
}
