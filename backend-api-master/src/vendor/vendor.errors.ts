import { HttpStatus } from "@nestjs/common";
import { partnerException } from "../common/errors";
import { persistenceErrorMapper } from "../common/persistence";

export const vendorNotFound = () => partnerException("VENDOR_NOT_FOUND", HttpStatus.NOT_FOUND);
export const vendorStale = () => partnerException("VENDOR_STALE", HttpStatus.CONFLICT);
export const vendorCodeTaken = () => partnerException("VENDOR_CODE_TAKEN", HttpStatus.CONFLICT, [{ path: "code", code: "duplicate" }]);

/**
 * vendor error-handling.md "Partner implementation rules": P2002 on `vendor_code_key_key` →
 * `VENDOR_CODE_TAKEN`; P2002 on the position/default index → 500 `vendor.invariant_violation`;
 * P2025 → `VENDOR_NOT_FOUND`; connection/pool/timeout → 503 `vendor.db_unavailable`.
 */
export const mapPersistenceError = persistenceErrorMapper({
  entity: "vendor",
  logContext: "Vendor",
  codeKeyMarker: "code_key",
  notFound: vendorNotFound,
  codeTaken: vendorCodeTaken,
});
