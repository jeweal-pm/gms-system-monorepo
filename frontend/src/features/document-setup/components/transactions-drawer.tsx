"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, cx, focusRing } from "@/components/ui/button";
import { CountBadge } from "@/components/ui/card";
import type { DocumentTransaction } from "../schema";

export const TRANSACTIONS_DRAWER_ID = "document-setup-drawer";

/** Search by transaction name, saved code or default code (client-side; the list is ≤ 30). */
export function filterTransactions(items: readonly DocumentTransaction[], query: string): DocumentTransaction[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...items];
  return items.filter((item) => item.label.toLowerCase().includes(q) || (item.code ?? item.defaultCode).toLowerCase().includes(q));
}

type TransactionsDrawerProps = {
  open: boolean;
  items: readonly DocumentTransaction[] | undefined;
  status: "pending" | "error" | "success";
  errorMessage?: string;
  onRetry: () => void;
  selectedKey: string | null;
  onSelect: (item: DocumentTransaction) => void;
  onClose: () => void;
};

/** Right drawer "Transactions" (FE-DS-002): fixed list, search, "Not set up" for never-saved ones. */
export function TransactionsDrawer({ open, items, status, errorMessage, onRetry, selectedKey, onSelect, onClose }: TransactionsDrawerProps) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => filterTransactions(items ?? [], query), [items, query]);
  return (
    <aside
      id={TRANSACTIONS_DRAWER_ID}
      aria-label="Transactions"
      hidden={!open}
      className={cx(
        "absolute inset-y-0 right-0 z-30 w-full shrink-0 flex-col border-l border-gms-border-drawer bg-gms-surface shadow-gms-overlay sm:w-80 print:hidden",
        open ? "flex" : "hidden",
      )}
    >
      <header className="flex h-[58px] shrink-0 items-center justify-between border-b border-gms-border px-4">
        <div className="flex items-center gap-3">
          <h2 className="text-gms-heading font-semibold text-gms-text">Transactions</h2>
          {items && <CountBadge>{items.length}</CountBadge>}
        </div>
        <button type="button" aria-label="Close transactions panel" onClick={onClose} className={cx("rounded-gms-sm p-1 text-gms-text hover:bg-gms-surface-sunken", focusRing)}>
          <X size={20} aria-hidden />
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col px-2 pt-3">
        <label className="relative block">
          <span className="sr-only">Search transactions</span>
          <Search size={18} aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gms-text" />
          <input
            type="search"
            value={query}
            maxLength={100}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search transaction..."
            autoComplete="off"
            className="h-10 w-full rounded-gms-md border border-gms-border bg-gms-surface pl-11 pr-3 text-gms-body text-gms-text outline-none placeholder:text-gms-text-placeholder focus:border-gms-primary focus:ring-2 focus:ring-gms-primary/20"
          />
        </label>
        <ul className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto pb-4" aria-label="Transaction list" aria-busy={status === "pending" || undefined}>
          {status === "pending" &&
            Array.from({ length: 4 }, (_, index) => (
              <li key={index} aria-hidden className="space-y-2 px-3 py-3">
                <div className="h-4 w-1/2 animate-pulse rounded bg-gms-surface-sunken" />
                <div className="h-3 w-1/4 animate-pulse rounded bg-gms-surface-sunken" />
              </li>
            ))}
          {status === "error" && (
            <li role="alert" className="space-y-2 px-3 py-3">
              <p className="text-gms-body text-gms-text">{errorMessage ?? "Couldn't load transactions."}</p>
              <Button onClick={onRetry}>Retry</Button>
            </li>
          )}
          {status === "success" && visible.length === 0 && <li className="px-3 py-3 text-gms-body text-gms-text-secondary">{`No transactions match "${query.trim()}"`}</li>}
          {visible.map((item) => {
            const selected = item.transactionKey === selectedKey;
            return (
              <li key={item.transactionKey}>
                <button
                  type="button"
                  aria-current={selected ? "true" : undefined}
                  onClick={() => onSelect(item)}
                  className={cx(
                    "flex w-full items-start gap-3 rounded-gms-md px-3 py-2.5 text-left transition-colors",
                    selected ? "bg-gms-nav-active" : "hover:bg-gms-surface-sunken",
                    focusRing,
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-gms-text">{item.label}</span>
                    <span className={cx("block truncate text-gms-body", item.configured ? "text-gms-text-secondary" : "text-gms-text-placeholder")}>
                      {item.configured ? item.code : "Not set up"}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
