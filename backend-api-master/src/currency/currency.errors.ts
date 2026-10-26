import { HttpStatus } from "@nestjs/common";
import { partnerException } from "../common/errors";
import { persistenceErrorMapper } from "../common/persistence";

export const currencyNotFound = () => partnerException("CURRENCY_NOT_FOUND", HttpStatus.NOT_FOUND);
export const currencyChanged = () => partnerException("CURRENCY_CHANGED", HttpStatus.CONFLICT);
export const currencyCodeTaken = () => partnerException("CURRENCY_CODE_TAKEN", HttpStatus.CONFLICT, [{ path: "code", code: "duplicate" }]);
/** SA-CUR-06: Company Profile, a vendor or a customer stores the code. */
export const currencyInUse = () => partnerException("CURRENCY_IN_USE", HttpStatus.CONFLICT);
/** SA-CUR-02: the company currency (base) is always active. */
export const currencyBaseLocked = () => partnerException("CURRENCY_BASE_LOCKED", HttpStatus.CONFLICT, [{ path: "active", code: "base_currency" }]);

/** Unique index `currency_code_key` → CODE_TAKEN; connection/pool/timeout → 503; domain errors pass through. */
export const mapCurrencyError = persistenceErrorMapper({
  entity: "currency",
  logContext: "Currency",
  codeKeyMarker: "currency_code_key",
  notFound: currencyNotFound,
  codeTaken: currencyCodeTaken,
});
