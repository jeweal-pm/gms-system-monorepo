import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import type { Readable } from "node:stream";
import { partnerException } from "../common/errors";
import { isPrismaUnavailable, WRITE_TX } from "../common/persistence";
import { prisma } from "../database/prisma-client";
import { resolveExternalNumbering } from "../document-setup/document-numbering";
import { Prisma } from "../generated/prisma/client";
import { activeLocationNames } from "../location-master/location-master.service";
import { stoneLineOptions } from "../quotation/quotation.service";
import { createPhotoStore, sizeGuard, PHOTO_MAX_BYTES } from "../quotation/quotation-photo.storage";
import { LINE_PHOTO_DOCUMENTS } from "../trade-document/line-photos";
import { customerDocumentOptions } from "../trade-document/customer-stock-document";
import { allocationException, applyAllocation, unpackResult, type AllocationResult } from "./allocation";
import type {
  AllocationPutInput, LineBatchInput, LoadableSearchInput, MasterDataResolveInput, NumberingResolveInput, SaleConsumptionPutInput, SalePrepareInput, SaleReferenceQuery,
  SaleReserveLineSearchInput, VendorsQuery,
} from "./inventory-internal.schemas";
import { lineBatch, loadableVendors, searchLoadableLines } from "./purchase-lines";
import { applyConsumption, consumptionException, unpackCaps, type ConsumptionResult } from "./sale-consumption";
import { prepareSale, searchSaleReserveLines } from "./sale-reads";

const PURCHASE_PHOTO = LINE_PHOTO_DOCUMENTS.purchase;

/**
 * The master side of Load to Stock (load-to-stock SA rev 1, ADR-0052, BE-LS-004/013): read paths for the inventory
 * service and the idempotent allocation. Master never calls inventory. Logs carry ids and counts only.
 */
@Injectable()
export class InventoryInternalService {
  private readonly logger = new Logger("InventoryInternal");
  /** Stock ID clock (read after the Stock ID lock); replaced in tests only. */
  clock: () => Date = () => new Date();
  private readonly photos = createPhotoStore(PURCHASE_PHOTO.module);

  /** Company currency, stone options as Purchase, and active Location Master names (ADR-0053 D3), ≤ 500. */
  async reference() {
    return this.read("reference", async () => {
      const [company, stone, locations] = await Promise.all([
        prisma.companyProfile.findUnique({ where: { id: 1 }, select: { currencyCode: true } }),
        stoneLineOptions(),
        activeLocationNames(),
      ]);
      return { companyCurrency: company?.currencyCode ?? null, stone, locations };
    });
  }

  vendors(query: VendorsQuery) {
    return this.read("vendors", () => loadableVendors(query));
  }

  search(input: LoadableSearchInput) {
    return this.read("search", () => searchLoadableLines(input));
  }

  batch(input: LineBatchInput) {
    return this.read("batch", () => lineBatch(input));
  }

  /**
   * ADR-0052 D11: one query per kind. Stone codes by id (with `active`); location names matched to ACTIVE Location
   * Master rows case-insensitively, answering master's spelling; unmatched inputs are absent.
   */
  async resolveMasterData(input: MasterDataResolveInput) {
    return this.read("master_data", async () => {
      const ids = [...new Set(input.stoneCodeIds)];
      const names = [...new Set(input.locationNames)];
      const [stoneCodes, locations] = await Promise.all([
        ids.length === 0 ? Promise.resolve([]) : prisma.$queryRaw<{ id: string; code: string; active: boolean }[]>(Prisma.sql`
          SELECT "id", "code", "active" FROM "stone"."stone_code" WHERE "id" = ANY(${ids}::uuid[]) ORDER BY "id"`),
        names.length === 0 ? Promise.resolve([]) : prisma.$queryRaw<{ input: string; name: string }[]>(Prisma.sql`
          SELECT i."input", l."name" FROM unnest(${names}::text[]) AS i("input")
          JOIN "partner"."location" l ON lower(l."name") = lower(i."input") AND l."active"
          ORDER BY i."input"`),
      ]);
      return { stoneCodes, locations };
    });
  }

