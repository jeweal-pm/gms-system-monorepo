import { createHash } from "node:crypto";
import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { partnerException, validationException } from "../common/errors";
import { escapeLike, isPrismaUnavailable, prismaCode, READ_TX } from "../common/persistence";
import { prisma } from "../database/prisma-client";
import { Prisma } from "../generated/prisma/client";
import { permittedApprovalTypes, reviewOf, type FlowPrincipal } from "../approval-setting/approval-flow";
import { peekApprovalSetting } from "../approval-setting/approval-setting.service";
import type { ApprovalDocType } from "../approval-setting/approval-types";
import { APPROVAL_REGISTRY, type ApprovalRegistryEntry } from "./approval.registry";
import {
  SUMMARY_COUNT_CAP,
  type ApprovalPendingInput,
  type ApprovalPendingPage,
  type ApprovalRow,
  type ApprovalSummary,
  type PendingDir,
  type PendingSort,
} from "./approval.schemas";

/**
 * Approve Center API (approve-center SA rev 1 / ADR-0046 D14–D18 as amended by approval-setup SA rev 1 / ADR-0050):
 * read-only. `summary` = one UNION ALL statement with one capped count per type the caller `canApprove` whose setting
 * is ON; `pending` = one bounded statement per page over one type's pending set (partial index `<t>_pending_idx`),
 * 5 sorts × direction with a keyset cursor bound to sort / direction / search. Identifiers come only from the registry;
 * every value is a bound parameter; `q` is LIKE-escaped.
 */

const STONE_PREVIEW = 3;
const tableOf = (name: string) => Prisma.raw(`"partner"."${name}"`);

/** `summary` SQL for the registry entries in `types` (fixed identifiers only). Each count stops at 100 index entries. */
export function summarySql(types: readonly ApprovalDocType[]): Prisma.Sql {
  return Prisma.join(types.map((type) => {
    const entry = APPROVAL_REGISTRY[type];
    return Prisma.sql`SELECT ${type}::text AS "type", x.req AS "requireApproval",
      CASE WHEN x.req THEN (SELECT count(*) FROM (SELECT 1 FROM ${tableOf(entry.table)} WHERE "status" = 'PENDING_APPROVAL' AND "deleted_at" IS NULL LIMIT ${SUMMARY_COUNT_CAP}) c)::int END AS "count"
      FROM (SELECT COALESCE((SELECT "require_approval" FROM "partner"."approval_setting" WHERE "type" = ${type}), true) AS req) x`;
  }), " UNION ALL ");
}

// ---------------------------------------------------------------------------------------------------------------
// Keyset cursor: base64url JSON {v: 1, s: sort, d: dir, q: sha256(q) first 16 hex, k: [sortValue…], i: id}.
// The party sort carries no value (a Thai name can exceed the contract's 300-character cursor): its key is read back
// from the cursor row by id, so the cursor stays small and the order stays stable.

export type PendingCursor = { sort: PendingSort; dir: PendingDir; q: string | undefined; keys: string[]; id: string };

const cursorBody = z.object({
  v: z.literal(1),
  s: z.enum(["submittedAt", "docNo", "party", "qty", "value"]),
  d: z.enum(["asc", "desc"]),
  q: z.string().regex(/^[0-9a-f]{16}$/),
  k: z.array(z.string().max(60)).max(2),
  i: z.guid(),
}).strict();

const DECIMAL = /^-?\d{1,18}(\.\d{1,4})?$/;
const KEY_SHAPE: Record<PendingSort, (keys: string[]) => boolean> = {
  submittedAt: (keys) => keys.length === 1 && z.iso.datetime().safeParse(keys[0]).success,
  docNo: (keys) => keys.length === 1 && keys[0].length <= 40,
  party: (keys) => keys.length === 0,
  qty: (keys) => keys.length === 1 && DECIMAL.test(keys[0]),
  value: (keys) => keys.length === 2 && /^[A-Z]{3}$/.test(keys[0]) && DECIMAL.test(keys[1]),
};

export function queryHash(q: string | undefined): string {
  return createHash("sha256").update(q ?? "", "utf8").digest("hex").slice(0, 16);
}

export function encodePendingCursor(cursor: PendingCursor): string {
  return Buffer.from(JSON.stringify({ v: 1, s: cursor.sort, d: cursor.dir, q: queryHash(cursor.q), k: cursor.keys, i: cursor.id }), "utf8").toString("base64url");
}

