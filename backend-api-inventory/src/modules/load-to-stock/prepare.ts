import { uuidV7 } from "@gms/storage";
import { AppError, validationError, type FieldError } from "../../platform/errors";
import { Decimal, type Dec } from "../../platform/db";
import type { BatchLine, PriceUnit } from "../../platform/master-api";
import { rowPriceUnit, rowUnitCost, sourceAmount } from "./cost";
import type { LoadInput, Mode } from "./schemas";

/**
 * Save validation (server, authoritative; architecture.md "Validation at Save") from the master reads, without locks:
 * every source is a line of the load's vendor that master reports OPEN; per source Σ row pcs ≤ remaining pcs and
 * Σ weight ≤ remaining weight (`rows.N.pcs` / `exceeds_remaining {purchaseLineId, remainingPcs, remainingWeightCt}`);
 * MERGE takes each source's full remaining (client quantities ignored); row pcs ≥ 1, weight 0 only when every source
 * line weighs 0 (Q-LS-26); locations are active Location Master names stored in master's spelling (or the row's
 * already-stored name on update, ADR-0053 D3); stone codes exist and are active (or unchanged on update).
 * Output: the normalized document with snapshots and company-currency costs.
 */

export type SourceSnapshot = {
  id: string; position: number; purchaseLineId: string; purchaseId: string; purchaseDocNo: string; purchaseDocDate: string;
  purchaseCurrency: string; exchangeRate: string; priceUnit: PriceUnit; unitPrice: string; netUnitPrice: string; unitCostBase: string;
  linePcs: number; lineWeightCt: string; location: string; itemNote: string;
  attrs: { stoneCodeId: string | null; stoneCode: string; stone: string; shape: string; size: string; color: string; clarity: string; cutting: string; quality: string; lot: string; cerType: string; cerNo: string };
};
export type NormalizedRow = {
  id: string; existing: boolean; position: number; location: string; parcel: string;
  attrs: SourceSnapshot["attrs"]; priceUnit: PriceUnit; pcs: number; weightCt: string; unitCostBase: string; costAmountBase: string;
  stockPrice: string; salePrice: string; itemNote: string; photoIds: string[];
  sources: { purchaseLineId: string; pcs: number; weightCt: string; costAmountBase: string }[];
};
export type NormalizedDocument = {
  docDate: string; vendorId: string; vendorCode: string; vendorName: string; currency: string; ref: string; documentNote: string; mode: Mode;
  sources: SourceSnapshot[]; rows: NormalizedRow[];
  totals: { rowCount: number; pcs: number; weightCt: string; costAmountBase: string };
};
export type StoredRowRef = { location: string; stoneCodeId: string | null };

export type PrepareContext = {
  lines: readonly BatchLine[];
  stoneCodes: readonly { id: string; active: boolean }[];
  locations: readonly { input: string; name: string }[];
  /** Rows already stored on the document (update): their own location / stone code may stay. */
  storedRows: ReadonlyMap<string, StoredRowRef>;
  companyCurrency: string;
  vendor: { code: string; name: string } | null;
};

export function lineUnavailable(purchaseLineIds: string[], rowPaths: string[]) {
  return new AppError(422, "LOAD_TO_STOCK_LINE_UNAVAILABLE", { purchaseLineIds, rowPaths });
}

