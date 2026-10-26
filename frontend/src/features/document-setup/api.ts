import { isCallerLicenseCode, readDomainError } from "@/lib/trpc-error";
import type { DocumentSetupFormValues } from "./schema";

export type SaveFieldError = { name: "name" | "code" | "startFrom" | "declaration" | `rows.${number}.${"effectiveDate" | "prefix" | "separator" | "startNo"}`; message: string };
export type SaveOutcome = { fieldErrors: SaveFieldError[]; formError: string | null; stale?: boolean; recheckAccess?: boolean };

const FIELD_NAMES = new Set(["name", "code", "startFrom", "declaration"]);
const ROW_FIELD = /^rows\.(\d+)\.(effectiveDate|prefix|separator|startNo)$/;

/** Save errors → field/form messages (error-handling.md, UI rev 1). `rowIndexBySaved` maps server row order to form rows. */
export function mapSaveError(error: unknown, rowIndexBySaved: readonly number[] = []): SaveOutcome {
  const { domainCode, fieldErrors } = readDomainError(error);
  switch (domainCode) {
    case "DOCUMENT_SETUP_CODE_TAKEN":
      return { fieldErrors: [{ name: "code", message: "This code is already used" }], formError: null };
    case "DOCUMENT_SETUP_CHANGED":
      return { fieldErrors: [], formError: "Someone else changed this setup. Reload to see the latest.", stale: true };
    case "DOCUMENT_SETUP_ROW_IN_USE":
      // SA-QT-05: a row that already issued document numbers can't be changed or removed.
      return { fieldErrors: [], formError: "A numbering row that documents already use can't be changed or removed. Reload to see the latest.", stale: true };
    case "VALIDATION_ERROR": {
      const mapped = fieldErrors.flatMap((entry): SaveFieldError[] => {
        if (FIELD_NAMES.has(entry.path)) return [{ name: entry.path as SaveFieldError["name"], message: "Check this field" }];
        const row = ROW_FIELD.exec(entry.path);
        if (!row) return [];
        const index = rowIndexBySaved[Number(row[1])] ?? Number(row[1]);
        const message = entry.code === "duplicate" ? "Another row already starts on this date" : "Check this field";
        return [{ name: `rows.${index}.${row[2] as "effectiveDate"}`, message }];
      });
      return { fieldErrors: mapped, formError: mapped.length === 0 ? "Some details couldn't be saved. Check the form and try again." : null };
    }
    case "PERMISSION_DENIED":
      return { fieldErrors: [], formError: "You no longer have permission to edit document setup. Nothing was saved.", recheckAccess: true };
    default:
      if (isCallerLicenseCode(domainCode)) return { fieldErrors: [], formError: "Your license doesn't allow this right now. Nothing was saved." };
      if (domainCode === "UNAUTHORIZED") return { fieldErrors: [], formError: "Your session has ended. Sign in again." };
      return { fieldErrors: [], formError: "Couldn't save. Try again." };
  }
}

export function loadErrorMessage(error: unknown, what: string): string {
  const { domainCode } = readDomainError(error);
  if (isCallerLicenseCode(domainCode)) return "Your license doesn't allow using this page right now.";
  if (domainCode === "PERMISSION_DENIED") return `You don't have permission to view ${what}.`;
  if (domainCode === "UNAUTHORIZED") return "Your session has ended. Sign in again.";
  return `Couldn't load ${what}. Try again.`;
}

/** Server row order is by date; this maps it back to the form's row positions for field errors. */
export function savedRowOrder(values: Pick<DocumentSetupFormValues, "rows">): number[] {
  return values.rows
    .map((row, index) => ({ date: row.effectiveDate, index }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.index - b.index)
    .map((entry) => entry.index);
}
