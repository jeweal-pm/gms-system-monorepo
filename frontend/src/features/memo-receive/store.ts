/**
 * Memo Receive documents — MOCK (ADR-0033 D1: no Memo Receive API yet). Kept in memory and in this
 * browser's localStorage so a refresh keeps them; photos stay in memory only (object URLs). Only
 * `api.ts` uses this file, so the API revision replaces it without touching the page.
 */
import { z } from "zod";
import { isFilledLine, lineSchema, type PhotoRef } from "@/features/quotation/schema";
import { nextDocNumber, type NumberingRow } from "./numbering";
import { memoReceiveSchema, isEditableMemo, MEMO_RECEIVE_STATUSES, type MemoReceiveFormValues, type MemoReceiveStatus } from "./schema";

export const STORAGE_KEY = "gms.memo-receive.v1";
export const MAX_DOCUMENTS = 200;
const DELAY_MS = 250;

const storedSchema = z.object({
  id: z.string().min(1).max(64),
  docNo: z.string().min(1).max(60),
  status: z.enum(MEMO_RECEIVE_STATUSES),
  numberingId: z.string().max(64).nullable(),
  runningNo: z.number().int().min(1),
  vendorName: z.string().max(300),
  createdAt: z.string().max(40),
  updatedAt: z.string().max(40),
  values: z.unknown(),
});
type Stored = Omit<z.infer<typeof storedSchema>, "values"> & { values: MemoReceiveFormValues };
type State = { nextStockId: number; docs: Stored[] };

export type MemoReceiveSummary = { id: string; docNo: string; docDate: string; vendorName: string; status: MemoReceiveStatus };
export type SavedMemoReceive = MemoReceiveFormValues & { id: string; docNo: string; status: MemoReceiveStatus };

export class MemoReceiveError extends Error {}

let state: State | null = null;
/** Photos of saved lines by line key: not stored, since object URLs end with the page session. */
const photos = new Map<string, PhotoRef[]>();

const delay = () => new Promise((resolve) => setTimeout(resolve, DELAY_MS));
const clone = <T,>(value: T): T => structuredClone(value);

/** Accepts only well-formed stored data; anything invalid is dropped (ADR-0033 consequences). */
export function parseState(raw: string | null): State {
  const empty: State = { nextStockId: 1, docs: [] };
  if (!raw) return empty;
  try {
    const value = JSON.parse(raw) as { nextStockId?: unknown; docs?: unknown };
    const docs = (Array.isArray(value.docs) ? value.docs : []).slice(0, MAX_DOCUMENTS).flatMap((entry): Stored[] => {
      const doc = storedSchema.safeParse(entry);
      if (!doc.success) return [];
      const values = memoReceiveSchema.safeParse(doc.data.values);
      return values.success ? [{ ...doc.data, values: values.data }] : [];
    });
    const highestStockId = docs.flatMap((doc) => doc.values.lines.map((line) => Number(line.stockId) || 0)).reduce((max, id) => Math.max(max, id), 0);
    const stored = typeof value.nextStockId === "number" && Number.isSafeInteger(value.nextStockId) ? value.nextStockId : 1;
    return { nextStockId: Math.max(stored, highestStockId + 1), docs };
  } catch {
    return empty;
  }
}

function load(): State {
  if (state) return state;
  try {
    state = parseState(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    state = { nextStockId: 1, docs: [] };
  }
  return state;
}

function persist(next: State) {
  state = next;
  const withoutPhotos = { ...next, docs: next.docs.map((doc) => ({ ...doc, values: { ...doc.values, lines: doc.values.lines.map((line) => ({ ...line, photos: [] })) } })) };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(withoutPhotos));
  } catch {
    // Storage blocked or full: the documents still live in memory for this session.
  }
}

