/* eslint-disable @typescript-eslint/no-explicit-any -- JSON bodies */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Decimal } from "../../src/platform/db";
import { createApp } from "../../src/app";
import { createLogger } from "../../src/platform/logger";
import type { Harness } from "../support/harness";

/**
 * Stock Card fixtures (stock-card testing.md): own stock is seeded straight through the owner connection (a Load to Stock
 * document, its stocks and their LOAD_IN ledger rows, exactly what the apply saga writes) and the holds go through the REAL
 * internal hold API (`PUT /internal/v1/master/stock-holds/...`), so the ledger rows of Memo Out / Memo Out Return / Reserve are
 * the ones production writes.
 */
export const GRANT = ["stock-card:VIEW"];
let sequence = Math.floor(Math.random() * 40_000) + 100_000;
const nextNumber = () => (sequence += 1);

export type SeededStock = { id: string; stockId: string };
export type SeedOptions = {
  docNo?: string; docDate?: string; vendorId?: string; vendorName?: string; location?: string; lot?: string;
  stoneCode?: string; stone?: string; shape?: string; color?: string; pcs: number; weightCt: string;
};

export async function seedLoad(h: Harness, options: SeedOptions): Promise<{ loadId: string; docNo: string } & SeededStock> {
  const loadId = randomUUID();
  const number = nextNumber();
  const docNo = options.docNo ?? `LS-T${number}`;
  const vendorId = options.vendorId ?? randomUUID();
  const docDate = new Date(`${options.docDate ?? "2026-09-04"}T00:00:00Z`);
  const db = h.ownerDb;
  await db.load_to_stock.create({
    data: {
      id: loadId, numbering_id: null, running_no: number, doc_no: docNo, status: "APPROVED", applied_revision: 1, doc_date: docDate, vendor_id: vendorId,
      vendor_code_snapshot: "V", vendor_name_snapshot: options.vendorName ?? "Vendor One", currency_code: "THB", mode: "NONE", row_count: 1, total_pcs: options.pcs,
      total_weight_ct: options.weightCt, total_cost_base: "0", created_by: "test", updated_by: "test",
    },
  });
  const id = randomUUID();
  const stockId = `T${String(number).padStart(8, "0")}`;
  await db.stock.create({
    data: {
      id, stock_id: stockId, load_id: loadId, status: "ACTIVE", location: options.location ?? "Safe A", stone_code: options.stoneCode ?? "SC-1",
      stone: options.stone ?? "Sapphire", shape: options.shape ?? "Oval", color: options.color ?? "Blue", lot: options.lot ?? "L1", price_unit: "PER_CT",
      pcs: options.pcs, weight_ct: options.weightCt, on_hand_pcs: options.pcs, on_hand_weight_ct: options.weightCt, unit_cost_base: "0", cost_amount_base: "0",
      stock_price: "0", sale_price: "0", currency_code: "THB", vendor_id: vendorId, vendor_name_snapshot: options.vendorName ?? "Vendor One",
      ref_doc_date: docDate, ref_doc_no: docNo,
    },
  });
  await db.stock_movement.create({
    data: { id: randomUUID(), stock_uuid: id, kind: "LOAD_IN", document_type: "load-to-stock", document_id: loadId, revision: 1, pcs_delta: options.pcs, weight_delta: options.weightCt, cost_delta_base: "0", created_by: "test" },
  });
  return { loadId, docNo, id, stockId };
}

/** Deletes the fixtures of the given loads (the owner connection may delete the append-only ledger; the app role cannot). */
export async function cleanupLoads(h: Harness, loadIds: string[]) {
  if (loadIds.length === 0) return;
  const db = h.ownerDb;
  const stocks = (await db.stock.findMany({ where: { load_id: { in: loadIds } }, select: { id: true } })).map((row) => row.id);
  const holdDocs = (await db.stock_hold.findMany({ where: { stock_uuid: { in: stocks } }, select: { document_type: true, document_id: true } }));
  const movementDocs = await db.stock_movement.findMany({ where: { stock_uuid: { in: stocks } }, select: { document_type: true, document_id: true } });
  await db.stock_movement.deleteMany({ where: { stock_uuid: { in: stocks } } });
  await db.stock_hold.deleteMany({ where: { stock_uuid: { in: stocks } } });
  const docs = [...holdDocs, ...movementDocs].filter((doc) => doc.document_type !== "load-to-stock");
  for (const doc of docs) await db.stock_hold_document.deleteMany({ where: { document_type: doc.document_type, document_id: doc.document_id } });
  await db.stock.deleteMany({ where: { id: { in: stocks } } });
  await db.load_to_stock.deleteMany({ where: { id: { in: loadIds } } });
}

export type HoldType = "reserve" | "memo-out" | "memo-out-return";
export type Internal = ReturnType<typeof internalApi>;

/** The inventory internal routes of a second app instance (own token), called in-process. */
export function internalApi(h: Harness) {
  const token = randomBytes(32).toString("base64url");
  const digest = createHash("sha256").update(token).digest();
  const other = createHash("sha256").update(h.token).digest();
  const { app } = createApp({ db: h.db, master: h.masterApi, logger: createLogger("silent"), auth: {} as never, trustedOrigins: new Set(), approvers: async () => [], storageRoot: `${h.dir}/inv-int`, internal: { tokenDigest: digest, otherTokenDigest: other } });
  const call = async (method: string, path: string, body?: unknown, bearer: string | null = token) => {
    const response = await app.request(`/internal/v1/master${path}`, {
      method, headers: { ...(bearer ? { authorization: `Bearer ${bearer}` } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    return { status: response.status, body: (text ? JSON.parse(text) : {}) as Record<string, any> };
  };
  const revisions = new Map<string, number>();
  /** Sets the whole hold set of a document at its next revision (what the master saga does). */
  const hold = async (type: HoldType, documentId: string, holds: { stockUuid: string; pcs: number; weightCt: string }[], extra: Record<string, unknown> = {}, documentNo: string | null = `DOC-${documentId.slice(0, 4)}`) => {
    const key = `${type}:${documentId}`;
    const revision = (revisions.get(key) ?? 0) + 1;
    const result = await call("PUT", `/stock-holds/${type}/${documentId}`, { revision, documentNo, holds, ...extra });
    if (result.status === 200) revisions.set(key, revision);
    return result;
  };
  return { call, hold, token };
}

export const w = (value: string | number) => new Decimal(value).toFixed(3);
