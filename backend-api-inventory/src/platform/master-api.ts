import { mapReadError, type CallOptions, type MasterTransport } from "./master-client";

/** Typed calls of the master internal API (load-to-stock api-contract "Master internal API"). */
export type PriceUnit = "PER_CT" | "PER_PCS";
export type StoneAttrs = {
  stoneCodeId: string | null; stoneCode: string;
  stone: string; shape: string; size: string; color: string; clarity: string; cutting: string; quality: string;
  lot: string; cerType: string; cerNo: string;
};
export type PurchaseLineRef = StoneAttrs & {
  purchaseLineId: string;
  purchase: { id: string; docNo: string; docDate: string; currency: string; rate: string };
  location: string;
  priceUnit: PriceUnit;
  unitPrice: string; netUnitPrice: string; unitCostBase: string;
  pcs: number; weightCt: string;
  remainingPcs: number; remainingWeightCt: string; remainingAmountBase: string;
  photoCount: number;
  itemNote: string;
};
export type BatchLine = PurchaseLineRef & { status: "OPEN" | "CLOSED" | "UNAVAILABLE"; vendorId: string };
export type Reference = { companyCurrency: string | null; stone: unknown; locations: string[] };
export type AllocationLine = { purchaseLineId: string; pcs: number; weightCt: string };
export type AllocationRequest = { vendorId: string; lines: AllocationLine[]; newStockIdCount: number };
export type AllocationResponse = { revision: number; stockIds: string[]; lines: { purchaseLineId: string; remainingPcs: number; remainingWeightCt: string }[]; replayed: boolean };
export type Numbering = { id: string; prefix: string; separator: string; startNo: number };
export type NumberingKey = "load-to-stock" | "sale";

// ---------- sale (ADR-0054, api-contract "Master internal API") ----------
export type SaleStoneAttrs = {
  stoneCode: string; stone: string; shape: string; size: string; color: string; clarity: string; cutting: string; quality: string;
  lot: string; location: string; cerType: string; cerNo: string;
};
/** `source` (ADR-0058 phase B): whether the Reserve line holds Memo Stock or own stock; absent from an older master = Memo Stock. */
export type ReserveLineRef = SaleStoneAttrs & {
  source?: "MEMO_STOCK" | "OWN_STOCK";
  reserveLineId: string; reserveId: string; reserveNo: string; reserveDate: string; dueDate: string;
  /** Legacy Reserve line: its item; a lot Reserve line (ADR-0055): null with `lotKey`. `stockId` is "" on a lot line. */
  memoStockId: string | null; lotKey?: string | null; stockId: string; priceUnit: PriceUnit;
  netUnitPrice: string; openPcs: number; openWeightCt: string; openAmount: string;
};
export type SaleReference = {
  customers: { id: string; code: string; name: string; active: boolean; currency: string | null; addresses: { id: string; type: string; label: string; isDefault: boolean }[] }[];
  currencies: string[]; companyCurrency: string | null; chargeTypes: string[]; numbering: { configured: boolean }; stone: unknown;
};
export type SaleReserveLineSearch = { customerId: string; currency: string; q?: string; from?: string; to?: string; exclude: string[]; cursor?: string | null; limit: number };
export type SalePrepareRequest = {
  party?: { customerId: string; shippingAddressId: string; invoiceAddressId: string; keepCustomerId?: string };
  currency: string; reserveLineIds: string[]; memoStockIds: string[]; lotKeys?: string[]; saleId?: string;
};
export type PreparedReserveLine = ReserveLineRef & { status: "OPEN" | "CLOSED" | "UNAVAILABLE"; customerId: string; currency: string };
export type PreparedStock = {
  memoStockId: string; stockId: string; priceUnit: PriceUnit; attrs: SaleStoneAttrs; memoReceive: { id: string; docNo: string };
  pendingPcs: number; pendingWeightCt: string; status: "OK" | "UNAVAILABLE";
};
/** Owner 2026-11-24: a Memo Receive photo a Sale line wants to reference, checked by master against the line's Memo Stock / lot. */
export type SalePhotoRef = { fileId: string; memoStockId?: string | null; lotKey?: string | null };
export type SalePrepared = {
  /** Keys `fileId|memoStockId|lotKey` of the requested photo references master confirmed. */
  photoRefsOk?: string[];
  party: { code: string; name: string; shippingText: string; invoiceText: string } | null;
  partyErrors: { path: string; code: string }[];
  currencyActive: boolean; companyCurrency: string | null;
  reserveLines: PreparedReserveLine[]; memoStocks: PreparedStock[];
  /** ADR-0055 D7: Memo Stock lots of From Stock lot lines (group snapshot, available incl. this Sale's own). */
  memoLots?: PreparedLot[];
};
export type PreparedLot = { lotKey: string; status: "OK" | "UNAVAILABLE"; stockCount?: number; priceUnit?: PriceUnit; attrs?: SaleStoneAttrs; pendingPcs?: number; pendingWeightCt?: string };
/** v2 (ADR-0055 D7): a STOCK line names `memoStockId` (legacy) or `lotKey`; a RESERVE line may omit `memoStockId`. */
export type SaleConsumptionLine = { lineId: string; source: "RESERVE" | "STOCK"; reserveLineId?: string; memoStockId?: string; lotKey?: string; pcs: number; weightCt: string };
/** Master's per-stock allocation of a line (server-to-server only, copied into sale_line_alloc; never returned publicly). */
export type SaleLineAllocation = { lineId: string; rows: { seq: number; source?: "MEMO_STOCK" | "OWN_STOCK"; stockUuid: string; stockId: string; pcs: number; weightCt: string }[] };
export type SaleConsumptionRequest = { saleDocNo: string; customerId: string; currency: string; lines: SaleConsumptionLine[] };
export type SaleCapLine = { lineId: string; capPcs: number; capWeightCt: string };
export type SaleConsumptionResponse = { revision: number; replayed: boolean; lines: SaleCapLine[]; allocations?: SaleLineAllocation[] };

