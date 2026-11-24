import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { createDb, Prisma } from "../../src/platform/db";
import { readCards } from "../../src/modules/stock/card";
import { readValueCards } from "../../src/modules/stock/value";
import { ReportGuard, runReport } from "../../src/modules/reports/guard";

const db = createDb("postgresql://f1_user:tpw@127.0.0.1:55432/f1_perf");
const guard = new ReportGuard();
const p95 = (v: number[]) => [...v].sort((a, b) => a - b)[Math.max(0, Math.ceil(v.length * 0.95) - 1)];
async function lat(n: number, conc: number, fn: (i: number) => Promise<unknown>) {
  const out: number[] = []; let next = 0;
  await Promise.all(Array.from({ length: conc }, async () => { for (;;) { const i = next++; if (i >= n) return; const t = performance.now(); await fn(i); out.push(performance.now() - t); } }));
  return out;
}
describe("adhoc", () => {
  it("measure", async () => {
    const lines: string[] = [];
    const say = (s: string) => lines.push(s);
    const sorts = ["stoneCode", "amount"] as const;
    for (const sort of sorts) {
      await runReport(db, guard, {}, (tx) => readValueCards(tx, { page: 1, pageSize: 25, sort, dir: "asc" }));
      const seq = await lat(10, 1, () => runReport(db, guard, {}, (tx) => readValueCards(tx, { page: 1, pageSize: 25, sort, dir: "asc" })));
      const par = await lat(10, 2, () => runReport(db, guard, {}, (tx) => readValueCards(tx, { page: 1, pageSize: 25, sort, dir: "asc" })));
      say(`value CURRENT list sort=${sort}: sequential p95 ${p95(seq).toFixed(0)} ms (min ${Math.min(...seq).toFixed(0)}), 2 concurrent p95 ${p95(par).toFixed(0)} ms`);
    }
    const card = await lat(10, 1, () => runReport(db, guard, {}, (tx) => readCards(tx, { page: 1, pageSize: 25, sort: "stoneCode", dir: "asc" })));
    say(`stock card CURRENT list (baseline, same data): sequential p95 ${p95(card).toFixed(0)} ms`);
    const r = await runReport(db, guard, {}, (tx) => readValueCards(tx, { page: 1, pageSize: 25, sort: "stoneCode", dir: "asc" }));
    say(`rows total ${r.total}, totals ${JSON.stringify(r.totals)}`);
    let captured: Prisma.Sql | undefined;
    await readValueCards({ $queryRaw: async (sql: Prisma.Sql) => { captured = sql; return []; } } as never, { page: 1, pageSize: 25, sort: "stoneCode", dir: "asc" });
    const plan = await db.$queryRawUnsafe<{ "QUERY PLAN": string }[]>(`EXPLAIN (ANALYZE, BUFFERS) ${captured!.text}`, ...captured!.values);
    writeFileSync(process.env.PERF_OUT!, lines.join("\n") + "\n\n" + plan.map((x) => x["QUERY PLAN"]).join("\n"));
    console.info(lines.join("\n"));
  }, 300000);
});
