import { AppError, validationError, type FieldError } from "../../platform/errors";
import { Decimal } from "../../platform/db";
import type { PriceUnit, SalePrepared, SaleStoneAttrs, SaleConsumptionLine } from "../../platform/master-api";
import type { SaleInput, SaleSource } from "./schemas";
import { calculateTotals, oversizeAmounts, type Discount } from "./totals";

/**
 * Save-time normalisation (ADR-0054 D3, api-contract SaleInput → stored rows): every line names one live reference,
 * item fields / Stock ID / source document / caps are copied from master's `prepare` answer (no lock, nothing held),
 * quantities are checked against the cap (open for RESERVE, pending for STOCK, plus this sale's own applied quantity),
 * totals are computed server-side. Errors: party / currency / rate → VALIDATION_ERROR; a reference that is not open,
 * of another customer or currency, or gone → 422 SALE_REFERENCE_INVALID (`lines.N.reference unavailable`); a quantity
 * above its cap → VALIDATION_ERROR `lines.N.pcs|weightCt exceeds_open|exceeds_pending` with the available quantity.
 */
export type NormalizedLine = {
  id: string; position: number; source: SaleSource;
  reserveLineId: string | null; reserveId: string | null; reserveDocNo: string | null;
  memoStockId: string | null; lotKey: string | null; stockCount: number | null; stockId: string; memoReceiveId: string | null; memoReceiveDocNo: string | null;
  attrs: SaleStoneAttrs; priceUnit: PriceUnit;
  pcs: number; weightCt: string; capPcs: number; capWeightCt: string; reserveNetUnitPrice: string | null;
  unitPrice: string; discount: Discount; discountAmount: string; amount: string; itemNote: string; photoIds: string[];
};
export type NormalizedSale = {
  docDate: string; dueDate: string;
  customerId: string; customerCode: string; customerName: string;
  shippingAddressId: string; shippingText: string; invoiceAddressId: string; invoiceText: string;
  currency: string; exchangeRate: string | null; ref: string; documentNote: string;
  discount: Discount; tax: { enabled: boolean; rate: string; includeInPrice: boolean };
  labor: { work: string; basis: "PCS" | "WEIGHT"; qty: string; rate: string } | null;
  serviceCharges: { type: string; amount: string }[];
  lines: NormalizedLine[];
  totals: { lineCount: number; pcs: number; weightCt: string; subtotal: string; discountAmount: string; priceBeforeTax: string; taxAmount: string; chargesAmount: string; laborAmount: string; grandTotal: string };
};

/** The master prepare request for a Save / Submit (party optional for a detail read). */
export function prepareRequest(input: Pick<SaleInput, "customerId" | "shippingAddressId" | "invoiceAddressId" | "currency" | "lines">, options: { saleId?: string; keepCustomerId?: string; party?: boolean } = {}) {
  return {
    ...(options.party === false ? {} : { party: { customerId: input.customerId, shippingAddressId: input.shippingAddressId, invoiceAddressId: input.invoiceAddressId, ...(options.keepCustomerId ? { keepCustomerId: options.keepCustomerId } : {}) } }),
    currency: input.currency,
    reserveLineIds: [...new Set(input.lines.flatMap((line) => (line.source === "RESERVE" && line.reserveLineId ? [line.reserveLineId] : [])))],
    memoStockIds: [...new Set(input.lines.flatMap((line) => (line.source === "STOCK" && line.memoStockId ? [line.memoStockId] : [])))],
    lotKeys: [...new Set(input.lines.flatMap((line) => (line.source === "STOCK" && !line.memoStockId && line.lotKey ? [line.lotKey] : [])))],
    ...(options.saleId ? { saleId: options.saleId } : {}),
  };
}

export type NormalizeOptions = {
  /** The stored line id to keep for input line `index` (update), else a new id. */
  lineId(index: number): string;
  /** A stored currency stays acceptable while inactive (edit of an existing sale). */
  storedCurrency?: string;
};

const fixed = (value: string, places: number) => new Decimal(value).toFixed(places);

