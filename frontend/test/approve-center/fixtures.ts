import type { ApprovalSummary, PendingApprovalItem, PendingPage } from "@/features/approve-center/model";
import type { PreviewDetail } from "@/features/approve-center/preview";

/** Source 02 (Approve › Reserve, two pending rows), as `approval.pending` returns them (FE-AP-009). Tests only. */
export const RS1 = "11111111-1111-4111-8111-111111111111";
export const RS2 = "22222222-2222-4222-8222-222222222222";

export const listItem = (patch: Partial<PendingApprovalItem> = {}): PendingApprovalItem => ({
  type: "reserve",
  id: RS1,
  docNo: "RS2611002",
  docDate: "2026-11-01",
  dueDate: "2026-11-05",
  version: 4,
  status: "PENDING_APPROVAL",
  party: { id: "c1", code: "C001", name: "Siam Gems Co., Ltd." },
  ref: "",
  currency: "USD",
  grandTotal: "172020.00",
  lineCount: 2,
  totalPcs: 130,
  totalWeightCt: "19.600",
  stoneNames: ["Sapphire"],
  moreStoneCount: 0,
  submittedAt: "2026-11-01T04:20:00.000Z",
  submittedBy: "u1",
  submittedByName: "Mint",
  revisionCount: 0,
  lastReview: null,
  updatedAt: "2026-11-01T04:20:00.000Z",
  ...patch,
});

/** Server order (submittedAt ascending, the default sort). */
export const sourceTwoItems = (): PendingApprovalItem[] => [
  listItem(),
  listItem({
    id: RS2,
    docNo: "RS2611003",
    docDate: "2026-11-02",
    dueDate: "2026-11-09",
    party: { id: "c2", code: "C002", name: "Bangkok Jewel House" },
    grandTotal: "8450.50",
    submittedAt: "2026-11-02T03:05:00.000Z",
    submittedByName: null,
    revisionCount: 1,
    lastReview: { action: "REVISE", note: "Fix the price", at: "2026-11-01T09:00:00.000Z", byName: "Boss" },
  }),
];

export const page = (items: PendingApprovalItem[], patch: Partial<PendingPage> = {}): PendingPage => ({ items, nextCursor: null, ...patch });

/** `approval.summary`: counts for ON types; `off` lists the types whose approval is off. */
export const summary = (counts: Partial<Record<string, number>> = { reserve: 2, purchase: 1 }, off: string[] = ["quotation"]): ApprovalSummary => {
  const types = ["quotation", "reserve", "memo-receive", "memo-return", "memo-out", "memo-out-return", "purchase-order", "purchase"];
  return {
    items: types.filter((type) => !off.includes(type)).map((type) => ({ type, count: counts[type] ?? 0 })),
    countCap: 100,
    types: types.map((type) => ({ type, requireApproval: !off.includes(type) })),
  };
};

export const SUPER = { isSuperAdmin: true, permissions: [] as string[] };
export const mine = (permissions: string[]) => ({ isSuperAdmin: false, permissions });

/** Rev 2: `reserve.get` of RS2611002 (source 03/04 shape), USD at rate 36.2. Tests only. */
export const reserveDetail = (patch: Partial<PreviewDetail> = {}): PreviewDetail => ({
  id: RS1,
  docNo: "RS2611002",
  status: "PENDING_APPROVAL",
  version: 4,
  docDate: "2026-11-01",
  currency: "USD",
  exchangeRate: "36.2",
  documentNote: "Prices are valid for 30 days.\nStones are reserved until the due date.",
  customer: { name: "Siam Gems Co., Ltd." },
  lines: [
    { stoneCode: "SA-RBLDEXVS1AAA", stone: "Sapphire", shape: "Oval", size: "5.0×7.0", pcs: 10, weightCt: "12.400", amount: "17980.00", location: "BKK-01" },
    { stoneCode: "SA-LBUDVGVS2AA", stone: "Sapphire", shape: "Round", size: "2.5", pcs: 120, weightCt: "7.200", amount: "8618.78", location: "BKK-01" },
  ],
  totals: { grandTotal: "26598.78" },
  deletedAt: null,
  revisionCount: 0,
  ...patch,
});
