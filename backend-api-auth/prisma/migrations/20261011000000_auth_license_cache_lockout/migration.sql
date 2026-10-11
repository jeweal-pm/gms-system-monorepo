CREATE TABLE "auth"."LicenseCache" (
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error_at" TIMESTAMP(3),

    CONSTRAINT "LicenseCache_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "LicenseCache_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "auth"."LicenseActivationLockout" (
    "user_id" TEXT NOT NULL,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LicenseActivationLockout_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "LicenseActivationLockout_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
