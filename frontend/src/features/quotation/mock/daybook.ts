import type { QuotationStatus } from "../schema";

export type DaybookEntry = {
  id: string;
  docNo: string;
  customerName: string;
  docDate: string;
  status: QuotationStatus;
};

const names = ["Siam Gems Co., Ltd.", "Chanthaburi Jewelry Ltd.", "Geneva Fine Stones SA"];

export const daybookEntries: DaybookEntry[] = Array.from({ length: 10 }, (_, i) => ({
  id: `qt-${i + 1}`,
  docNo: `QTGMS2610${String(i + 1).padStart(3, "0")}`,
  customerName: names[i % names.length],
  docDate: "2026-10-19",
  status: i === 4 || i === 9 ? "APPROVED" : "PENDING_APPROVAL",
}));