/** A cursor that does not parse or whose sort, direction or search differs from the input → `VALIDATION_ERROR cursor`. */
export function decodePendingCursor(value: string, input: { sort: PendingSort; dir: PendingDir; q: string | undefined }): { keys: string[]; id: string } {
  const invalid = () => validationException([{ path: "cursor", code: "invalid" }]);
  if (!/^[A-Za-z0-9_-]{1,300}$/.test(value)) throw invalid();
  let body: z.output<typeof cursorBody>;
  try {
    body = cursorBody.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
  } catch {
    throw invalid();
  }
  if (body.s !== input.sort || body.d !== input.dir || body.q !== queryHash(input.q) || !KEY_SHAPE[body.s](body.k)) throw invalid();
  return { keys: body.k, id: body.i };
}

// ---------------------------------------------------------------------------------------------------------------

type PendingQuery = { sort: PendingSort; dir: PendingDir; q: string | undefined; limit: number; after: { keys: string[]; id: string } | null };

/** ORDER BY columns per sort (D16); `id` breaks ties in the same direction. */
function sortColumns(entry: ApprovalRegistryEntry, sort: PendingSort): Prisma.Sql[] {
  const party = Prisma.raw(`d."${entry.party}_name_snapshot"`);
  switch (sort) {
    case "submittedAt": return [Prisma.sql`d."submitted_at"`];
    case "docNo": return [Prisma.sql`d."doc_no"`];
    case "party": return [party];
    case "qty": return [Prisma.sql`d."total_weight_ct"`];
    case "value": return [Prisma.sql`d."currency_code"`, Prisma.sql`d."grand_total"`];
  }
}

/** The live pending set of a type: only these rows can be listed or serve as a party cursor row (G11). */
const LIVE_PENDING = Prisma.sql`"status" = 'PENDING_APPROVAL' AND "deleted_at" IS NULL`;

/**
 * The cursor row's sort values as typed SQL parameters. The party value is read back from the cursor row, and only
 * from a live PENDING_APPROVAL row of this type (INV-20261111-002 item 2): any other row yields NULL, so it can never
 * position a page (`pending` refuses such a cursor before the page query).
 */
function keyValues(entry: ApprovalRegistryEntry, sort: PendingSort, after: { keys: string[]; id: string }): Prisma.Sql[] {
  switch (sort) {
    case "submittedAt": return [Prisma.sql`${after.keys[0]}::timestamp(3)`];
    case "docNo": return [Prisma.sql`${after.keys[0]}::text`];
    case "party": return [Prisma.sql`(SELECT k."${Prisma.raw(`${entry.party}_name_snapshot`)}" FROM ${tableOf(entry.table)} k WHERE k."id" = ${after.id}::uuid AND k."status" = 'PENDING_APPROVAL' AND k."deleted_at" IS NULL)`];
    case "qty": return [Prisma.sql`${after.keys[0]}::numeric`];
    case "value": return [Prisma.sql`${after.keys[0]}::text`, Prisma.sql`${after.keys[1]}::numeric`];
  }
}

/** Search across doc no., party name, ref, any line's stone name and Stock ID (Memo Out Return via its Memo Out line). */
function searchSql(entry: ApprovalRegistryEntry, pattern: string): Prisma.Sql {
  const lines = tableOf(entry.lineTable);
  const parent = Prisma.raw(`l."${entry.parentColumn}"`);
  const stone = Prisma.sql`l."stone" ILIKE ${pattern} ESCAPE '\\'`;
  const lineMatch = entry.stock === "line"
    ? Prisma.sql`EXISTS (SELECT 1 FROM ${lines} l WHERE ${parent} = d."id" AND (${stone} OR l."stock_id" ILIKE ${pattern} ESCAPE '\\'))`
    : entry.stock === "memoOutLine"
      ? Prisma.sql`EXISTS (SELECT 1 FROM ${lines} l JOIN "partner"."memo_out_line" o ON o."id" = l."memo_out_line_id" WHERE ${parent} = d."id" AND (${stone} OR o."stock_id" ILIKE ${pattern} ESCAPE '\\'))`
      : Prisma.sql`EXISTS (SELECT 1 FROM ${lines} l WHERE ${parent} = d."id" AND ${stone})`;
  const party = Prisma.raw(`d."${entry.party}_name_snapshot"`);
  return Prisma.sql`(d."doc_no" ILIKE ${pattern} ESCAPE '\\' OR ${party} ILIKE ${pattern} ESCAPE '\\' OR d."ref" ILIKE ${pattern} ESCAPE '\\' OR ${lineMatch})`;
}

