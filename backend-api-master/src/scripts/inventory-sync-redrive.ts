import { prisma } from "../database/prisma-client";
import { holdSaga } from "../trade-document/inventory-hold-saga";
import "../trade-document/reserve.service";
import "../trade-document/memo-out.service";
import "../trade-document/memo-out-return.service";

/**
 * Operator re-drive (ADR-0052 D19, error-handling "STUCK"): after the cause is fixed,
 * `pnpm --filter backend-api-master inventory-sync:redrive <reserve|memo-out|memo-out-return> <documentId>` makes the
 * document's STUCK / PREPARED op due again and drives it once. Prints the op's stage and state; ids only.
 */
const TYPES = new Set(["reserve", "memo-out", "memo-out-return"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main() {
  const [type, id] = process.argv.slice(2);
  if (!type || !TYPES.has(type) || !id || !UUID.test(id)) {
    console.error("usage: inventory-sync:redrive <reserve|memo-out|memo-out-return> <documentId>");
    process.exit(2);
  }
  const outcome = await holdSaga.operatorRedrive(type as "reserve" | "memo-out" | "memo-out-return", id);
  console.log(`inventory-sync:redrive ${type} ${id}: ${outcome}`);
}

main().then(
  () => prisma.$disconnect().then(() => process.exit(0)),
  (error: unknown) => {
    console.error(`inventory-sync:redrive failed: ${error instanceof Error ? error.name : "unknown"}`);
    void prisma.$disconnect().then(() => process.exit(1));
  },
);
