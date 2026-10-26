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

/**
 * Next running number for a quotation numbering row: the highest stored one + 1, or the row's start
 * number (owner 2026-10-26, Q-QT-03: deleting the latest quotation frees its number).
 */
export async function nextQuotationRunningNo(client: Client, row: NumberingRow): Promise<number> {
  const { _max } = await client.quotation.aggregate({ where: { numberingId: row.id }, _max: { runningNo: true } });
  return _max.runningNo === null ? row.startNo : Math.max(_max.runningNo + 1, row.startNo);
}

/**
 * Owner 2026-10-26: with no Document Setup row in effect, quotations get a plain running number
 * (1, 2, 3 …): the highest plain one + 1. With `lock`, a transaction-scoped advisory lock serializes
 * concurrent saves (there is no numbering row to lock).
 */
export async function nextPlainQuotationRunningNo(client: Client, lock: boolean): Promise<number> {
  // pg_advisory_xact_lock returns void, which the driver can't read; select a constant instead.
  if (lock) await client.$queryRaw(Prisma.sql`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext('partner.quotation.plain_running_no'))) AS l`);
  const { _max } = await client.quotation.aggregate({ where: { numberingId: null }, _max: { runningNo: true } });
  return (_max.runningNo ?? 0) + 1;
}

/** Numbering row ids that issued a document number (Document Setup `used`, SA-QT-05). */
export async function usedNumberingIds(client: Client, ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const used = await client.quotation.groupBy({ by: ["numberingId"], where: { numberingId: { in: [...ids] } } });
  return new Set(used.flatMap((entry) => (entry.numberingId ? [entry.numberingId] : [])));
}
