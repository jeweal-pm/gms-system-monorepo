/**
 * The report guard moved to `../guard` (stock-value BE-SV-002) so Stock Card and Stock Value share one instance and one limit of
 * two report queries in flight. This module keeps the original import path; Stock Card keeps its `STOCK_CARD_*` codes (the default).
 */
export {
  REPORT_MAX_IN_FLIGHT, REPORT_RETRY_AFTER_SECONDS, REPORT_STATEMENT_TIMEOUT_MS, REPORT_WAIT_MS, ReportGuard, isQueryCanceled, runReport,
  type ReportOptions,
} from "../guard";