  /** ADR-0052 D10: the Document Setup row in effect; `markUsed` sets `external_used_at` once (idempotent). */
  async resolveNumbering(input: NumberingResolveInput) {
    return this.read("numbering", async () => {
      const row = await resolveExternalNumbering(prisma, input.transactionKey, new Date(`${input.docDate}T00:00:00Z`), input.markUsed);
      return { numbering: row ? { id: row.id, prefix: row.prefix, separator: row.separator, startNo: row.startNo } : null };
    });
  }

  /** ADR-0052 D4: one WRITE_TX (4 s, below inventory's 5 s client timeout). */
  async putAllocation(loadId: string, input: AllocationPutInput, actorId: string | null): Promise<AllocationResult> {
    try {
      const result = await prisma.$transaction((tx) => applyAllocation(tx, loadId, input, actorId, this.clock), WRITE_TX);
      this.logger.log({ event: result.replayed ? "load_allocation.replayed" : "load_allocation.applied", loadId, revision: result.revision, lineCount: input.lines.length, stockIdCount: result.stockIds.length });
      return result;
    } catch (error) {
      throw this.mapError(error, "allocation");
    }
  }

  async getAllocation(loadId: string) {
    return this.read("allocation_get", async () => {
      const header = await prisma.loadAllocation.findUnique({
        where: { loadDocumentId: loadId },
        select: { appliedRevision: true, result: true, lines: { orderBy: { purchaseLineId: "asc" }, select: { purchaseLineId: true, pcs: true, weightCt: true } } },
      });
      if (!header) throw allocationException("LOAD_ALLOCATION_NOT_FOUND", HttpStatus.NOT_FOUND);
      return {
        revision: header.appliedRevision,
        lines: header.lines.map((line) => ({ purchaseLineId: line.purchaseLineId, pcs: line.pcs, weightCt: line.weightCt.toFixed(3) })),
        stockIds: unpackResult(header.result).stockIds,
      };
    });
  }

  // ---------- sale SA rev 1 / ADR-0054 (BE-SL-002) ----------

  /** Options of the Sale page: the `quotation.options` shape for Document Setup key `sale`. */
  saleReference(query: SaleReferenceQuery) {
    return this.read("sale_reference", () => customerDocumentOptions("sale", query.includeCustomerId));
  }

  /** From Reserve picker page (one keyset query, no count). */
  saleReserveLines(input: SaleReserveLineSearchInput) {
    return this.read("sale_reserve_lines", () => searchSaleReserveLines(input));
  }

  /** Save / Submit / detail validation reads (≤ 4 queries, no lock). */
  salePrepare(input: SalePrepareInput) {
    return this.read("sale_prepare", () => prepareSale(input));
  }

  /** ADR-0054 D6: one WRITE_TX (4 s, below inventory's 5 s client timeout); no lock is held outside it. */
  async putSaleConsumption(saleId: string, input: SaleConsumptionPutInput, actorId: string | null): Promise<ConsumptionResult> {
    try {
      const result = await prisma.$transaction((tx) => applyConsumption(tx, saleId, input, actorId), WRITE_TX);
      this.logger.log({ event: result.replayed ? "sale_consumption.replayed" : "sale_consumption.applied", saleId, revision: result.revision, lineCount: input.lines.length });
      return result;
    } catch (error) {
      throw this.mapError(error, "sale_consumption");
    }
  }

  /** Recovery read of the applied revision and lines (set + caps of the last apply). */
  async getSaleConsumption(saleId: string) {
    return this.read("sale_consumption_get", async () => {
      const header = await prisma.saleConsumption.findUnique({
        where: { saleId },
        select: { revision: true, result: true },
      });
      if (!header) throw consumptionException("SALE_CONSUMPTION_NOT_FOUND", HttpStatus.NOT_FOUND);
      return { revision: header.revision, lines: unpackCaps(header.result) };
    });
  }

