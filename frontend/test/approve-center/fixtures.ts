import type { PendingListItem, PendingPage } from "@/features/approve-center/model";
import type { PreviewDetail } from "@/features/approve-center/preview";

/** Source 02 (Approve › Reserve, two pending rows), as the existing `reserve.list` returns them. Tests only. */
export const RS1 = "11111111-1111-4111-8111-111111111111";
export const RS2 = "22222222-2222-4222-8222-222222222222";

export const listItem = (patch: Partial<PendingListItem> = {}): PendingListItem => ({
  id: RS1,
  docNo: "RS2611002",
  status: "PENDING_APPROVAL",
  docDate: "2026-11-01",
  dueDate: "2026-11-05",
  customerName: "Siam Gems Co., Ltd.",
  currency: "USD",
  grandTotal: "172020.00",
  updatedAt: "2026-11-01T04:20:00.000Z",
  deletedAt: null,
  ...patch,
});

export const sourceTwoItems = (): PendingListItem[] => [
  listItem({ id: RS2, docNo: "RS2611003", docDate: "2026-11-02", dueDate: "2026-11-09", customerName: "Bangkok Jewel House", grandTotal: "8450.50", updatedAt: "2026-11-02T03:05:00.000Z" }),
  listItem(),
];

export const page = (items: PendingListItem[], patch: Partial<PendingPage> = {}): PendingPage => ({ items, nextCursor: null, total: items.length, ...patch });

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
  ...patch,
});
