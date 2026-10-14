# Database diagram: partner / customer

- Source UI revision / SA revision: 1 / 1 (pending-review; **proposal**, no migration written)
- Owning service / schema: `backend-api-partner` / PostgreSQL schema `partner` in database `f1_system`
- Actual Prisma schema / migration paths (proposed): `backend-api-partner/prisma/schema.prisma`, `backend-api-partner/prisma.config.ts`, `backend-api-partner/prisma/migrations/<YYYYMMDDHHMMSS>_customer/migration.sql` (backend writes; parent serializes like `backend-api-auth/prisma/**`)
- Migrations table: `partner._prisma_migrations` (auth keeps `public._prisma_migrations`, unchanged)

Everything below is **NEW**. No `auth` table changes; no cross-schema foreign keys.

```mermaid
erDiagram
    customer ||--|{ customer_address : "has 2..20 (ON DELETE CASCADE)"
    customer {
        uuid id PK
        varchar200 name "required"
        varchar200 name_key "lower(name), ordering/keyset"
        varchar120 code "nullable, Code Name"
        varchar120 code_key UK "nullable, lower(code)"
        char3 currency_code "ISO 4217"
        boolean active "default true"
        varchar100 first_name "required"
        varchar100 middle_name "nullable"
        varchar100 last_name "nullable"
        varchar16 phone_e164 "nullable"
        char2 phone_country "nullable"
        varchar254 email "lowercase, not unique"
        timestamp3 created_at
        timestamp3 updated_at "optimistic version"
        varchar64 created_by "auth user id, no FK"
        varchar64 updated_by "auth user id, no FK"
    }
    customer_address {
        uuid id PK
        uuid customer_id FK
        enum type "INVOICE or SHIPPING"
        smallint position "1..10 per type"
        varchar200 name "required"
        varchar32 tax_id "nullable, INVOICE only"
        varchar500 address "required"
        char2 country_code "ISO 3166-1 alpha-2"
        varchar100 state "free text"
        varchar100 city "free text"
        varchar20 postcode
        boolean is_default "one per customer+type"
    }
```

## Prisma proposal

```prisma
generator client {
  provider        = "prisma-client"
  output          = "../src/generated/prisma"
  previewFeatures = ["partialIndexes"]          // D-03; available since Prisma 7.4, installed 7.10.0
}

datasource db {
  provider = "postgresql"
  schemas  = ["partner"]
}

enum AddressType {
  INVOICE
  SHIPPING
  @@map("address_type")
  @@schema("partner")
}

model Customer {
  id           String            @id @default(uuid()) @db.Uuid
  name         String            @db.VarChar(200)
  nameKey      String            @map("name_key") @db.VarChar(200)
  code         String?           @db.VarChar(120)
  codeKey      String?           @unique(map: "customer_code_key_key") @map("code_key") @db.VarChar(120)
  currencyCode String            @map("currency_code") @db.Char(3)
  active       Boolean           @default(true)
  firstName    String            @map("first_name") @db.VarChar(100)
  middleName   String?           @map("middle_name") @db.VarChar(100)
  lastName     String?           @map("last_name") @db.VarChar(100)
  phoneE164    String?           @map("phone_e164") @db.VarChar(16)
  phoneCountry String?           @map("phone_country") @db.Char(2)
  email        String            @db.VarChar(254)
  createdAt    DateTime          @default(now()) @map("created_at") @db.Timestamp(3)
  updatedAt    DateTime          @default(now()) @map("updated_at") @db.Timestamp(3)   // set explicitly by the service (not @updatedAt)
  createdBy    String            @map("created_by") @db.VarChar(64)
  updatedBy    String            @map("updated_by") @db.VarChar(64)
  addresses    CustomerAddress[]

  @@index([nameKey, id], map: "customer_name_key_id_idx")
  @@index([active, nameKey, id], map: "customer_active_name_key_id_idx")
  @@map("customer")
  @@schema("partner")
}

model CustomerAddress {
  id          String      @id @default(uuid()) @db.Uuid
  customerId  String      @map("customer_id") @db.Uuid
  type        AddressType
  position    Int         @db.SmallInt
  name        String      @db.VarChar(200)
  taxId       String?     @map("tax_id") @db.VarChar(32)
  address     String      @db.VarChar(500)
  countryCode String      @map("country_code") @db.Char(2)
  state       String      @db.VarChar(100)
  city        String      @db.VarChar(100)
  postcode    String      @db.VarChar(20)
  isDefault   Boolean     @default(false) @map("is_default")
  customer    Customer    @relation(fields: [customerId], references: [id], onDelete: Cascade)

  @@unique([customerId, type, position], map: "customer_address_position_key")
  @@unique([customerId, type], where: { isDefault: true }, map: "customer_address_one_default_key")
  @@map("customer_address")
  @@schema("partner")
}
```

`updatedAt` is written explicitly (`GREATEST(now(), expected + 1 ms)`, D-05) instead of `@updatedAt`,
so the conditional `UPDATE … WHERE updated_at = $expected` is a single statement. Backend uses
`$executeRaw` (tagged template, parameterized) or `updateMany({ where: { id, updatedAt } })` with an
explicit value; either is acceptable if the GREATEST rule holds.

### Raw SQL CHECKs appended to the migration (Prisma cannot express them)

