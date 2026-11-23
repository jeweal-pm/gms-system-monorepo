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
  HOLD_RESERVE: { documentType: "reserve", effect: "NOT_A_MOVEMENT" },
  RELEASE_RESERVE: { documentType: "reserve", effect: "NOT_A_MOVEMENT" },
};

export type DocumentTypeInfo = {
  label: string;
  /** Whether the Stock ID may be shown / searched on a row of this type. */
  stockIdVisible: boolean;
  /** Date, number and account come from the stock row (Load to Stock) instead of `stock_hold_document`. */
  source: "STOCK" | "HOLD";
};

export const DOCUMENT_TYPES: Readonly<Record<string, DocumentTypeInfo>> = {
  "load-to-stock": { label: "Load to Stock", stockIdVisible: true, source: "STOCK" },
  "memo-out": { label: "Memo Out", stockIdVisible: false, source: "HOLD" },
  "memo-out-return": { label: "Memo Out Return", stockIdVisible: true, source: "HOLD" },
  reserve: { label: "Reserve", stockIdVisible: false, source: "HOLD" },
  // Registry-ready (rows appear when the owning module writes the kinds): ADR-0054 D11 own-stock Sale; the others stay hidden.
  sale: { label: "Sale", stockIdVisible: true, source: "HOLD" },
  quotation: { label: "Quotation", stockIdVisible: false, source: "HOLD" },
  purchase: { label: "Purchase", stockIdVisible: false, source: "HOLD" },
  "memo-return": { label: "Memo Return", stockIdVisible: false, source: "HOLD" },
};

/** Ledger kinds that are card movements (the fixed array passed to SQL as a parameter, never user text). */
export const MOVEMENT_KINDS: readonly string[] = Object.entries(CARD_KINDS).filter(([, kind]) => kind.effect === "MOVEMENT").map(([name]) => name).sort();
export const HIDDEN_STOCK_ID_TYPES: readonly string[] = Object.entries(DOCUMENT_TYPES).filter(([, info]) => !info.stockIdVisible).map(([name]) => name).sort();
export const STOCK_SOURCED_TYPES: readonly string[] = Object.entries(DOCUMENT_TYPES).filter(([, info]) => info.source === "STOCK").map(([name]) => name).sort();

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
