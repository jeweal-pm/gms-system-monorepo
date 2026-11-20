import { describe, expect, it } from "vitest";
import { Decimal } from "../../src/platform/db";
import { bearerMatches, readTokenDigest } from "../../src/internal/master-routes";
import { checkDeltas, holdRequestHash, normalizeHolds } from "../../src/modules/stock/holds";
import { loadInputSchema } from "../../src/modules/load-to-stock/schemas";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

/** UT-LS-P2-03 (hold delta checks), hash/normalize, token helpers, D23 lot schema (IT-LS-P2-15 schema part). */
const S1 = "0193a000-0000-7000-8000-0000000000b1";
const stock = (patch: Record<string, unknown> = {}) => ({
  id: S1, stock_id: "810001", status: "ACTIVE", on_hand_pcs: 5, on_hand_weight_ct: "2.500", reserved_pcs: 0, reserved_weight_ct: "0", memo_out_pcs: 0, memo_out_weight_ct: "0",
  load_syncing: false, held_pcs: null, held_weight_ct: null, ...patch,
});
const delta = (pcs: number, weight: string, patch: Record<string, unknown> | null = {}) => ({
  stock: patch === null ? undefined : stock(patch), stockUuid: S1, pcs, weight: new Decimal(weight), next: { pcs: 0, weight: new Decimal(0) },
});
const code = (error: ReturnType<typeof checkDeltas>) => error?.code ?? null;

describe("UT-LS-P2-03 hold delta checks", () => {
  it("RESERVED / MEMO_OUT increase needs ACTIVE stock with on-hand ≥ q (per dimension)", () => {
    expect(checkDeltas("reserve", [delta(5, "2.5")])).toBeNull();
    expect(code(checkDeltas("reserve", [delta(6, "1")]))).toBe("STOCK_HOLD_EXCEEDS_AVAILABLE");
    expect(code(checkDeltas("memo-out", [delta(1, "2.501")]))).toBe("STOCK_HOLD_EXCEEDS_AVAILABLE");
    expect(checkDeltas("memo-out", [delta(6, "1")])?.details).toEqual({ items: [{ stockUuid: S1, stockId: "810001", availablePcs: 5, availableWeightCt: "2.500" }] });
    expect(code(checkDeltas("reserve", [delta(1, "0", { status: "REVERSED" })]))).toBe("STOCK_HOLD_UNAVAILABLE");
    expect(code(checkDeltas("reserve", [delta(1, "0", null)]))).toBe("STOCK_HOLD_UNAVAILABLE");
  });
  it("a stock of a SYNCING load is refused (SA-LS-18) unless its delta is zero", () => {
    expect(code(checkDeltas("reserve", [delta(1, "0", { load_syncing: true })]))).toBe("STOCK_HOLD_BUSY");
    expect(checkDeltas("reserve", [delta(0, "0", { load_syncing: true })])).toBeNull();
  });
  it("decreases: RESERVED / MEMO_OUT need the bucket ≥ q, else IN_USE", () => {
    expect(checkDeltas("memo-out", [delta(-2, "-1", { memo_out_pcs: 2, memo_out_weight_ct: "1" })])).toBeNull();
    expect(code(checkDeltas("memo-out", [delta(-3, "0", { memo_out_pcs: 2 })]))).toBe("STOCK_HOLD_IN_USE");
    expect(code(checkDeltas("reserve", [delta(-1, "0", { reserved_pcs: 0 })]))).toBe("STOCK_HOLD_IN_USE");
  });
  it("MEMO_OUT_RETURN: up needs memo_out ≥ q (drift guard), down needs on-hand ≥ q (re-held stock → IN_USE)", () => {
    expect(checkDeltas("memo-out-return", [delta(2, "1", { memo_out_pcs: 2, memo_out_weight_ct: "1" })])).toBeNull();
    expect(code(checkDeltas("memo-out-return", [delta(3, "0", { memo_out_pcs: 2 })]))).toBe("STOCK_HOLD_EXCEEDS_MEMO_OUT");
    expect(code(checkDeltas("memo-out-return", [delta(-2, "0", { on_hand_pcs: 1 })]))).toBe("STOCK_HOLD_IN_USE");
    expect(checkDeltas("memo-out-return", [delta(-1, "0", { on_hand_pcs: 1 })])).toBeNull();
  });
  it("order: unavailable before busy before exceeds", () => {
    expect(code(checkDeltas("reserve", [delta(9, "0", { load_syncing: true }), { ...delta(1, "0", null), stockUuid: "0193a000-0000-7000-8000-0000000000b2" }]))).toBe("STOCK_HOLD_UNAVAILABLE");
    expect(code(checkDeltas("reserve", [delta(9, "0", { load_syncing: true })]))).toBe("STOCK_HOLD_BUSY");
  });
});

