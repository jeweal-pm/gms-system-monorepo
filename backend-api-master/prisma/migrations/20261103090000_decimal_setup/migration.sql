-- decimal-setup SA revision 1 / ADR-0038 (owner 2026-11-03): one global Decimal Setup row (expand-only).
-- Ranges follow storage scale: weight columns numeric(12,3), money columns numeric(18,2) (SA-DEC-02).
-- Rollback: DROP TABLE "partner"."decimal_setup"; (nothing references it).
CREATE TABLE "partner"."decimal_setup" (
  "id" SMALLINT NOT NULL DEFAULT 1,
  "weight_places" SMALLINT NOT NULL DEFAULT 2,
  "price_places" SMALLINT NOT NULL DEFAULT 2,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updated_by" VARCHAR(64),
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "decimal_setup_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "decimal_setup_single_row" CHECK ("id" = 1),
  CONSTRAINT "decimal_setup_weight_places_range" CHECK ("weight_places" BETWEEN 0 AND 3),
  CONSTRAINT "decimal_setup_price_places_range" CHECK ("price_places" BETWEEN 0 AND 2),
  CONSTRAINT "decimal_setup_version_positive" CHECK ("version" >= 1)
);

-- Seed 2/2 = today's display (Q-DEC-09).
INSERT INTO "partner"."decimal_setup" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
