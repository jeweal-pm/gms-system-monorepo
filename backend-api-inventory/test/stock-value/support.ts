import { randomUUID } from "node:crypto";
import type { Harness } from "../support/harness";
import { seedLoad, type SeedOptions } from "../stock-card/support";

/**
 * Stock Value fixtures (stock-value testing.md): own stock is seeded with Stock Card's `seedLoad` (a Load to Stock document, its
 * stock and the LOAD_IN ledger row) and then given a price, a cost, a unit and a balance; Sales are inserted straight through the
 * owner connection (the report only reads `sale` / `sale_line`). The holds go through the REAL internal hold API like Stock Card's.
 */
export const VALUE_GRANT = ["stock-value:VIEW"];
export const BOTH_GRANT = ["stock-value:VIEW", "stock-card:VIEW"];

export type ValuedOptions = SeedOptions & {
  salePrice?: string; unitCost?: string; priceUnit?: "PER_CT" | "PER_PCS";
  /** overrides of the balance (default: on hand = loaded) */
  onHandPcs?: number; onHandWeightCt?: string; reservedPcs?: number; reservedWeightCt?: string;
};

export async function seedValued(h: Harness, options: ValuedOptions) {
  const loaded = await seedLoad(h, options);
  await h.ownerDb.stock.update({
    where: { id: loaded.id },
    data: {
      sale_price: options.salePrice ?? "0", unit_cost_base: options.unitCost ?? "0", price_unit: options.priceUnit ?? "PER_CT",
      ...(options.onHandPcs !== undefined ? { on_hand_pcs: options.onHandPcs } : {}),
      ...(options.onHandWeightCt !== undefined ? { on_hand_weight_ct: options.onHandWeightCt } : {}),
      ...(options.reservedPcs !== undefined ? { reserved_pcs: options.reservedPcs } : {}),
      ...(options.reservedWeightCt !== undefined ? { reserved_weight_ct: options.reservedWeightCt } : {}),
    },
  });
  return loaded;
}

let saleSequence = Math.floor(Math.random() * 40_000) + 600_000;

export type SaleLineSeed = {
  stoneCode?: string; stone?: string; shape?: string; size?: string; color?: string; clarity?: string; cutting?: string; quality?: string;
  lot?: string; location?: string; priceUnit?: "PER_CT" | "PER_PCS"; unitPrice: string; pcs?: number; weightCt?: string;
};
export type SaleSeed = {
  docNo?: string; docDate?: string; createdAt?: string; status?: "DRAFT" | "PENDING_APPROVAL" | "REVISION_REQUESTED" | "APPROVED" | "REJECTED";
  deleted?: boolean; provisional?: boolean; currency?: string; exchangeRate?: string | null; lines: SaleLineSeed[];
};

/** Inserts one Sale with its lines; returns its ids. Delete with `cleanupSales`. */
export async function seedSale(h: Harness, options: SaleSeed): Promise<{ id: string; docNo: string; docDate: string }> {
  saleSequence += 1;
  const id = randomUUID();
  const docNo = options.docNo ?? `SL-T${saleSequence}`;
  const docDate = options.docDate ?? "2026-11-01";
  const status = options.status ?? "APPROVED";
  await h.ownerDb.sale.create({
    data: {
      id, numbering_id: null, running_no: saleSequence, doc_no: docNo, status, provisional: options.provisional ?? false, doc_date: new Date(`${docDate}T00:00:00Z`),
      due_date: new Date(`${docDate}T00:00:00Z`), customer_id: randomUUID(), customer_code_snapshot: "C", customer_name_snapshot: "Customer", currency_code: options.currency ?? "THB",
      exchange_rate: options.exchangeRate ?? null, subtotal: "0", discount_amount: "0", price_before_tax: "0", tax_amount: "0", charges_amount: "0", labor_amount: "0", grand_total: "0",
      line_count: options.lines.length, total_pcs: 1, total_weight_ct: "1", created_by: "test", updated_by: "test",
      ...(options.createdAt ? { created_at: new Date(options.createdAt) } : {}),
      ...(options.deleted ? { deleted_at: new Date(), deleted_by: "test" } : {}),
    },
  });
  let position = 0;
  for (const line of options.lines) {
    position += 1;
    const pcs = line.pcs ?? 1;
    const weightCt = line.weightCt ?? "1.000";
    await h.ownerDb.sale_line.create({
      data: {
        id: randomUUID(), sale_id: id, position, source: "STOCK", memo_stock_id: randomUUID(), stock_id: "", stone_code: line.stoneCode ?? "", stone: line.stone ?? "", shape: line.shape ?? "",
        size: line.size ?? "", color: line.color ?? "", clarity: line.clarity ?? "", cutting: line.cutting ?? "", quality: line.quality ?? "", lot: line.lot ?? "", location: line.location ?? "",
        price_unit: line.priceUnit ?? "PER_CT", pcs, weight_ct: weightCt, cap_pcs: pcs, cap_weight_ct: weightCt, unit_price: line.unitPrice, amount: "1",
      },
    });
  }
  return { id, docNo, docDate };
}

export async function cleanupSales(h: Harness, ids: string[]) {
  if (ids.length > 0) await h.ownerDb.sale.deleteMany({ where: { id: { in: ids } } });
}
