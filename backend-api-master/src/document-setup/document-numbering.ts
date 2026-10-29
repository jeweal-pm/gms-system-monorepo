import { Prisma } from "../generated/prisma/client";
import type { Tx } from "../common/persistence";
import { prisma } from "../database/prisma-client";
import type { DocumentTransactionKey } from "./document-setup.transactions";

/** Longest issued document number (`quotation.doc_no` varchar(40)). */
export const DOC_NO_MAX = 40;

type Client = Tx | typeof prisma;
type NumberingRow = { id: string; prefix: string; separator: string; startNo: number };

/** Document number = prefix + separator + running number, no padding (SA-DS-06). */
export function formatDocNo(row: Pick<NumberingRow, "prefix" | "separator">, runningNo: number): string {
  return `${row.prefix}${row.separator}${runningNo}`;
}

/**
 * The numbering row in effect on `docDate`: the latest `effective_date <= docDate` (SA-QT-04).
 * With `lock`, the row is locked FOR UPDATE so concurrent saves for the same row are serialized.
 */
export async function numberingInEffect(client: Client, transactionKey: DocumentTransactionKey, docDate: Date, lock: boolean): Promise<NumberingRow | null> {
  const rows = await client.$queryRaw<{ id: string; prefix: string; separator: string; start_no: number }[]>(Prisma.sql`
    SELECT id, prefix, separator, start_no
    FROM "partner"."document_numbering"
    WHERE transaction_key = ${transactionKey} AND effective_date <= ${docDate}::date
    ORDER BY effective_date DESC
    LIMIT 1
    ${lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}`);
  const row = rows[0];
  return row ? { id: row.id, prefix: row.prefix, separator: row.separator, startNo: row.start_no } : null;
}

/** Document types that take numbers from Document Setup (quotation ADR-0032; memo out, memo out return ADR-0033; memo receive, memo return memo-return SA rev 1). */
export type NumberedDocument = "quotation" | "memoOut" | "memoOutReturn" | "memoReceive" | "memoReturn";

const PLAIN_LOCK_KEY: Readonly<Record<NumberedDocument, string>> = {
  quotation: "partner.quotation.plain_running_no",
  memoOut: "partner.memo_out.plain_running_no",
  memoOutReturn: "partner.memo_out_return.plain_running_no",
  memoReceive: "partner.memo_receive.plain_running_no",
  memoReturn: "partner.memo_return.plain_running_no",
};

type RunningNoDelegate = {
  aggregate(args: { where: { numberingId: string | null }; _max: { runningNo: true } }): Promise<{ _max: { runningNo: number | null } }>;
  groupBy(args: { by: ["numberingId"]; where: { numberingId: { in: string[] } } }): Promise<{ numberingId: string | null }[]>;
};

/** The table of a document type (each has `numbering_id` + `running_no`). */
function documentTable(client: Client, document: NumberedDocument): RunningNoDelegate {
  return (client as unknown as Record<NumberedDocument, RunningNoDelegate>)[document];
}

/**
 * Next running number for a numbering row: the highest stored one + 1, or the row's start number
 * (owner 2026-10-26, Q-QT-03: deleting the latest document frees its number).
 */
export async function nextRunningNo(client: Client, document: NumberedDocument, row: NumberingRow): Promise<number> {
  const { _max } = await documentTable(client, document).aggregate({ where: { numberingId: row.id }, _max: { runningNo: true } });
  return _max.runningNo === null ? row.startNo : Math.max(_max.runningNo + 1, row.startNo);
}

/**
 * Owner 2026-10-26: with no Document Setup row in effect, a document gets a plain running number
 * (1, 2, 3 …): the highest plain one + 1. With `lock`, a transaction-scoped advisory lock per document
 * type serializes concurrent saves (there is no numbering row to lock).
 */
export async function nextPlainRunningNo(client: Client, document: NumberedDocument, lock: boolean): Promise<number> {
  // pg_advisory_xact_lock returns void, which the driver can't read; select a constant instead.
  if (lock) await client.$queryRaw(Prisma.sql`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${PLAIN_LOCK_KEY[document]}))) AS l`);
  const { _max } = await documentTable(client, document).aggregate({ where: { numberingId: null }, _max: { runningNo: true } });
  return (_max.runningNo ?? 0) + 1;
}

export const nextQuotationRunningNo = (client: Client, row: NumberingRow) => nextRunningNo(client, "quotation", row);
export const nextPlainQuotationRunningNo = (client: Client, lock: boolean) => nextPlainRunningNo(client, "quotation", lock);

/** Numbering row ids that issued a number on any document type (Document Setup `used`, SA-QT-05, SA-MO-04). */
export async function usedNumberingIds(client: Client, ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const where = { numberingId: { in: [...ids] } };
  const kinds: NumberedDocument[] = ["quotation", "memoOut", "memoOutReturn", "memoReceive", "memoReturn"];
  const used = await Promise.all(kinds.map((kind) => documentTable(client, kind).groupBy({ by: ["numberingId"], where })));
  return new Set(used.flat().flatMap((entry) => (entry.numberingId ? [entry.numberingId] : [])));
}
