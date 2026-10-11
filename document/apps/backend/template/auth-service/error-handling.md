# Service error handling: <service> / <feature>

| Scenario | Domain error / status | Public contract | User-visible outcome | Retry/idempotency | Logging |
|---|---|---|---|---|---|

Cover applicable validation, unauthenticated/forbidden, missing/duplicate data, conflicts,
timeout, unavailable dependencies, and transaction rollback. Do not expose stack traces,
passwords, session secrets, or personal data. Define correlation/evidence and expected gateway
mapping; link the matching frontend error-handling document and API operations.