export function normalizeSale(input: SaleInput, prepared: SalePrepared, options: NormalizeOptions): NormalizedSale {
  const header: FieldError[] = prepared.partyErrors.map((error) => ({ path: error.path, code: error.code }));
  if (!prepared.currencyActive && input.currency !== options.storedCurrency) header.push({ path: "currency", code: "invalid_reference" });
  const sameCurrency = prepared.companyCurrency !== null && input.currency === prepared.companyCurrency;
  if (prepared.companyCurrency !== null && !sameCurrency && input.exchangeRate === null) header.push({ path: "exchangeRate", code: "required" });
  if (header.length > 0 || !prepared.party) throw validationError(header.length > 0 ? header : [{ path: "customerId", code: "invalid_reference" }]);

  const reserveById = new Map(prepared.reserveLines.map((line) => [line.reserveLineId, line]));
  const stockById = new Map(prepared.memoStocks.map((item) => [item.memoStockId, item]));
  const lotByKey = new Map((prepared.memoLots ?? []).map((lot) => [lot.lotKey, lot]));
  const unavailable: FieldError[] = [];
  const exceeds: FieldError[] = [];
  const lines: Omit<NormalizedLine, "discountAmount" | "amount">[] = [];
  input.lines.forEach((line, index) => {
    const base = {
      id: options.lineId(index), position: index + 1, source: line.source, pcs: line.pcs, weightCt: fixed(line.weightCt, 3),
      unitPrice: fixed(line.unitPrice, 2), discount: { type: line.discount.type, value: line.discount.value }, itemNote: line.itemNote ?? "", photoIds: line.photoIds,
    };
    if (line.source === "RESERVE") {
      const ref = reserveById.get(line.reserveLineId!);
      if (!ref || ref.status !== "OPEN" || ref.customerId !== input.customerId || ref.currency !== input.currency) {
        unavailable.push({ path: `lines.${index}.reference`, code: "unavailable" });
        return;
      }
      const { stoneCode, stone, shape, size, color, clarity, cutting, quality, lot, location, cerType, cerNo } = ref;
      lines.push({
        ...base, reserveLineId: ref.reserveLineId, reserveId: ref.reserveId, reserveDocNo: ref.reserveNo, memoStockId: ref.memoStockId, lotKey: null, stockCount: null, stockId: ref.stockId,
        memoReceiveId: null, memoReceiveDocNo: null, attrs: { stoneCode, stone, shape, size, color, clarity, cutting, quality, lot, location, cerType, cerNo },
        priceUnit: ref.priceUnit, capPcs: ref.openPcs, capWeightCt: fixed(ref.openWeightCt, 3), reserveNetUnitPrice: fixed(ref.netUnitPrice, 4),
      });
    } else if (!line.memoStockId && line.lotKey) {
      // ADR-0055 D4: a lot line keeps the group snapshot; master allocates it to Stock IDs when applied.
      const lot = lotByKey.get(line.lotKey);
      if (!lot || lot.status !== "OK" || !lot.attrs || !lot.priceUnit) {
        unavailable.push({ path: `lines.${index}.reference`, code: "unavailable" });
        return;
      }
      lines.push({
        ...base, reserveLineId: null, reserveId: null, reserveDocNo: null, memoStockId: null, lotKey: lot.lotKey, stockCount: lot.stockCount ?? 1, stockId: "",
        memoReceiveId: null, memoReceiveDocNo: null, attrs: lot.attrs, priceUnit: lot.priceUnit,
        capPcs: lot.pendingPcs ?? 0, capWeightCt: fixed(lot.pendingWeightCt ?? "0", 3), reserveNetUnitPrice: null,
      });
    } else {
      const item = stockById.get(line.memoStockId!);
      if (!item || item.status !== "OK") {
        unavailable.push({ path: `lines.${index}.reference`, code: "unavailable" });
        return;
      }
      lines.push({
        ...base, reserveLineId: null, reserveId: null, reserveDocNo: null, memoStockId: item.memoStockId, lotKey: null, stockCount: null, stockId: item.stockId,
        memoReceiveId: item.memoReceive.id, memoReceiveDocNo: item.memoReceive.docNo, attrs: item.attrs, priceUnit: item.priceUnit,
        capPcs: item.pendingPcs, capWeightCt: fixed(item.pendingWeightCt, 3), reserveNetUnitPrice: null,
      });
    }
  });
  if (unavailable.length > 0) throw new AppError(422, "SALE_REFERENCE_INVALID", { fieldErrors: unavailable.slice(0, 50) });

  lines.forEach((line, index) => {
    const code = line.source === "RESERVE" ? "exceeds_open" : "exceeds_pending";
    const params = { availablePcs: line.capPcs, availableWeightCt: line.capWeightCt };
    if (line.pcs > line.capPcs) exceeds.push({ path: `lines.${index}.pcs`, code, params });
    if (new Decimal(line.weightCt).greaterThan(line.capWeightCt)) exceeds.push({ path: `lines.${index}.weightCt`, code, params });
  });
  const money = {
    lines: lines.map((line) => ({ priceUnit: line.priceUnit, pcs: line.pcs, weightCt: line.weightCt, unitPrice: line.unitPrice, discount: line.discount })),
    discount: input.discount, tax: input.tax, serviceCharges: input.serviceCharges, labor: input.labor,
  };
  const totals = calculateTotals(money);
  const oversize = oversizeAmounts(totals).map((path) => ({ path, code: "too_big" }));
  if (exceeds.length + oversize.length > 0) throw validationError([...exceeds, ...oversize]);

  let pcs = 0;
  let weight = new Decimal(0);
  for (const line of lines) {
    pcs += line.pcs;
    weight = weight.plus(line.weightCt);
  }
  return {
    docDate: input.docDate, dueDate: input.dueDate,
    customerId: input.customerId, customerCode: prepared.party!.code, customerName: prepared.party!.name,
    shippingAddressId: input.shippingAddressId, shippingText: prepared.party!.shippingText, invoiceAddressId: input.invoiceAddressId, invoiceText: prepared.party!.invoiceText,
    currency: input.currency, exchangeRate: sameCurrency || input.exchangeRate === null ? null : fixed(input.exchangeRate, 6),
    ref: input.ref ?? "", documentNote: input.documentNote ?? "",
    discount: input.discount, tax: input.tax, labor: input.labor, serviceCharges: input.serviceCharges,
    lines: lines.map((line, index) => ({ ...line, discountAmount: totals.lineDiscounts[index].toFixed(2), amount: totals.lineAmounts[index].toFixed(2) })),
    totals: {
      lineCount: lines.length, pcs, weightCt: weight.toFixed(3),
      subtotal: totals.subtotal.toFixed(2), discountAmount: totals.discountAmount.toFixed(2), priceBeforeTax: totals.priceBeforeTax.toFixed(2),
      taxAmount: totals.taxAmount.toFixed(2), chargesAmount: totals.chargesAmount.toFixed(2), laborAmount: totals.laborAmount.toFixed(2), grandTotal: totals.grandTotal.toFixed(2),
    },
  };
}

/** The consumption set of stored / normalized lines (ADR-0054 D6 set semantics). */
export function consumptionLines(lines: readonly { id: string; source: SaleSource; reserveLineId: string | null; memoStockId: string | null; lotKey?: string | null; pcs: number; weightCt: string }[]): SaleConsumptionLine[] {
  // v1 shape for legacy lines (memoStockId); v2 (ADR-0055 D7): `lotKey` for a lot line, no item for a lot Reserve line.
  return lines.map((line) => ({
    lineId: line.id, source: line.source, ...(line.source === "RESERVE" ? { reserveLineId: line.reserveLineId! } : {}),
    ...(line.memoStockId ? { memoStockId: line.memoStockId } : line.lotKey ? { lotKey: line.lotKey } : {}),
    pcs: line.pcs, weightCt: new Decimal(line.weightCt).toFixed(3),
  }));
}