/** Reads wrap failures as 503 MASTER_UNAVAILABLE; the allocation PUT/GET keep the raw outcome for the saga. */
export class MasterApi {
  private referenceCache: { value: Reference; expiresAt: number } | null = null;

  constructor(readonly transport: MasterTransport, private readonly now: () => number = Date.now) {}

  private async read<T>(run: () => Promise<T>): Promise<T> {
    try { return await run(); } catch (error) { throw mapReadError(error); }
  }

  reference(options?: CallOptions): Promise<Reference> {
    return this.read(async () => {
      const value = await this.transport.json<Reference>("GET", "/reference", undefined, options);
      this.referenceCache = { value, expiresAt: this.now() + 60_000 };
      return value;
    });
  }

  /** Company currency for a Save: a 60 s in-process copy (one value) keeps a Save at 3 master calls (NP-LS-04). */
  async companyCurrency(options?: CallOptions): Promise<string | null> {
    if (this.referenceCache && this.referenceCache.expiresAt > this.now()) return this.referenceCache.value.companyCurrency;
    return (await this.reference(options)).companyCurrency;
  }

  vendors(query: { q?: string; cursor?: string; limit?: number }, options?: CallOptions) {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (query.cursor) params.set("cursor", query.cursor);
    if (query.limit) params.set("limit", String(query.limit));
    const suffix = params.toString() ? `?${params}` : "";
    return this.read(() => this.transport.json<{ items: { id: string; code: string; name: string }[]; nextCursor: string | null }>("GET", `/vendors/loadable${suffix}`, undefined, options));
  }

  search(input: Record<string, unknown>, options?: CallOptions) {
    return this.read(() => this.transport.json<{ items: PurchaseLineRef[]; nextCursor: string | null; total: number }>("POST", "/purchase-lines/loadable/search", input, options));
  }

  batch(ids: string[], excludeAllocationOf: string | undefined, options?: CallOptions) {
    return this.read(() => this.transport.json<{ items: BatchLine[] }>("POST", "/purchase-lines/batch", { ids, ...(excludeAllocationOf ? { excludeAllocationOf } : {}) }, options));
  }

