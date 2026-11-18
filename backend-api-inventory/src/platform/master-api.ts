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

  numbering(docDate: string, markUsed: boolean, options?: CallOptions) {
    return this.read(() => this.transport.json<{ numbering: Numbering | null }>("POST", "/document-numbering/resolve", { transactionKey: "load-to-stock", docDate, markUsed }, options));
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

  fileContent(fileId: string, options?: CallOptions) {
    return this.transport.stream(`/files/${fileId}/content`, options);
  }
}
