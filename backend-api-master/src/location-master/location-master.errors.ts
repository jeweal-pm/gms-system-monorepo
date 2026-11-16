import { HttpStatus } from "@nestjs/common";
import { partnerException } from "../common/errors";
import { persistenceErrorMapper } from "../common/persistence";

export const locationNotFound = () => partnerException("LOCATION_NOT_FOUND", HttpStatus.NOT_FOUND);
/** The record changed since it was read (optimistic `expectedUpdatedAt`, the master rule). */
export const locationChanged = () => partnerException("LOCATION_CHANGED", HttpStatus.CONFLICT);
/** SA-LM-01: names are unique ignoring case (`location_name_lower_key`). */
export const locationNameTaken = () => partnerException("LOCATION_NAME_TAKEN", HttpStatus.CONFLICT, [{ path: "name", code: "duplicate" }]);

/** Unique index → NAME_TAKEN; connection / pool / timeout → 503; domain errors pass through. */
export const mapLocationError = persistenceErrorMapper({
  entity: "location",
  logContext: "LocationMaster",
  codeKeyMarker: "location_name_lower_key",
  notFound: locationNotFound,
  codeTaken: locationNameTaken,
});
