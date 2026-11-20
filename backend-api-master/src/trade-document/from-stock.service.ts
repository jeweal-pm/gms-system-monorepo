import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { inventoryClient, type OwnStockRow } from "../inventory-client/inventory-client";
import { decodeStockCursor, encodeStockCursor, MemoStockService } from "./memo-stock.service";

/**
 * fromStock.list (ADR-0052 D16, SA-LS-P2-01): the customer-side From Stock picker (Quotation, Reserve, Memo Out) as ONE
 * list of Memo Stock and our stock, ordered by (ref doc date DESC, Stock ID DESC). Stock IDs come from one counter and are
 * unique across both stocks, so that key is a total order and the existing cursor `base64url(date|stockId)` pages both
 * sides. Per page: the Memo Stock query (LIMIT limit + 1) and ONE inventory call (`stock/available`, limit + 1, 2 s) in
 * parallel, merged here (NP-LS-P2-01). Inventory failing or slow → Memo Stock rows only with `ownStock: "UNAVAILABLE"`.
 * `location`: "Memo" → Memo Stock only (inventory not called); another name → our stock only.
 */
const DAY_MS = 86_400_000;
export const fromStockListSchema = z.object({
  q: z.string().trim().max(100).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  location: z.string().trim().min(1).max(40).optional(),
  cursor: z.string().max(200).nullish(),
  direction: z.enum(["forward", "backward"]).optional(),
  limit: z.number().int().min(1).max(50).default(50),
}).strict().superRefine((value, ctx) => {
  if (value.from && value.to) {
    const days = (Date.parse(value.to) - Date.parse(value.from)) / DAY_MS;
    if (days < 0) ctx.addIssue({ code: "custom", path: ["to"], params: { code: "before_from" }, message: "before_from" });
    else if (days > 366) ctx.addIssue({ code: "custom", path: ["to"], params: { code: "range_too_long" }, message: "range_too_long" });
  }
});
export type FromStockListInput = z.output<typeof fromStockListSchema>;

type MemoItem = Awaited<ReturnType<MemoStockService["list"]>>["items"][number];
export type FromStockItem = Omit<MemoItem, "location" | "unitPrice" | "netUnitPrice" | "amount" | "memoReceive" | "ref"> & {
  location: string;
  unitPrice: string | null;
  netUnitPrice: string | null;
  amount: string | null;
  memoReceive: MemoItem["memoReceive"] | null;
  ref: { type: "MEMO_RECEIVE" | "LOAD"; id: string; docNo: string; docDate: string };
  source: "MEMO_STOCK" | "OWN_STOCK";
  load: { id: string; docNo: string; docDate: string } | null;
  ownStock: { stockPrice: string; salePrice: string; priceUnit: "PER_CT" | "PER_PCS" } | null;
};

/** Sort key of a row: (ref date, Stock ID), both DESC. */
const keyOf = (item: FromStockItem) => ({ date: item.ref.docDate, stockId: item.stockId });
export function compareDesc(a: FromStockItem, b: FromStockItem): number {
  const ka = keyOf(a);
  const kb = keyOf(b);
  if (ka.date !== kb.date) return ka.date < kb.date ? 1 : -1;
  return ka.stockId === kb.stockId ? 0 : ka.stockId < kb.stockId ? 1 : -1;
}

/**
 * Merge rule (UT-LS-P2-01): `memo` is the first ≤ limit Memo Stock rows (`memoMore` = that side has more), `own` the
 * first ≤ limit + 1 own rows. Items = the first `limit` of the merged order; nextCursor = the last item's key when
 * anything is left on either side.
 */
export function mergePages(memo: FromStockItem[], memoMore: boolean, own: FromStockItem[], limit: number) {
  const merged = [...memo, ...own].sort(compareDesc);
  const items = merged.slice(0, limit);
  const more = memoMore || merged.length > limit;
  const last = items.at(-1);
  return { items, nextCursor: more && last ? encodeStockCursor(last.ref.docDate, last.stockId) : null };
}

export function ownStockItem(row: OwnStockRow): FromStockItem {
  return {
    id: row.stockUuid,
    stockId: row.stockId,
    stoneCode: row.stoneCode,
    lot: row.lot,
    location: row.location,
    itemNote: row.itemNote,
    stone: row.stone,
    shape: row.shape,
    size: row.size,
    color: row.color,
    clarity: row.clarity,
    cutting: row.cutting,
    quality: row.quality,
    cerType: row.cerType,
    cerNo: row.cerNo,
    receivedPcs: row.pcs,
    receivedWeightCt: row.weightCt,
    pendingPcs: row.availablePcs,
    pendingWeightCt: row.availableWeightCt,
    priceUnit: row.priceUnit === "PER_CT" ? "CTS" : "PCS",
    unitPrice: null,
    netUnitPrice: null,
    currency: row.currency,
    amount: null,
    vendor: row.vendor,
    memoReceive: null,
    ref: { type: "LOAD", id: row.load.id, docNo: row.load.docNo, docDate: row.load.docDate },
    source: "OWN_STOCK",
    load: row.load,
    ownStock: { stockPrice: row.stockPrice, salePrice: row.salePrice, priceUnit: row.priceUnit },
  };
}


@Injectable()
export class FromStockService {
  private readonly logger = new Logger("FromStock");
  constructor(private readonly memoStock: MemoStockService = new MemoStockService()) {}

  async list(input: FromStockListInput, requestId?: string) {
    const location = input.location?.toLowerCase();
    const memoOnly = location === "memo";
    const ownOnly = location !== undefined && !memoOnly;
    // One cursor for both sides (400 VALIDATION_ERROR when malformed, before any query or call).
    const after = input.cursor ? decodeStockCursor(input.cursor) : undefined;
    const memoPromise = ownOnly
      ? Promise.resolve({ items: [] as MemoItem[], nextCursor: null as string | null })
      : this.memoStock.list({ q: input.q, from: input.from, to: input.to, cursor: input.cursor, limit: input.limit });
    const ownPromise: Promise<OwnStockRow[] | null> = memoOnly
      ? Promise.resolve([])
      : inventoryClient()
        .available({ q: input.q || undefined, from: input.from, to: input.to, location: ownOnly ? input.location : undefined, after: after ? { date: after.docDate, stockId: after.stockId } : undefined, limit: input.limit + 1 }, { requestId })
        .catch((error: unknown) => {
          this.logger.warn({ event: "master.from_stock_inventory_unavailable", reason: error instanceof Error ? error.message.slice(0, 40) : "unknown" });
          return null;
        });
    const [memo, own] = await Promise.all([memoPromise, ownPromise]);
    const memoItems = memo.items.map((item): FromStockItem => ({ ...item, source: "MEMO_STOCK", load: null, ownStock: null }));
    const page = mergePages(memoItems, memo.nextCursor !== null, (own ?? []).map(ownStockItem), input.limit);
    return { ...page, ownStock: own === null ? ("UNAVAILABLE" as const) : ("OK" as const) };
  }
}
