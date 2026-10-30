"use client";

import { FileSearch } from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/features/quotation/lib/format";
import { authTrpc } from "@/lib/auth-trpc";
import { isCallerLicenseCode, readDomainError } from "@/lib/trpc-error";
import type { SaveOutcome } from "./document-form";

/** Helpers shared by the memo documents (ADR-0033): permissions, error messages and the daybook list. */

export type DocumentAccess = { view: boolean; add: boolean; edit: boolean; delete: boolean; approve: boolean };
type Mine = { isSuperAdmin: boolean; permissions: "ALL" | readonly string[] } | undefined;

/** UX only; the server checks every call with the same catalog leaf. */
export function documentAccess(mine: Mine, menu: string): DocumentAccess {
  const can = (action: string) => Boolean(mine && (mine.isSuperAdmin || mine.permissions === "ALL" || mine.permissions.includes(`${menu}:${action}`)));
  return { view: can("VIEW"), add: can("ADD"), edit: can("EDIT"), delete: can("DELETE"), approve: can("APPROVE") };
}

export function useDocumentAccess(menu: string): DocumentAccess | undefined {
  const mine = authTrpc.permission.mine.useQuery(undefined, { staleTime: 30_000, retry: false });
  return mine.data ? documentAccess(mine.data, menu) : undefined;
}

/** Domain codes `<CODE>_*` (api-contract "Errors") → field errors and one message. */
export function mapDocumentSaveError(error: unknown, code: string, noun: string, headerFields: readonly string[]): SaveOutcome {
  const { domainCode, fieldErrors } = readDomainError(error);
  const onFields = (message: string) => fieldErrors.flatMap((entry) => {
    if (headerFields.includes(entry.path)) return [{ name: entry.path, message: entry.code === "required" ? "Required" : message }];
    if (entry.path.startsWith("lines")) return [{ name: "lines", message: `Check item row ${Number(entry.path.split(".")[1] ?? 0) + 1}` }];
    return [];
  });
  switch (domainCode) {
    case `${code}_REFERENCE_INVALID`:
      return { fieldErrors: onFields("Choose an active option"), message: "A selected party, address, currency or stone code is no longer available." };
    case `${code}_CHANGED`:
      return { fieldErrors: [], message: `Someone else changed this ${noun}. Refresh to see the latest.` };
    case `${code}_STATUS_INVALID`:
      return { fieldErrors: [], message: `This ${noun} can't be changed in its current status.` };
    case `${code}_NOT_FOUND`:
      return { fieldErrors: [], message: `This ${noun} no longer exists.` };
    case "VALIDATION_ERROR":
      return { fieldErrors: onFields("Check this field"), message: "Some details couldn't be saved. Check the form and try again." };
    case "PERMISSION_DENIED":
      return { fieldErrors: [], message: "You don't have permission to do this. Nothing was saved." };
    default:
      if (isCallerLicenseCode(domainCode)) return { fieldErrors: [], message: "Your license doesn't allow this right now. Nothing was saved." };
      if (domainCode === "UNAUTHORIZED") return { fieldErrors: [], message: "Your session has ended. Sign in again." };
      return { fieldErrors: [], message: "Couldn't save. Try again." };
  }
}

export function documentLoadError(error: unknown, code: string, noun: string, plural: string): string {
  const { domainCode } = readDomainError(error);
  if (domainCode === `${code}_NOT_FOUND`) return `This ${noun} no longer exists.`;
  if (domainCode === "PERMISSION_DENIED") return `You don't have permission to view ${plural}.`;
  if (isCallerLicenseCode(domainCode)) return `Your license doesn't allow opening ${plural} right now.`;
  if (domainCode === "UNAUTHORIZED") return "Your session has ended. Sign in again.";
  return `Couldn't load this ${noun}. Try again.`;
}

type DaybookItem = { id: string; docNo: string; docDate: string; status: string; name: string };

/** Right-rail Daybook: the document's list, newest first. */
export function DocumentDaybook({ state, href, plural }: {
  state: { isPending: boolean; isError: boolean; errorMessage?: string; items: DaybookItem[] };
  href: (id: string) => string;
  plural: string;
}) {
  if (state.isPending) return <p className="py-16 text-center text-sm text-[#6B7480]">Loading…</p>;
  if (state.isError) return <p className="py-16 text-center text-sm text-[#E5484D]">{state.errorMessage}</p>;
  if (state.items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-[#6B7480]">
        <FileSearch className="size-10 text-[#1C252E]" strokeWidth={1.5} />
        No {plural} yet.
      </div>
    );
  }
  return (
    <ul className="px-5 py-3">
      {state.items.map((e, i) => (
        <li key={e.id}>
          <Link href={href(e.id)} className="flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-[#F6F7F8]">
            <span className="w-8 shrink-0 text-[#1C252E]">#{i + 1}</span>
            <span className="mt-1.5 size-3 shrink-0 rounded-full bg-[#A9B1B9]" title={e.status} />
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-[#1C252E]">{e.docNo}</span>
              <span className="block truncate text-sm text-[#1C252E]">{e.name}</span>
            </span>
            <span className="shrink-0 text-sm text-[#A9B1B9]">{formatDate(e.docDate)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