/** One `pending` page statement (limit + 1 rows). Exported for the unit tests (UT-AP-B12). */
export function pendingSql(entry: ApprovalRegistryEntry, query: PendingQuery): Prisma.Sql {
  const p = entry.party;
  const lines = tableOf(entry.lineTable);
  const parent = Prisma.raw(`l."${entry.parentColumn}"`);
  const direction = Prisma.raw(query.dir === "asc" ? "ASC" : "DESC");
  const columns = [...sortColumns(entry, query.sort), Prisma.sql`d."id"`];
  const where: Prisma.Sql[] = [Prisma.sql`d."status" = 'PENDING_APPROVAL'`, Prisma.sql`d."deleted_at" IS NULL`];
  if (query.q) where.push(searchSql(entry, `%${escapeLike(query.q)}%`));
  if (query.after) {
    const op = Prisma.raw(query.dir === "asc" ? ">" : "<");
    where.push(Prisma.sql`(${Prisma.join(columns, ", ")}) ${op} (${Prisma.join([...keyValues(entry, query.sort, query.after), Prisma.sql`${query.after.id}::uuid`], ", ")})`);
  }
  return Prisma.sql`
    SELECT d."id", d."doc_no" AS "docNo", to_char(d."doc_date", 'YYYY-MM-DD') AS "docDate", to_char(d."due_date", 'YYYY-MM-DD') AS "dueDate",
      d."version", d.${Prisma.raw(`"${p}_id"`)}::text AS "partyId", d.${Prisma.raw(`"${p}_code_snapshot"`)} AS "partyCode", d.${Prisma.raw(`"${p}_name_snapshot"`)} AS "partyName",
      d."ref", d."currency_code" AS "currency", d."grand_total"::numeric(18, 2)::text AS "grandTotal",
      d."line_count"::int AS "lineCount", d."total_pcs" AS "totalPcs", d."total_weight_ct"::numeric(15, 3)::text AS "totalWeightCt",
      d."submitted_at" AS "submittedAt", d."submitted_by" AS "submittedBy", d."submitted_by_name" AS "submittedByName",
      d."revision_count"::int AS "revisionCount", d."review_action" AS "reviewAction", d."review_note" AS "reviewNote",
      d."reviewed_at" AS "reviewedAt", d."reviewed_by_name" AS "reviewedByName", d."updated_at" AS "updatedAt",
      COALESCE(st.names, ARRAY[]::text[]) AS "stoneNames", COALESCE(st.distinct_count, 0) AS "stoneCount"
    FROM ${tableOf(entry.table)} d
    LEFT JOIN LATERAL (
      SELECT (array_agg(x.stone ORDER BY x.first_pos))[1:${STONE_PREVIEW}]::text[] AS names, count(*)::int AS distinct_count
      FROM (SELECT l."stone" AS stone, min(l."position") AS first_pos FROM ${lines} l WHERE ${parent} = d."id" AND l."stone" <> '' GROUP BY l."stone") x
    ) st ON true
    WHERE ${Prisma.join(where, " AND ")}
    ORDER BY ${Prisma.join(columns.map((column) => Prisma.sql`${column} ${direction}`), ", ")}
    LIMIT ${query.limit + 1}`;
}

type PendingDbRow = {
  id: string; docNo: string; docDate: string; dueDate: string; version: number; partyId: string; partyCode: string; partyName: string;
  ref: string; currency: string; grandTotal: string; lineCount: number; totalPcs: number; totalWeightCt: string;
  submittedAt: Date; submittedBy: string; submittedByName: string | null; revisionCount: number;
  reviewAction: string | null; reviewNote: string | null; reviewedAt: Date | null; reviewedByName: string | null; updatedAt: Date;
  stoneNames: string[]; stoneCount: number;
};