  resolve(stoneCodeIds: string[], locationNames: string[], options?: CallOptions) {
    return this.read(() => this.transport.json<{ stoneCodes: { id: string; code: string; active: boolean }[]; locations: { input: string; name: string }[] }>(
      "POST", "/master-data/resolve", { stoneCodeIds, locationNames }, options));
  }

  /** Document Setup row in effect (ADR-0052 D10); `transactionKey` from the master allow-list (sale ADR-0054 D10). */
  numbering(docDate: string, markUsed: boolean, options?: CallOptions, transactionKey: NumberingKey = "load-to-stock") {
    return this.read(() => this.transport.json<{ numbering: Numbering | null }>("POST", "/document-numbering/resolve", { transactionKey, docDate, markUsed }, options));
  }

  // ---------- sale SA rev 1 api-contract "Master internal API" (BE-SL-002/005) ----------

  /** Options of the Sale page (`quotation.options` shape for key `sale`). */
  saleReference(includeCustomerId: string | undefined, options?: CallOptions) {
    const suffix = includeCustomerId ? `?includeCustomerId=${encodeURIComponent(includeCustomerId)}` : "";
    return this.read(() => this.transport.json<SaleReference>("GET", `/sale/reference${suffix}`, undefined, options));
  }

  /** From Reserve picker page (one master query). */
  saleReserveLines(input: SaleReserveLineSearch, options?: CallOptions) {
    return this.read(() => this.transport.json<{ items: ReserveLineRef[]; nextCursor: string | null }>("POST", "/sale/reserve-lines/search", input, options));
  }

  /** Save / Submit / detail validation reads (≤ 4 master queries, no lock). */
  salePrepare(input: SalePrepareRequest, options?: CallOptions) {
    return this.read(() => this.transport.json<SalePrepared>("POST", "/sale/prepare", input, options));
  }

  /** Raw outcome (MasterRefusal / MasterUnavailable propagate) — the saga decides. */
  putSaleConsumption(saleId: string, revision: number, request: SaleConsumptionRequest, options?: CallOptions) {
    return this.transport.json<SaleConsumptionResponse>("PUT", `/sale-consumptions/${saleId}`, { revision, ...request }, { ...options, retry: false });
  }

  getSaleConsumption(saleId: string, options?: CallOptions) {
    return this.transport.json<{ revision: number; lines: SaleCapLine[]; allocations?: SaleLineAllocation[] }>("GET", `/sale-consumptions/${saleId}`, undefined, options);
  }

  /** Raw outcome (MasterRefusal / MasterUnavailable propagate) — the saga decides. */
  putAllocation(loadId: string, revision: number, request: AllocationRequest, options?: CallOptions) {
    return this.transport.json<AllocationResponse>("PUT", `/load-allocations/${loadId}`, { revision, ...request }, { ...options, retry: false });
  }

  getAllocation(loadId: string, options?: CallOptions) {
    return this.transport.json<{ revision: number; lines: AllocationLine[]; stockIds: string[] }>("GET", `/load-allocations/${loadId}`, undefined, options);
  }

  linePhotos(lineId: string, options?: CallOptions) {
    return this.read(() => this.transport.json<{ items: { fileId: string; position: number; contentType: string; sizeBytes: number; sha256: string }[] }>("GET", `/purchase-lines/${lineId}/photos`, undefined, options));
  }

  /** The bytes of a Memo Receive photo referenced by a Sale line; master checks it belongs to the Memo Stock / lot named (404 otherwise). */
  saleMemoPhoto(fileId: string, ref: { memoStockId: string | null; lotKey: string | null }, options?: CallOptions) {
    const query = ref.memoStockId ? `memoStockId=${ref.memoStockId}` : `lotKey=${ref.lotKey ?? ""}`;
    return this.transport.stream(`/sale/memo-photos/${fileId}?${query}`, options);
  }

  fileContent(fileId: string, options?: CallOptions) {
    return this.transport.stream(`/files/${fileId}/content`, options);
  }
}