export function prepareDocument(input: LoadInput, context: PrepareContext): NormalizedDocument {
  const byLine = new Map(context.lines.map((line) => [line.purchaseLineId, line]));
  const errors: FieldError[] = [];
  const unavailable = new Set<string>();
  const unavailablePaths: string[] = [];

  // Sources in first-pick order.
  const order: string[] = [];
  input.rows.forEach((row) => row.sources.forEach((source) => { if (!order.includes(source.purchaseLineId)) order.push(source.purchaseLineId); }));
  input.rows.forEach((row, index) => row.sources.forEach((source, sourceIndex) => {
    const line = byLine.get(source.purchaseLineId);
    if (!line || line.status === "UNAVAILABLE") {
      unavailable.add(source.purchaseLineId);
      unavailablePaths.push(`rows.${index}.sources.${sourceIndex}`);
    } else if (line.vendorId !== input.vendorId) {
      errors.push({ path: `rows.${index}.sources.${sourceIndex}.purchaseLineId`, code: "vendor_mismatch" });
    }
  }));
  if (unavailable.size > 0) throw lineUnavailable([...unavailable], unavailablePaths);
  if (errors.length > 0) throw validationError(errors);

  const lineOf = (id: string) => byLine.get(id)!;
  // MERGE: every source at its full remaining (server computes, client quantities ignored).
  const quantities = input.rows.map((row) => row.sources.map((source) => {
    if (input.mode !== "MERGE") return { pcs: source.pcs, weight: new Decimal(source.weightCt) };
    const line = lineOf(source.purchaseLineId);
    return { pcs: line.remainingPcs, weight: new Decimal(line.remainingWeightCt) };
  }));

  // Σ per source ≤ remaining (remaining excludes this load's own applied allocation).
  const taken = new Map<string, { pcs: number; weight: Dec; firstPath: string }>();
  input.rows.forEach((row, index) => row.sources.forEach((source, sourceIndex) => {
    const entry = taken.get(source.purchaseLineId) ?? { pcs: 0, weight: new Decimal(0), firstPath: `rows.${index}` };
    entry.pcs += quantities[index][sourceIndex].pcs;
    entry.weight = entry.weight.plus(quantities[index][sourceIndex].weight);
    taken.set(source.purchaseLineId, entry);
  }));
  for (const [lineId, entry] of taken) {
    const line = lineOf(lineId);
    if (entry.pcs > line.remainingPcs || entry.weight.greaterThan(line.remainingWeightCt) || line.remainingPcs <= 0) {
      errors.push({ path: `${entry.firstPath}.pcs`, code: "exceeds_remaining", params: { purchaseLineId: lineId, remainingPcs: line.remainingPcs, remainingWeightCt: line.remainingWeightCt } });
    }
  }

  const activeCodes = new Set(context.stoneCodes.filter((code) => code.active).map((code) => code.id));
  const masterSpelling = new Map(context.locations.map((location) => [location.input, location.name]));
  const rows: NormalizedRow[] = input.rows.map((row, index) => {
    const stored = row.id ? context.storedRows.get(row.id) : undefined;
    if (row.id && !stored) errors.push({ path: `rows.${index}.id`, code: "unknown_row" });
    const sources = row.sources.map((source, sourceIndex) => {
      const line = lineOf(source.purchaseLineId);
      const { pcs, weight } = quantities[index][sourceIndex];
      return { purchaseLineId: source.purchaseLineId, pcs, weightCt: weight.toFixed(3), costAmountBase: sourceAmount(line.priceUnit, pcs, weight, line.unitCostBase).toFixed(2), line };
    });
    const pcs = sources.reduce((sum, source) => sum + source.pcs, 0);
    const weight = sources.reduce((sum, source) => sum.plus(source.weightCt), new Decimal(0));
    const cost = sources.reduce((sum, source) => sum.plus(source.costAmountBase), new Decimal(0));
    if (pcs < 1) errors.push({ path: `rows.${index}.pcs`, code: "too_small" });
    if (weight.isZero() && !sources.every((source) => new Decimal(source.line.weightCt).isZero())) errors.push({ path: `rows.${index}.weightCt`, code: "too_small" });

    let location = masterSpelling.get(row.location);
    if (!location && stored && stored.location === row.location) location = stored.location;
    if (!location) errors.push({ path: `rows.${index}.location`, code: "location_inactive" });

    const codeId = row.attrs.stoneCodeId;
    if (codeId && !activeCodes.has(codeId) && !(stored && stored.stoneCodeId === codeId)) errors.push({ path: `rows.${index}.attrs.stoneCodeId`, code: "invalid" });

    const priceUnit = rowPriceUnit(input.mode, sources.map((source) => source.line.priceUnit));
    return {
      id: row.id ?? uuidV7(), existing: Boolean(stored), position: index + 1, location: location ?? row.location, parcel: row.parcel ?? "",
      attrs: { ...row.attrs }, priceUnit, pcs, weightCt: weight.toFixed(3),
      unitCostBase: rowUnitCost(priceUnit, pcs, weight, cost).toFixed(4), costAmountBase: cost.toFixed(2),
      stockPrice: new Decimal(row.stockPrice).toFixed(2), salePrice: new Decimal(row.salePrice).toFixed(2), itemNote: row.itemNote ?? "", photoIds: [...row.photoIds],
      sources: sources.map(({ line: _line, ...rest }) => rest),
    };
  });

  const locationErrors = errors.filter((error) => error.code === "location_inactive");
  if (locationErrors.length > 0 && locationErrors.length === errors.length) {
    throw new AppError(409, "LOCATION_INACTIVE", { rowPaths: locationErrors.map((error) => error.path.replace(/\.location$/, "")) });
  }
  if (errors.length > 0) throw validationError(errors);

  const sources: SourceSnapshot[] = order.map((lineId, index) => {
    const line = lineOf(lineId);
    return {
      id: uuidV7(), position: index + 1, purchaseLineId: lineId, purchaseId: line.purchase.id, purchaseDocNo: line.purchase.docNo, purchaseDocDate: line.purchase.docDate,
      purchaseCurrency: line.purchase.currency, exchangeRate: line.purchase.rate, priceUnit: line.priceUnit, unitPrice: line.unitPrice, netUnitPrice: line.netUnitPrice,
      unitCostBase: line.unitCostBase, linePcs: line.pcs, lineWeightCt: line.weightCt, location: line.location, itemNote: line.itemNote,
      attrs: { stoneCodeId: line.stoneCodeId, stoneCode: line.stoneCode, stone: line.stone, shape: line.shape, size: line.size, color: line.color, clarity: line.clarity, cutting: line.cutting, quality: line.quality, lot: line.lot, cerType: line.cerType, cerNo: line.cerNo },
    };
  });

  const totalWeight = rows.reduce((sum, row) => sum.plus(row.weightCt), new Decimal(0));
  const totalCost = rows.reduce((sum, row) => sum.plus(row.costAmountBase), new Decimal(0));
  return {
    docDate: input.docDate, vendorId: input.vendorId, vendorCode: context.vendor?.code ?? "", vendorName: context.vendor?.name ?? "",
    currency: context.companyCurrency, ref: input.ref ?? "", documentNote: input.documentNote ?? "", mode: input.mode,
    sources, rows,
    totals: { rowCount: rows.length, pcs: rows.reduce((sum, row) => sum + row.pcs, 0), weightCt: totalWeight.toFixed(3), costAmountBase: totalCost.toFixed(2) },
  };
}

/** The master allocation set of a document: Σ per purchase line over its rows (≤ 200 lines). */
export function allocationLines(rows: readonly { sources: readonly { purchaseLineId: string; pcs: number; weightCt: string }[] }[]) {
  const sums = new Map<string, { pcs: number; weight: Dec }>();
  for (const row of rows) for (const source of row.sources) {
    const entry = sums.get(source.purchaseLineId) ?? { pcs: 0, weight: new Decimal(0) };
    entry.pcs += source.pcs;
    entry.weight = entry.weight.plus(source.weightCt);
    sums.set(source.purchaseLineId, entry);
  }
  return [...sums].map(([purchaseLineId, entry]) => ({ purchaseLineId, pcs: entry.pcs, weightCt: entry.weight.toFixed(3) }));
}
