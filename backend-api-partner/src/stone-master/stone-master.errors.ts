import { HttpStatus } from "@nestjs/common";
import { partnerException } from "../common/errors";
import { persistenceErrorMapper, prismaCode } from "../common/persistence";

export const stoneNotFound = () => partnerException("STONE_MASTER_NOT_FOUND", HttpStatus.NOT_FOUND);
export const stoneChanged = () => partnerException("STONE_MASTER_CHANGED", HttpStatus.CONFLICT);
export const stoneCodeTaken = () => partnerException("STONE_MASTER_CODE_TAKEN", HttpStatus.CONFLICT, [{ path: "code", code: "duplicate" }]);
export const stoneInUse = () => partnerException("STONE_MASTER_IN_USE", HttpStatus.CONFLICT);
/** SA-SM-06: a missing or newly chosen inactive reference; `path` names the field. */
export const stoneReferenceInvalid = (path: string) =>
  partnerException("STONE_MASTER_REFERENCE_INVALID", HttpStatus.UNPROCESSABLE_ENTITY, [{ path, code: "invalid_reference" }]);

const baseMapper = persistenceErrorMapper({
  entity: "stone_master",
  logContext: "StoneMaster",
  // Unique indexes are named `stone_<kind>_code_key`.
  codeKeyMarker: "code_key",
  notFound: stoneNotFound,
  codeTaken: stoneCodeTaken,
});

/**
 * P2003 (foreign key): on delete the row is still referenced → STONE_MASTER_IN_USE (SA-SM-06); on
 * create/update a reference vanished between the check and the write → STONE_MASTER_REFERENCE_INVALID.
 * Everything else follows the shared partner mapper.
 */
export function mapStoneError(error: unknown, operation: string): unknown {
  if (prismaCode(error) === "P2003") return operation === "delete" ? stoneInUse() : stoneReferenceInvalid("(reference)");
  return baseMapper(error, operation);
}
