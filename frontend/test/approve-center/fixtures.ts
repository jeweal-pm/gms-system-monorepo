import type { PendingListItem, PendingPage } from "@/features/approve-center/model";

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