export function toApprovalRow(type: ApprovalDocType, row: PendingDbRow): ApprovalRow {
  const stoneCount = Number(row.stoneCount);
  return {
    type,
    id: row.id,
    docNo: row.docNo,
    docDate: row.docDate,
    dueDate: row.dueDate,
    version: Number(row.version),
    status: "PENDING_APPROVAL",
    party: { id: row.partyId, code: row.partyCode, name: row.partyName },
    ref: row.ref,
    currency: row.currency,
    grandTotal: row.grandTotal,
    lineCount: Number(row.lineCount),
    totalPcs: Number(row.totalPcs),
    totalWeightCt: row.totalWeightCt,
    stoneNames: row.stoneNames.slice(0, STONE_PREVIEW),
    moreStoneCount: Math.max(stoneCount - STONE_PREVIEW, 0),
    submittedAt: row.submittedAt.toISOString(),
    submittedBy: row.submittedBy,
    submittedByName: row.submittedByName,
    revisionCount: Number(row.revisionCount) >= 1 ? 1 : 0,
    lastReview: reviewOf(row),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The cursor keys of the last row of a page for `sort`. */
function cursorKeys(row: ApprovalRow, sort: PendingSort): string[] {
  switch (sort) {
    case "submittedAt": return [row.submittedAt];
    case "docNo": return [row.docNo];
    case "party": return [];
    case "qty": return [row.totalWeightCt];
    case "value": return [row.currency, row.grandTotal];
  }
}

/** Whether `id` is a live PENDING_APPROVAL row of the entry's table (one primary-key read). */
async function isLivePending(tx: Prisma.TransactionClient, entry: ApprovalRegistryEntry, id: string): Promise<boolean> {
  const rows = await tx.$queryRaw<unknown[]>(Prisma.sql`SELECT 1 FROM ${tableOf(entry.table)} WHERE "id" = ${id}::uuid AND ${LIVE_PENDING}`);
  return rows.length > 0;
}

export const approvalTypeOff = () => partnerException("APPROVAL_TYPE_OFF", HttpStatus.CONFLICT);

@Injectable()
export class ApprovalService {
  private readonly logger = new Logger("Approval");

  /**
   * Capped pending counts (D15) for the types the caller `canApprove` whose setting is ON, plus every such type's
   * setting (`types`) so the Approve menu can show OFF types as off. No permitted type → no query.
   */
  async summary(principal: FlowPrincipal): Promise<ApprovalSummary> {
    const permitted = permittedApprovalTypes(principal);
    if (permitted.length === 0) return { items: [], countCap: SUMMARY_COUNT_CAP, types: [] };
    try {
      const rows = await prisma.$queryRaw<{ type: ApprovalDocType; requireApproval: boolean; count: number | null }[]>(summarySql(permitted));
      const byType = new Map(rows.map((row) => [row.type, row]));
      const types = permitted.map((type) => ({ type, requireApproval: byType.get(type)?.requireApproval ?? true }));
      const items = permitted.flatMap((type) => {
        const row = byType.get(type);
        return row && row.requireApproval ? [{ type, count: Math.min(Number(row.count ?? 0), SUMMARY_COUNT_CAP) }] : [];
      });
      return { items, countCap: SUMMARY_COUNT_CAP, types };
    } catch (error) {
      throw this.mapError(error, { operation: "summary" });
    }
  }

  /**
   * One page of a type's PENDING_APPROVAL documents (D16). The caller's `canApprove` is checked by the router before
   * this runs. The type's setting must be ON (`APPROVAL_TYPE_OFF` 409); the setting read and the page run in one
   * READ_TX (2.5 s, below the gateway's 3 s read timeout).
   */
  async pending(input: ApprovalPendingInput): Promise<ApprovalPendingPage> {
    const entry = APPROVAL_REGISTRY[input.type];
    const q = input.q ? input.q : undefined;
    const after = input.cursor ? decodePendingCursor(input.cursor, { sort: input.sort, dir: input.dir, q }) : null;
    try {
      const rows = await prisma.$transaction(async (tx) => {
        // A plain read (no lock); a missing row reads as ON, as for Save.
        if (!(await peekApprovalSetting(tx, input.type))) throw approvalTypeOff();
        // A party cursor names its row by id only: a row that is not (or no longer) live and pending in this type →
        // `VALIDATION_ERROR cursor` (the client resets paging), never an ordering read of another row.
        if (after && input.sort === "party" && !(await isLivePending(tx, entry, after.id))) throw validationException([{ path: "cursor", code: "invalid" }]);
        return tx.$queryRaw<PendingDbRow[]>(pendingSql(entry, { sort: input.sort, dir: input.dir, q, limit: input.limit, after }));
      }, READ_TX);
      const page = rows.slice(0, input.limit).map((row) => toApprovalRow(input.type, row));
      const last = page.at(-1);
      return {
        items: page,
        nextCursor: rows.length > input.limit && last ? encodePendingCursor({ sort: input.sort, dir: input.dir, q, keys: cursorKeys(last, input.sort), id: last.id }) : null,
      };
    } catch (error) {
      throw this.mapError(error, { operation: "pending", type: input.type, sort: input.sort, hasQuery: Boolean(q) });
    }
  }

  /** Unavailable / timeout → 503 PARTNER_UNAVAILABLE (logged without the search text); domain errors pass through. */
  private mapError(error: unknown, context: Record<string, unknown>): unknown {
    if (isPrismaUnavailable(error)) {
      this.logger.warn({ event: "approval.db_unavailable", ...context, prismaCode: prismaCode(error) ?? "driver" });
      return partnerException("PARTNER_UNAVAILABLE", HttpStatus.SERVICE_UNAVAILABLE);
    }
    return error;
  }
}
