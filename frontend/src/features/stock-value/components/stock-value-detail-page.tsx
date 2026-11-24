"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { DateRange, EmptyCard, ErrorBanner, SearchBox, TableSkeleton, ToolIcons } from "@/features/stock-card/components/parts";
import { StockCardHeaderBlock, StockCardHeaderSkeleton } from "@/features/stock-card/components/stock-card-header";
import { Pager } from "@/features/memo-outstanding-vendor/components/parts";
import { useDebouncedSearch } from "@/features/partner/hooks";
import { printDateFormatter } from "@/features/partner/components/partner-page-parts";
import { isCardMissing, isPermissionDenied, loadErrorMessage, useStockValueAccess, useStockValueHeader, useStockValueTransactions } from "../api";
import {
  activeTxnSort,
  CARD_KEY_PATTERN,
  CARD_MISSING,
  cardName,
  clearFilters,
  filterSummary,
  hasFilters,
  NO_ACCESS,
  pageToClamp,
  parseTxnState,
  stateToSearch,
  toggleSort,
  TXN_ERROR,
  withFilters,
  type TxnState,
} from "../model";
import { BackLink } from "./back-link";
import { DetailPrintContent, StockValuePrintView } from "./print-view";
import { StockValueTransactionsTable } from "./stock-value-transactions-table";

const message = "p-10 text-gms-body text-gms-text-secondary";
const SEARCH_TEXT = "Search document no., stock ID or account";

/** `/report/stock-movement/stock-value/[cardKey]`: needs stock-value VIEW (the server checks every call). */
export function StockValueDetailPage({ cardKey }: { cardKey: string }) {
  const access = useStockValueAccess();
  if (!access) return <p className={message}>Loading…</p>;
  if (!access.view) return <p className={message}>{NO_ACCESS}</p>;
  // A malformed key is the same "no longer exists" as an unknown one; no request is sent for it.
  if (!CARD_KEY_PATTERN.test(cardKey)) return <CardMissing />;
  return <StockValueDetail cardKey={cardKey} canPrint={access.print} />;
}

function CardMissing() {
  return (
    <div className="space-y-3 p-10">
      <p role="alert" className="text-gms-body text-gms-text-secondary">
        {CARD_MISSING}
      </p>
      <BackLink label="Back to Stock Value" />
    </div>
  );
}

function StockValueDetail({ cardKey, canPrint }: { cardKey: string; canPrint: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const state = useMemo(() => parseTxnState(params), [params]);
  const navigate = (next: TxnState) => {
    const query = stateToSearch(next);
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  // Search waits 300 ms after typing; the URL keeps the applied text.
  const [query, setQuery] = useState(state.q);
  const debounced = useDebouncedSearch(query);
  const latest = useRef({ state, navigate });
  useEffect(() => {
    latest.current = { state, navigate };
  });
  useEffect(() => {
    const current = latest.current;
    if (debounced !== current.state.q.trim()) current.navigate(withFilters(current.state, { q: debounced }));
  }, [debounced]);

  const header = useStockValueHeader(cardKey, true);
  const txn = useStockValueTransactions(cardKey, state, true);
  const rows = useMemo(() => txn.data?.items ?? [], [txn.data]);
  const total = txn.data?.total ?? 0;

  const clamp = txn.data ? pageToClamp(state.page, txn.data.total, state.pageSize) : null;
  useEffect(() => {
    if (clamp !== null) latest.current.navigate({ ...latest.current.state, page: clamp });
  }, [clamp]);

  const [printedAt, setPrintedAt] = useState("");
  useEffect(() => {
    const handler = () => flushSync(() => setPrintedAt(printDateFormatter.format(new Date())));
    window.addEventListener("beforeprint", handler);
    return () => window.removeEventListener("beforeprint", handler);
  }, []);
  const print = () => {
    flushSync(() => setPrintedAt(printDateFormatter.format(new Date())));
    window.print();
  };
  const retry = () => {
    void header.refetch();
    void txn.refetch();
  };
  const resetFilters = () => {
    setQuery("");
    navigate(clearFilters(state));
  };

  if (isPermissionDenied(header.error) || isPermissionDenied(txn.error)) return <p className={message}>{NO_ACCESS}</p>;
  if (isCardMissing(header.error) || isCardMissing(txn.error)) return <CardMissing />;

  const head = header.data;
  const headerFailed = header.isError && !head;
  const txnFailed = txn.isError && !txn.data;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <BackLink />
          <span aria-hidden className="text-gms-text-muted">
            /
          </span>
          <h1 className="min-w-0 truncate text-gms-title font-medium text-gms-text-heading">{head ? cardName(head) : "Stock Value"}</h1>
        </div>
        <ToolIcons canPrint={canPrint} printDisabled={rows.length === 0 || !head} printLabel="Print current page" onPrint={print} />
      </div>

      <div className="space-y-4 rounded-gms-lg bg-gms-surface p-4 sm:p-6 print:hidden">
        {head ? (
          <StockCardHeaderBlock header={head} label="Stock value card" />
        ) : headerFailed ? (
          <ErrorBanner message={loadErrorMessage(header.error)} onRetry={retry} />
        ) : (
          <StockCardHeaderSkeleton />
        )}

        <div className="flex flex-wrap items-start gap-2.5">
          <SearchBox value={query} onChange={setQuery} placeholder={SEARCH_TEXT} label={SEARCH_TEXT} />
          <DateRange from={state.from} to={state.to} onFrom={(from) => navigate(withFilters(state, { from }))} onTo={(to) => navigate(withFilters(state, { to }))} label="Date range" />
        </div>

        {txnFailed ? (
          <ErrorBanner message={loadErrorMessage(txn.error, TXN_ERROR)} onRetry={retry} />
        ) : txn.isPending ? (
          <TableSkeleton label="Loading transactions" />
        ) : total === 0 ? (
          hasFilters(state) ? <EmptyCard message="No transactions in this period." onClear={resetFilters} /> : <EmptyCard message="No transactions." />
        ) : (
          <>
            <StockValueTransactionsTable
              rows={rows}
              totals={txn.data!.totals}
              page={state.page}
              pageSize={state.pageSize}
              sort={activeTxnSort(state)}
              onSort={(key) => navigate(toggleSort(state, activeTxnSort(state), key))}
            />
            <Pager page={state.page} pageSize={state.pageSize} total={total} onPage={(page) => navigate({ ...state, page })} onPageSize={(pageSize) => navigate({ ...state, pageSize, page: 1 })} />
          </>
        )}
      </div>

      {canPrint && head && txn.data && rows.length > 0 && (
        <StockValuePrintView>
          <DetailPrintContent header={head} rows={rows} totals={txn.data.totals} filters={filterSummary(state)} printedAt={printedAt} />
        </StockValuePrintView>
      )}
    </div>
  );
}
