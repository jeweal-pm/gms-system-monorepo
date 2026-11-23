import { Logger } from "@nestjs/common";

/** Keeps test output readable: Nest log lines are not part of the assertions. */
Logger.overrideLogger(false);

/**
 * FE-LOT-008: production refuses new item references (`lot_required`). The suites of the pre-lot item flows keep covering
 * the legacy item paths through this Vitest-only seam (`acceptNewItemReferences` in trade-document/lot-key.ts); the
 * lot_required suites switch it off explicitly.
 */
process.env.LOT_TEST_ACCEPT_ITEM_REFS ??= "1";
