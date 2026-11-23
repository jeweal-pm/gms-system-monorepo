"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { cx, focusRing } from "@/components/ui/button";
import { parseListState, STOCK_CARD_HREF, stateToSearch } from "../model";
import { recalledListSearch } from "../view-prefs";

const noSubscribe = () => () => {};
const recall = () => recalledListSearch(typeof window === "undefined" ? undefined : window.sessionStorage);

/** The list route with the filters the user left it with; re-parsed so only known, bounded values come back. */
export function listReturnHref(remembered: string): string {
  const search = stateToSearch(parseListState(new URLSearchParams(remembered)));
  return search ? `${STOCK_CARD_HREF}?${search}` : STOCK_CARD_HREF;
}

/** "‹ Stock Card": text in the primary colour, a pill on hover (S3), the focus ring; returns to the list with its filters. */
export function BackLink({ label = "Stock Card" }: { label?: string }) {
  const remembered = useSyncExternalStore(noSubscribe, recall, () => "");
  return (
    <Link
      href={listReturnHref(remembered)}
      className={cx("inline-flex items-center gap-1 rounded-gms-md px-2 py-1 text-gms-label font-medium text-gms-primary transition-colors hover:bg-gms-count-badge", focusRing)}
    >
      <ChevronLeft size={14} aria-hidden />
      {label}
    </Link>
  );
}
