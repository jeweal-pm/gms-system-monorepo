-- currency SA revision 1 (owner 2026-10-26): currency master with selling/buying rates against the company
-- currency. Expand-only; existing tables keep their currency_code columns unchanged.
CREATE TABLE "partner"."currency" (
  "id" UUID NOT NULL,
  "code" CHAR(3) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "description" VARCHAR(250) NOT NULL DEFAULT '',
  "selling_rate" DECIMAL(18,4),
  "buying_rate" DECIMAL(18,4),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" VARCHAR(64) NOT NULL,
  "updated_by" VARCHAR(64) NOT NULL,
  CONSTRAINT "currency_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "currency_code_check" CHECK ("code" ~ '^[A-Z]{3}$'),
  CONSTRAINT "currency_name_check" CHECK (length(btrim("name")) BETWEEN 1 AND 100),
  CONSTRAINT "currency_selling_rate_check" CHECK ("selling_rate" IS NULL OR "selling_rate" > 0),
  CONSTRAINT "currency_buying_rate_check" CHECK ("buying_rate" IS NULL OR "buying_rate" > 0)
);

CREATE UNIQUE INDEX "currency_code_key" ON "partner"."currency"("code");

-- Q-CUR-06: every code already in use, plus THB and USD, becomes an active currency without rates.
WITH "known"("code", "name") AS (
  VALUES
    ('THB', 'Thai Baht'), ('USD', 'US Dollar'), ('EUR', 'Euro'), ('GBP', 'British Pound'), ('JPY', 'Japanese Yen'),
    ('CNY', 'Chinese Yuan'), ('HKD', 'Hong Kong Dollar'), ('SGD', 'Singapore Dollar'), ('CHF', 'Swiss Franc'),
    ('AUD', 'Australian Dollar'), ('CAD', 'Canadian Dollar'), ('NZD', 'New Zealand Dollar'), ('INR', 'Indian Rupee'),
    ('LKR', 'Sri Lankan Rupee'), ('MYR', 'Malaysian Ringgit'), ('IDR', 'Indonesian Rupiah'), ('PHP', 'Philippine Peso'),
    ('VND', 'Vietnamese Dong'), ('KRW', 'South Korean Won'), ('TWD', 'New Taiwan Dollar'), ('AED', 'UAE Dirham'),
    ('MMK', 'Myanmar Kyat'), ('LAK', 'Lao Kip'), ('KHR', 'Cambodian Riel')
),
"used"("code") AS (
  SELECT 'THB' UNION SELECT 'USD'
  UNION SELECT "currency_code" FROM "partner"."company_profile"
  UNION SELECT "currency_code" FROM "partner"."customer"
  UNION SELECT "currency_code" FROM "partner"."vendor"
)
INSERT INTO "partner"."currency" ("id", "code", "name", "created_by", "updated_by")
SELECT gen_random_uuid(), "used"."code", COALESCE("known"."name", "used"."code"), 'migration', 'migration'
FROM "used" LEFT JOIN "known" ON "known"."code" = "used"."code"
WHERE "used"."code" ~ '^[A-Z]{3}$';