```sql
ALTER TABLE "partner"."customer"
  ADD CONSTRAINT customer_name_key_chk     CHECK (name_key = lower(name)),
  ADD CONSTRAINT customer_code_key_chk     CHECK ((code IS NULL AND code_key IS NULL) OR code_key = lower(code)),
  ADD CONSTRAINT customer_code_nonblank_chk CHECK (code IS NULL OR length(btrim(code)) > 0),
  ADD CONSTRAINT customer_currency_chk     CHECK (currency_code ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT customer_email_lower_chk  CHECK (email = lower(email)),
  ADD CONSTRAINT customer_phone_chk        CHECK ((phone_e164 IS NULL) = (phone_country IS NULL)
                                                  AND (phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9][0-9]{6,14}$')
                                                  AND (phone_country IS NULL OR phone_country ~ '^[A-Z]{2}$'));
ALTER TABLE "partner"."customer_address"
  ADD CONSTRAINT customer_address_position_chk CHECK (position BETWEEN 1 AND 10),
  ADD CONSTRAINT customer_address_country_chk  CHECK (country_code ~ '^[A-Z]{2}$'),
  ADD CONSTRAINT customer_address_taxid_chk    CHECK (type = 'INVOICE' OR tax_id IS NULL);
```

Prisma ignores CHECK constraints when diffing, so they do not cause drift.
**D-03 fallback:** if `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script`
is not empty after generating the migration with the preview feature, remove the `where:` unique from
the schema and add instead
`CREATE UNIQUE INDEX customer_address_one_default_key ON "partner"."customer_address"(customer_id, type) WHERE is_default;`
in the migration, with a schema comment that later migrations must keep it (review each generated migration for a `DROP INDEX` of it).

## Constraints, indexes, bounds

| Object | Purpose |
|---|---|
| `customer_pkey (id)` | get/update/delete by id |
| `customer_code_key_key UNIQUE (code_key)` | case-insensitive Code Name uniqueness; multiple NULLs allowed (PostgreSQL default `NULLS DISTINCT`) |
| `customer_name_key_id_idx (name_key, id)` | list order + keyset cursor (ADR "`lower(name)` index") |
| `customer_active_name_key_id_idx (active, name_key, id)` | list with `active` filter (ADR "`(active, name)`") |
| `customer_address_pkey (id)` | — |
| `customer_address_position_key UNIQUE (customer_id, type, position)` | stable ordering; also serves FK lookups and cascade (prefix `customer_id`) |
| `customer_address_one_default_key UNIQUE (customer_id, type) WHERE is_default` | one default per customer and type |
| FK `customer_address.customer_id → customer.id ON DELETE CASCADE` | hard delete removes addresses |

- Bounds in code: 1–10 addresses per type (≤ 20 per customer); list `limit` ≤ 50; search text ≤ 100.
- Search (`ILIKE '%q%'` on `name`, `code`) is a sequential scan by design (D-07, measured later).
- Timestamps `timestamp(3)` without time zone, stored as UTC (same convention as auth). No money/decimal fields.
- UUIDs generated by Prisma (`@default(uuid())`, v4) in the application, no `pgcrypto` needed.
- No cross-schema FK: `created_by`/`updated_by` are opaque auth user IDs; a deleted user leaves them as historical values.

## Migration, backfill, compatibility, rollback

1. **Schema selection (D-01).** `prisma.config.ts`:
   `datasource: { url: process.env.PARTNER_DATABASE_URL }` where the URL ends with `?schema=partner`
   (dev default `postgresql://f1_user:f1_dev_password@127.0.0.1:5432/f1_system?schema=partner`).
   Prisma's schema engine uses the URL `schema` argument (default `public`) as its default schema
   and creates `_prisma_migrations` there; this keeps partner's history separate from auth's
   `public._prisma_migrations`. Runtime `prisma-client.ts` removes the `schema` search parameter
   before handing the URL to `pg`, passes `max: 5`, `idleTimeoutMillis: 30000`,
   `connectionTimeoutMillis: 2000`, and constructs `new PrismaPg(poolConfig, { schema: "partner" })`.
   **Gate (BT-CUS-00):** after the first `migrate deploy`, `to_regclass('partner._prisma_migrations')`
   is non-null and the row count of `public._prisma_migrations` is unchanged. If the table lands in
   `public`, stop and return to SA (do not continue with mixed histories).
2. **Migration content (additive only):** `CREATE SCHEMA IF NOT EXISTS "partner"`, enum
   `partner.address_type`, two tables, indexes, FK, CHECKs above. Nothing in `auth`/`public` changes.
3. **Backfill:** none (new data).
4. **Order:** migrate (partner container start runs `prisma migrate deploy`, same as auth) → partner
   serves → gateway router → frontend. Note the shared Prisma advisory lock with auth's migrate
   (see [architecture](architecture.md#container-infrastructure) item 5).
5. **Compatibility:** old gateway/frontend ignore schema `partner`. Auth's Prisma project lists only
   `schemas = ["auth"]` and never introspects or resets `partner`; partner's lists only `["partner"]`.
   `prisma migrate dev`/`reset` for partner must be run with the partner config only (it drops
   schema `partner` contents in dev — never against production).
6. **Rollback:** redeploy without partner; the schema and data remain and are harmless. Full removal,
   only on an explicit owner decision: `DROP SCHEMA partner CASCADE;` (also removes
   `partner._prisma_migrations`), after a `pg_dump --schema=partner` backup. Prisma has no down migrations.
7. Run `prisma generate` for partner in build/typecheck and in the dev image; never hand-edit
   `src/generated/prisma`.