  /** Photos of a line of an approved, live Purchase (≤ 5, in order); any other line → 404. One query. */
  async linePhotos(lineId: string) {
    return this.read("line_photos", async () => {
      const rows = await prisma.$queryRaw<{ line_id: string; file_id: string | null; position: number | null; content_type: string | null; size_bytes: bigint | null; sha256: string | null }[]>(Prisma.sql`
        SELECT l."id" AS "line_id", f."id" AS "file_id", ph."position", f."content_type", f."size_bytes", f."sha256"
        FROM "partner"."purchase_line" l
        JOIN "partner"."purchase" p ON p."id" = l."purchase_id" AND p."status" = 'APPROVED' AND p."deleted_at" IS NULL
        LEFT JOIN "partner"."purchase_line_photo" ph ON ph."line_id" = l."id"
        LEFT JOIN "partner"."stored_files" f ON f."id" = ph."file_id" AND f."status" = 'ready' AND f."source_type" = ${PURCHASE_PHOTO.source}
        WHERE l."id" = ${lineId}::uuid
        ORDER BY ph."position"`);
      if (rows.length === 0) throw partnerException("NOT_FOUND", HttpStatus.NOT_FOUND);
      return {
        items: rows.filter((row) => row.file_id !== null).slice(0, 5).map((row) => ({
          fileId: row.file_id!, position: Number(row.position), contentType: row.content_type!, sizeBytes: Number(row.size_bytes), sha256: row.sha256!,
        })),
      };
    });
  }

  /** Bytes of a ready Purchase line photo of an approved, live Purchase only; anything else → 404. Streamed. */
  async fileContent(fileId: string): Promise<{ contentType: string; size: number; sha256: string; stream: Readable }> {
    const file = await this.read("file_content", async () => {
      const rows = await prisma.$queryRaw<{ object_key: string; content_type: string; size_bytes: bigint; sha256: string }[]>(Prisma.sql`
        SELECT f."object_key", f."content_type", f."size_bytes", f."sha256" FROM "partner"."stored_files" f
        WHERE f."id" = ${fileId}::uuid AND f."status" = 'ready' AND f."source_type" = ${PURCHASE_PHOTO.source} AND f."bucket" = 'files'
          AND EXISTS (SELECT 1 FROM "partner"."purchase_line_photo" ph JOIN "partner"."purchase_line" l ON l."id" = ph."line_id"
            JOIN "partner"."purchase" p ON p."id" = l."purchase_id" WHERE ph."file_id" = f."id" AND p."status" = 'APPROVED' AND p."deleted_at" IS NULL)
        LIMIT 1`);
      return rows[0] ?? null;
    });
    if (!file) throw partnerException("NOT_FOUND", HttpStatus.NOT_FOUND);
    let opened: { size: number; stream: Readable } | null;
    try {
      opened = await this.photos.open(file.object_key);
    } catch {
      opened = null;
    }
    if (!opened) throw partnerException("NOT_FOUND", HttpStatus.NOT_FOUND);
    const size = Math.min(opened.size, PHOTO_MAX_BYTES);
    return { contentType: file.content_type, size, sha256: file.sha256, stream: opened.stream.pipe(sizeGuard(size)) };
  }

  private async read<T>(operation: string, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      throw this.mapError(error, operation);
    }
  }

  private mapError(error: unknown, operation: string) {
    if (error && typeof error === "object" && "getStatus" in error) return error as unknown as Error;
    if (isPrismaUnavailable(error)) {
      this.logger.warn({ event: "inventory_internal.db_unavailable", operation });
      return partnerException("PARTNER_UNAVAILABLE", HttpStatus.SERVICE_UNAVAILABLE);
    }
    this.logger.error({ event: "inventory_internal.failed", operation, errorName: error instanceof Error ? error.name : typeof error });
    return partnerException("INTERNAL_SERVER_ERROR", HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
