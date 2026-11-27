/**
 * Stock Card kind registry (stock-card SA rev 1, ADR-0056 D4/D11). The ONLY place that classifies a `stock_movement.kind`
 * for the Stock Card: whether it is a card movement (and which document type / caption it belongs to) or not a movement at
 * all (Reserve moves on-hand <-> reserved; the stone stays in the vault). A module that writes a new ledger kind adds its
 * row here; UT-SC-02 fails the build until it does.
 *
 * Document types carry the caption and the Stock ID visibility rule (ADR-0055 D9 as amended 2026-11-21: hidden only on
 * Quotation, Reserve, Memo Out, Purchase and Memo Return; shown on Load to Stock, Memo Out Return and later Sale).
 */
export type KindEffect = "MOVEMENT" | "NOT_A_MOVEMENT";
export type CardKind = { documentType: string; effect: KindEffect };

export const CARD_KINDS: Readonly<Record<string, CardKind>> = {
  LOAD_IN: { documentType: "load-to-stock", effect: "MOVEMENT" },
  LOAD_ADJUST: { documentType: "load-to-stock", effect: "MOVEMENT" },
  LOAD_REVERSAL: { documentType: "load-to-stock", effect: "MOVEMENT" },
  MEMO_OUT: { documentType: "memo-out", effect: "MOVEMENT" },
  MEMO_OUT_REVERSAL: { documentType: "memo-out", effect: "MOVEMENT" },
  MEMO_OUT_RETURN: { documentType: "memo-out-return", effect: "MOVEMENT" },
  MEMO_OUT_RETURN_REVERSAL: { documentType: "memo-out-return", effect: "MOVEMENT" },
  SALE_OUT: { documentType: "sale", effect: "MOVEMENT" },
  SALE_OUT_REVERSAL: { documentType: "sale", effect: "MOVEMENT" },
  // Stock Transfer Location (ADR-0060 D4/D5): OUT on the old card (source Stock ID), IN on the new card (new Stock ID).
  TRANSFER_OUT: { documentType: "stock-transfer-location", effect: "MOVEMENT" },
  TRANSFER_IN: { documentType: "stock-transfer-location", effect: "MOVEMENT" },
  TRANSFER_OUT_REVERSAL: { documentType: "stock-transfer-location", effect: "MOVEMENT" },
  TRANSFER_IN_REVERSAL: { documentType: "stock-transfer-location", effect: "MOVEMENT" },
  ADJUST: { documentType: "stock-adjustment", effect: "MOVEMENT" },
  ADJUST_REVERSAL: { documentType: "stock-adjustment", effect: "MOVEMENT" },
  HOLD_RESERVE: { documentType: "reserve", effect: "NOT_A_MOVEMENT" },
  RELEASE_RESERVE: { documentType: "reserve", effect: "NOT_A_MOVEMENT" },
};

export type DocumentTypeInfo = {
  label: string;
  /** Whether the Stock ID may be shown / searched on a row of this type. */
  stockIdVisible: boolean;
  /**
   * Where date, number and account come from: the stock row (Load to Stock), `stock_hold_document` (master documents, Sale),
   * `stock_transfer` (ADR-0060 D5: Account = "→ <to location>" on OUT, "← <from location>" on IN) or `stock_adjustment` (ADR-0059).
   */
  source: "STOCK" | "HOLD" | "TRANSFER" | "ADJUSTMENT";
};

export const DOCUMENT_TYPES: Readonly<Record<string, DocumentTypeInfo>> = {
  "load-to-stock": { label: "Load to Stock", stockIdVisible: true, source: "STOCK" },
  "memo-out": { label: "Memo Out", stockIdVisible: false, source: "HOLD" },
  "memo-out-return": { label: "Memo Out Return", stockIdVisible: true, source: "HOLD" },
  reserve: { label: "Reserve", stockIdVisible: false, source: "HOLD" },
  // Own-stock Sale (ADR-0058 D9) writes SALE_OUT / SALE_OUT_REVERSAL; the others are registry-ready (rows appear when their module writes kinds).
  sale: { label: "Sale", stockIdVisible: true, source: "HOLD" },
  "stock-adjustment": { label: "Stock Adjustment", stockIdVisible: true, source: "ADJUSTMENT" },
  quotation: { label: "Quotation", stockIdVisible: false, source: "HOLD" },
  purchase: { label: "Purchase", stockIdVisible: false, source: "HOLD" },
  "memo-return": { label: "Memo Return", stockIdVisible: false, source: "HOLD" },
  "stock-transfer-location": { label: "Stock Transfer Location", stockIdVisible: true, source: "TRANSFER" },
};

/** Ledger kinds that are card movements (the fixed array passed to SQL as a parameter, never user text). */
export const MOVEMENT_KINDS: readonly string[] = Object.entries(CARD_KINDS).filter(([, kind]) => kind.effect === "MOVEMENT").map(([name]) => name).sort();
export const HIDDEN_STOCK_ID_TYPES: readonly string[] = Object.entries(DOCUMENT_TYPES).filter(([, info]) => !info.stockIdVisible).map(([name]) => name).sort();
export const STOCK_SOURCED_TYPES: readonly string[] = Object.entries(DOCUMENT_TYPES).filter(([, info]) => info.source === "STOCK").map(([name]) => name).sort();
export const TRANSFER_SOURCED_TYPES: readonly string[] = Object.entries(DOCUMENT_TYPES).filter(([, info]) => info.source === "TRANSFER").map(([name]) => name).sort();
export const ADJUSTMENT_SOURCED_TYPES: readonly string[] = Object.entries(DOCUMENT_TYPES).filter(([, info]) => info.source === "ADJUSTMENT").map(([name]) => name).sort();

export function documentTypeLabel(documentType: string): string {
  return DOCUMENT_TYPES[documentType]?.label ?? documentType;
}

export function stockIdVisible(documentType: string): boolean {
  return DOCUMENT_TYPES[documentType]?.stockIdVisible ?? false;
}

/** `undefined` for a kind the registry does not know (excluded from the card and reported by the coverage test). */
export function classifyKind(kind: string): CardKind | undefined {
  return CARD_KINDS[kind];
}
