/**
 * location-master (ADR-0053, SA-LM-05): Purchase Order / Purchase manual rows now need an active Location Master name.
 * The disposable test database starts with an empty master, so the suites that type a location add the names they use
 * (idempotent: an existing name, any case, is left alone).
 */
export const TEST_LOCATIONS = ["Safe A", "Safe B", "Safe", "Shelf 1"] as const;

type RawClient = { $executeRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<number> };

export async function ensureTestLocations(prisma: RawClient, names: readonly string[] = TEST_LOCATIONS): Promise<void> {
  for (const name of names) {
    await prisma.$executeRaw`
      INSERT INTO "partner"."location" ("id", "name", "created_by", "updated_by")
      VALUES (gen_random_uuid(), ${name}, 'test', 'test')
      ON CONFLICT ((lower("name"))) DO UPDATE SET "active" = true`;
  }
}
