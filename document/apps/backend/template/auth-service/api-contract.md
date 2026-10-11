# API contract: <service> / <feature>

- Source UI revision / SA revision: <revision> / <revision>
- Existing shared contract: <document/spec link>
- Consuming frontend TODO IDs: <IDs>

| Operation / route or message | Caller | Input / validation | Output | Permission | Errors | Compatibility |
|---|---|---|---|---|---|---|

Provide TypeScript-like request/response examples without credentials or personal data.
Specify nullable fields, timestamps/timezone, enum values, pagination/filter/sort bounds,
duplicate/concurrent behavior, and mutation idempotency where relevant. Separate implemented
contracts from proposed ones. Frontend uses the gateway/same-origin boundary; no direct
browser calls into internal domain services. Link sequence and error documents.
