# Frontend data flow: document-setup

- UI revision: 1 (approved)
- Related contract: [SA decisions rev 1](../../backend/master/document-setup/decisions.md) (approved and implemented 2026-10-23)
- Backend requirement: delivered — `documentSetup.list/get/save` in backend-api-master, permission leaf `document-setup` (VIEW, EDIT). Final shapes in SA-DS-03/04: optimistic `expectedVersion` (not `expectedUpdatedAt`), `inUse` computed in the browser.

| UI action / TODO ID | Proposed operation (for SA) | Input / output | Query key / cache | Loading / error / empty | Backend owner |
|---|---|---|---|---|---|
| Drawer list (FE-DS-002) | `documentSetup.list` query | none → `{ items: { transactionKey, label, defaultCode, configured: boolean, code: string \| null }[] }` (≤ 30) | `["documentSetup","list"]`; refetch after save | skeleton rows / inline error with Retry / never empty (fixed list) | SA → backend (master service, **A**) |
| Load one (FE-DS-003) | `documentSetup.get` query | `{ transactionKey }` → `{ transactionKey, name, code, startFrom, rows: { id, effectiveDate, prefix, separator, startNo, inUse: boolean, used: boolean }[], declaration, updatedAt } \| null` (null = never set up) | `["documentSetup","get",key]` | card skeleton / `DetailLoadError` / null → defaults notice | SA → backend |
| Save (FE-DS-004) | `documentSetup.save` mutation (upsert whole setup) | `{ transactionKey, name, code, startFrom, rows[], declaration, expectedUpdatedAt? }` → `{ updatedAt }` | invalidate list + get | Save loading; conflict → reload prompt | SA → backend |

- Permission (FE-DS-007): new catalog leaf `document-setup` under SETUP with VIEW and EDIT (Q-DS-07); API checks `document-setup:VIEW` / `:EDIT`; the Setup tile follows VIEW.
- Optimistic concurrency with `expectedUpdatedAt` (same as other master pages) → 409 `DOCUMENT_SETUP_CHANGED`.
- Business rules for SA (from the owner text): a row applies from its Date until the next row's Date; numbers keep running inside a row; document number = Prefix + Separator + running number (padding per Q-DS-05). Issuing numbers for real transactions is out of scope for this page and belongs to each transaction's future feature.
- Until SA delivers: FE-DS-001…006 can be built against a typed fake adapter behind the same function names, clearly marked as a mock (not merged as the real data source); wiring FE-DS-008 waits for the approved contract.
