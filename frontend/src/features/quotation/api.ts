/**
 * Data access layer ของ Quotation — ตอนนี้คืน mock data
 * เมื่อ backend พร้อม ให้เปลี่ยน implementation ในไฟล์นี้เป็น tRPC call (component ไม่ต้องแก้)
 */
import { daybookEntries, type DaybookEntry } from "./mock/daybook";
import { stockItems, type StockItem } from "./mock/stock";
import type { QuotationFormValues } from "./schema";

const delay = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

export const quotationKeys = {
  all: ["quotation"] as const,
  detail: (id: string) => ["quotation", "detail", id] as const,
  daybook: () => ["quotation", "daybook"] as const,
  stock: (filter: StockFilter) => ["quotation", "stock", filter] as const,
};

export type StockFilter = { search: string; from: string; to: string };

let running = 1;
const store = new Map<string, QuotationFormValues>();

export async function getQuotation(id: string): Promise<QuotationFormValues | null> {
  await delay();
  return store.get(id) ?? null;
}

export async function saveQuotation(values: QuotationFormValues): Promise<QuotationFormValues> {
  await delay(400);
  const id = values.id ?? crypto.randomUUID();
  const docNo = values.docNo ?? nextDocNo(values.docDate);
  const saved = { ...values, id, docNo };
  store.set(id, saved);
  return saved;
}

export async function deleteQuotation(id: string): Promise<void> {
  await delay();
  store.delete(id);
}

/** Preview เลขเอกสาร — เลขจริงออกตอน save (backend) */
export function previewDocNo(docDate: string): string {
  return formatDocNo(docDate, running);
}

function nextDocNo(docDate: string): string {
  return formatDocNo(docDate, running++);
}

function formatDocNo(docDate: string, seq: number): string {
  const [y = "", m = ""] = docDate.split("-");
  return `QTGMS${y.slice(2)}${m}${String(seq).padStart(3, "0")}`;
}

export async function listDaybook(): Promise<DaybookEntry[]> {
  await delay();
  return daybookEntries;
}

export async function searchAvailableStock(filter: StockFilter): Promise<StockItem[]> {
  await delay();
  const q = filter.search.trim().toLowerCase();
  return stockItems.filter((item) => {
    if (q && ![item.stoneCode, item.stockId, item.lot, item.stone].some((v) => v.toLowerCase().includes(q))) return false;
    if (filter.from && item.loadedAt < filter.from) return false;
    if (filter.to && item.loadedAt > filter.to) return false;
    return true;
  });
}
