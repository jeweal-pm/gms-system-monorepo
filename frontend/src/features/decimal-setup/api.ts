import type { inferRouterClient } from "@trpc/client";
import type { MasterRouter } from "@gem-crm/backend-api-master/src/master/router";
import { DEFAULT_DECIMAL_PLACES, normalizePlaces, type DecimalPlaces } from "@/lib/number-format";
import { isCallerLicenseCode, readDomainError, retryTransient } from "@/lib/trpc-error";
import type { DecimalDraft } from "./pages";

/**
 * Decimal Setup data contract (SA rev 1 + owner Q-DEC-08 change, api-contract.md; FE-DEC-101):
 * `decimalSetup.get` (any signed-in licensed user) and `decimalSetup.save` (`decimal-setup:EDIT` + CSRF,
 * optimistic `expectedVersion`). The rev 1 browser mock and its localStorage value are gone.
 */
type DecimalSetupClient = inferRouterClient<MasterRouter>["decimalSetup"];
export type DecimalSetupOutput = Awaited<ReturnType<DecimalSetupClient["get"]["query"]>>;
export type DecimalSetup = DecimalSetupOutput["setup"];
export type SaveDecimalSetupInput = Parameters<DecimalSetupClient["save"]["mutate"]>[0];

/** Rev 1 demo value (Q-DEC-17): deleted on load, never read or imported. */
export const LEGACY_STORAGE_KEY = "gms.decimal-setup.v1";

/** Q-DEC-15: other users pick a change up on their next load, or on window focus after 10 minutes. */
export const DECIMAL_SETUP_STALE_MS = 10 * 60_000;

/** One retry for a transient failure only (5xx / network); no retry for 4xx, session or license errors. */
export function retryDecimalSetupRead(failureCount: number, error: unknown): boolean {
  return failureCount < 1 && retryTransient(failureCount, error);
}

/** Deletes the rev 1 browser-only value; storage that is blocked (private mode) is ignored. */
export function removeLegacyStorage(storage: Pick<Storage, "removeItem"> | undefined = globalThis.localStorage): void {
  try {
    storage?.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Storage blocked: nothing was stored there either.
  }
}

/** The places every page uses: the loaded setting, or weight 2 / price 2 while loading or when it fails (Q-DEC-16). */
export function placesFrom(output: DecimalSetupOutput | undefined): DecimalPlaces {
  const setup = output?.setup;
  if (!setup) return DEFAULT_DECIMAL_PLACES;
  return {
    weightPlaces: normalizePlaces(setup.weightPlaces, DEFAULT_DECIMAL_PLACES.weightPlaces),
    pricePlaces: normalizePlaces(setup.pricePlaces, DEFAULT_DECIMAL_PLACES.pricePlaces),
  };
}

export function draftFrom(setup: DecimalSetup): DecimalDraft {
  return { weightPlaces: setup.weightPlaces, pricePlaces: setup.pricePlaces, expectedVersion: setup.version };
}

export function toSaveInput(draft: DecimalDraft): SaveDecimalSetupInput {
  return { weightPlaces: draft.weightPlaces, pricePlaces: draft.pricePlaces, expectedVersion: draft.expectedVersion };
}

export type SaveOutcome = { message: string; conflict?: boolean; recheckAccess?: boolean };

/** Save errors → the page message (error-handling.md; ui-spec rev 2 "Conflict"). */
export function mapSaveError(error: unknown): SaveOutcome {
  const { domainCode } = readDomainError(error);
  switch (domainCode) {
    case "DECIMAL_SETUP_CHANGED":
      return { message: "Someone else changed the decimal setup. Reload to see the latest values.", conflict: true };
    case "VALIDATION_ERROR":
      return { message: "Choose 0 to 4 decimal places for weight and price." };
    case "PERMISSION_DENIED":
      return { message: "You no longer have permission to edit the decimal setup. Nothing was saved.", recheckAccess: true };
    case "CSRF_INVALID":
      return { message: "Couldn't save from this page. Reload the page and try again." };
    default:
      if (isCallerLicenseCode(domainCode)) return { message: "Your license doesn't allow this right now. Nothing was saved." };
      if (domainCode === "UNAUTHORIZED" || domainCode === "UNAUTHENTICATED") return { message: "Your session has ended. Sign in again." };
      return { message: "Couldn't save. Try again." };
  }
}

export function loadErrorMessage(error: unknown): string {
  const { domainCode } = readDomainError(error);
  if (isCallerLicenseCode(domainCode)) return "Your license doesn't allow using this page right now.";
  if (domainCode === "UNAUTHORIZED" || domainCode === "UNAUTHENTICATED") return "Your session has ended. Sign in again.";
  return "Couldn't load the decimal setup.";
}

const updatedFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Bangkok",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * F2-05 "Last updated dd/mm/yyyy HH:mm" (Asia/Bangkok). Hidden (null) before the first save by a user: the
 * missing-row defaults (version 0) and the migration seed (`updatedBy` null). The API returns the user id only,
 * so no name is shown.
 */
export function lastUpdatedText(setup: Pick<DecimalSetup, "version" | "updatedAt" | "updatedBy">): string | null {
  if (setup.version === 0 || setup.updatedBy === null) return null;
  const at = new Date(setup.updatedAt);
  if (Number.isNaN(at.getTime())) return null;
  return `Last updated ${updatedFormatter.format(at).replace(",", "")}`;
}
