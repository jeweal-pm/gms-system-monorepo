# Frontend data flow: <feature>

- UI revision: <revision>
- Related shared/SA API contract: <links>
- Backend requirement: unchanged-approved / requires-sa / pending-SA-review

| UI action / TODO ID | Existing or proposed operation | Input / output | Query key / cache | Loading / error / empty | Backend owner |
|---|---|---|---|---|---|

Use the current typed tRPC/TanStack Query provider for app data and Better Auth for session
operations; retain same-origin proxy boundaries. Specify pagination/filter/sort bounds,
query enabling, cache freshness, mutation invalidation, optimistic rollback if needed, and
race/duplicate-request handling. Do not cache server data in UI stores.

Link the exact SA revision and backend TODO for new/changed operations. Separate independent
UI work from wiring that needs SA approval and backend completion. Planned/mocked behavior
is not proof of an implemented service; document its limits and replacement task.
