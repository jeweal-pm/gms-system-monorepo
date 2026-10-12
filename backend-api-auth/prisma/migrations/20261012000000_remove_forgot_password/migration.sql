-- ADR-0015: forgot password removed; its rate-limit counters hold no business data.
DROP TABLE IF EXISTS "auth"."ForgotPasswordAttempt";
