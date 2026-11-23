import type { Client } from "../../platform/db";
import { Prisma } from "../../platform/db";

/**
 * Own stock batch read for api-master (ADR-0052 D16/D17/D23, api-contract "Inventory internal"); one statement. The Stock ID
 * From Stock list (`availablePage`) was removed with FE-LOT-008; the lot pickers are in `lots.ts`.
 * - `stockBatch`: up to 200 stocks by primary key (unknown ids are absent), for the master line copy and checks.
 * Cost never leaves inventory here.
 */

type Row = {
  id: string; stock_id: string; status: string; location: string; price_unit: string; pcs: number; weight_ct: string; on_hand_pcs: number; on_hand_weight_ct: string;
  stock_price: string; sale_price: string; currency_code: string; vendor_id: string; vendor_code: string; vendor_name: string; load_id: string; ref_doc_no: string;
  ref_doc_date: string; item_note: string; stone_code_id: string | null; stone_code: string; stone: string; shape: string; size: string; color: string; clarity: string;
  cutting: string; quality: string; lot: string; cer_type: string; cer_no: string;
};

const SELECT = Prisma.sql`
  SELECT s."id", s."stock_id", s."status", s."location", s."price_unit", s."pcs", s."weight_ct"::text AS "weight_ct", s."on_hand_pcs", s."on_hand_weight_ct"::text AS "on_hand_weight_ct",
    s."stock_price"::text AS "stock_price", s."sale_price"::text AS "sale_price", s."currency_code", s."vendor_id", l."vendor_code_snapshot" AS "vendor_code",
    s."vendor_name_snapshot" AS "vendor_name", s."load_id", s."ref_doc_no", to_char(s."ref_doc_date", 'YYYY-MM-DD') AS "ref_doc_date", s."item_note", s."stone_code_id",
    s."stone_code", s."stone", s."shape", s."size", s."color", s."clarity", s."cutting", s."quality", s."lot", s."cer_type", s."cer_no"
  FROM "inventory"."stock" s JOIN "inventory"."load_to_stock" l ON l."id" = s."load_id"`;

export function pickerRow(row: Row) {
  return {
    stockUuid: row.id, stockId: row.stock_id, location: row.location, priceUnit: row.price_unit as "PER_CT" | "PER_PCS",
    stoneCode: row.stone_code, stone: row.stone, shape: row.shape, size: row.size, color: row.color, clarity: row.clarity, cutting: row.cutting, quality: row.quality,
    lot: row.lot, cerType: row.cer_type, cerNo: row.cer_no,
    pcs: row.pcs, weightCt: new Prisma.Decimal(row.weight_ct).toFixed(3), availablePcs: row.on_hand_pcs, availableWeightCt: new Prisma.Decimal(row.on_hand_weight_ct).toFixed(3),
    stockPrice: new Prisma.Decimal(row.stock_price).toFixed(2), salePrice: new Prisma.Decimal(row.sale_price).toFixed(2), currency: row.currency_code,
    vendor: { id: row.vendor_id, code: row.vendor_code, name: row.vendor_name },
    load: { id: row.load_id, docNo: row.ref_doc_no, docDate: row.ref_doc_date },
    itemNote: row.item_note,
  };
}
export type OwnStockPickerRow = ReturnType<typeof pickerRow>;

export async function stockBatch(client: Client, ids: readonly string[]) {
  if (ids.length === 0) return [];
  const rows = await client.$queryRaw<Row[]>(Prisma.sql`${SELECT} WHERE s."id" = ANY(${[...ids]}::uuid[])`);
  return rows.map((row) => ({ ...pickerRow(row), status: row.status as "ACTIVE" | "REVERSED", stoneCodeId: row.stone_code_id }));
}