/** Empty rows are dropped; filled rows without a Stock ID get the next running number (Q-MR-01). */
function withStockIds(values: MemoReceiveFormValues, nextStockId: number) {
  let next = nextStockId;
  const lines = values.lines.filter(isFilledLine).map((line) => {
    const parsed = lineSchema.parse(line);
    photos.set(parsed.key, parsed.photos);
    return parsed.stockId ? parsed : { ...parsed, stockId: String(next++) };
  });
  return { values: { ...values, lines }, nextStockId: next };
}

function toSaved(doc: Stored): SavedMemoReceive {
  const values = clone(doc.values);
  values.lines = values.lines.map((line) => ({ ...line, photos: photos.get(line.key) ?? [] }));
  return { ...values, id: doc.id, docNo: doc.docNo, status: doc.status };
}

export function previewDocNo(rows: readonly NumberingRow[], docDate: string): string {
  return nextDocNumber(rows, docDate, load().docs).docNo;
}

export async function listMemoReceives(): Promise<MemoReceiveSummary[]> {
  await delay();
  return [...load().docs]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((doc) => ({ id: doc.id, docNo: doc.docNo, docDate: doc.values.docDate, vendorName: doc.vendorName, status: doc.status }));
}

export async function getMemoReceive(id: string): Promise<SavedMemoReceive | null> {
  await delay();
  const doc = load().docs.find((entry) => entry.id === id);
  return doc ? toSaved(doc) : null;
}

export async function createMemoReceive(input: MemoReceiveFormValues, rows: readonly NumberingRow[], vendorName: string): Promise<SavedMemoReceive> {
  await delay();
  const current = load();
  if (current.docs.length >= MAX_DOCUMENTS) throw new MemoReceiveError(`This preview keeps up to ${MAX_DOCUMENTS} memo receives. Delete one first.`);
  const number = nextDocNumber(rows, input.docDate, current.docs);
  const { values, nextStockId } = withStockIds(memoReceiveSchema.parse(input), current.nextStockId);
  const now = new Date().toISOString();
  const doc: Stored = {
    id: crypto.randomUUID(),
    docNo: number.docNo,
    numberingId: number.numberingId,
    runningNo: number.runningNo,
    status: "PENDING_APPROVAL",
    vendorName: vendorName.slice(0, 300),
    createdAt: now,
    updatedAt: now,
    values: { ...values, id: undefined, docNo: undefined, status: undefined },
  };
  persist({ nextStockId, docs: [...current.docs, doc] });
  return toSaved(doc);
}

export async function updateMemoReceive(id: string, input: MemoReceiveFormValues, vendorName: string): Promise<SavedMemoReceive> {
  await delay();
  const current = load();
  const doc = current.docs.find((entry) => entry.id === id);
  if (!doc) throw new MemoReceiveError("This memo receive no longer exists.");
  if (!isEditableMemo(doc.status)) throw new MemoReceiveError("An approved memo receive can't be changed.");
  const { values, nextStockId } = withStockIds(memoReceiveSchema.parse(input), current.nextStockId);
  const updated: Stored = { ...doc, vendorName: vendorName.slice(0, 300), updatedAt: new Date().toISOString(), values: { ...values, id: undefined, docNo: undefined, status: undefined } };
  persist({ nextStockId, docs: current.docs.map((entry) => (entry.id === id ? updated : entry)) });
  return toSaved(updated);
}

export async function deleteMemoReceive(id: string): Promise<void> {
  await delay();
  const current = load();
  const doc = current.docs.find((entry) => entry.id === id);
  if (!doc) throw new MemoReceiveError("This memo receive no longer exists.");
  if (!isEditableMemo(doc.status)) throw new MemoReceiveError("An approved memo receive can't be deleted.");
  // Stock IDs are never given back (ADR-0033 D3): the counter stays where it is.
  persist({ ...current, docs: current.docs.filter((entry) => entry.id !== id) });
}

/** Tests only: forget the in-memory state so the next call reads localStorage again. */
export function resetMemoReceiveStore() {
  state = null;
  photos.clear();
}