describe("hold request normalisation and hash", () => {
  it("drops zero rows, normalises weight and order; the hash covers the document number", () => {
    const holds = normalizeHolds([{ stockUuid: "B".repeat(8) + S1.slice(8), pcs: 0, weightCt: "0" }, { stockUuid: S1.toUpperCase(), pcs: 1, weightCt: "1.5" }]);
    expect(holds).toEqual([{ stockUuid: S1, pcs: 1, weightCt: "1.500" }]);
    expect(holdRequestHash(null, [{ stockUuid: S1, pcs: 1, weightCt: "1.5" }])).toBe(holdRequestHash(null, holds));
    expect(holdRequestHash("RS-1", holds)).not.toBe(holdRequestHash(null, holds));
    expect(holdRequestHash(null, [])).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("internal token helpers (ADR-0052 D21)", () => {
  it("reads a ≥ 43-char file token as a digest and compares bearer headers in constant time", () => {
    const dir = mkdtempSync(join(tmpdir(), "inv-token-"));
    const token = "a".repeat(43);
    writeFileSync(join(dir, "ok"), `${token}\n`);
    writeFileSync(join(dir, "short"), "abc");
    const digest = readTokenDigest(join(dir, "ok"));
    expect(digest).toEqual(createHash("sha256").update(token).digest());
    expect(readTokenDigest(join(dir, "short"))).toBeNull();
    expect(readTokenDigest(undefined)).toBeNull();
    expect(bearerMatches(`Bearer ${token}`, digest)).toBe(true);
    expect(bearerMatches(`Bearer ${"b".repeat(43)}`, digest)).toBe(false);
    expect(bearerMatches(undefined, digest)).toBe(false);
    expect(bearerMatches(`Bearer ${token}`, null)).toBe(false);
  });
});

describe("D23 lot on load rows (IT-LS-P2-15 schema part)", () => {
  const body = (lot: unknown) => ({
    docDate: "2026-11-18", vendorId: S1, mode: "NONE",
    rows: [{ sources: [{ purchaseLineId: S1, pcs: 1, weightCt: "1" }], location: "Safe A", stockPrice: "1", salePrice: "2", photoIds: [],
      attrs: { stoneCodeId: null, stoneCode: "", stone: "", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "", cerType: "", cerNo: "", ...(lot === undefined ? {} : { lot }) } }],
  });
  it("trimmed, ≤ 40, may be empty or omitted, > 40 refused", () => {
    const parsed = loadInputSchema.safeParse(body("  L-01  "));
    expect(parsed.success && parsed.data.rows[0].attrs.lot).toBe("L-01");
    const omitted = loadInputSchema.safeParse(body(undefined));
    expect(omitted.success && omitted.data.rows[0].attrs.lot).toBe("");
    expect(loadInputSchema.safeParse(body("")).success).toBe(true);
    expect(loadInputSchema.safeParse(body("x".repeat(40))).success).toBe(true);
    expect(loadInputSchema.safeParse(body("x".repeat(41))).success).toBe(false);
  });
});
