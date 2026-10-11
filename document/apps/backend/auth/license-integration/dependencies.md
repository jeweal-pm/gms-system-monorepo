# Dependencies: auth license integration

- Feature / SA revision: `auth-license` / 2
- Status: approved; `jose` direct dependency approved for implementation
- Central ledger: [tech-stack](../../../../adr/tech-stack.md)

| Package / workspace | Status | Purpose / TODO IDs | Evidence / alternatives | Host cost | ADR / approval | Installed |
|---|---|---|---|---|---|---|
| `jose@6.2.12` direct dependency in `backend-api-auth` | approved | Verify EdDSA JWT and sign deterministic mock tokens; BE-LIC-001/005 | [Official jose API docs](https://github.com/panva/jose/tree/main/docs), [v6.2.12 release](https://github.com/panva/jose/releases/tag/v6.2.12); exact direct dependency avoids custom JWT implementation. | Existing auth process; no container. | ADR-0013/0014 SA revision 2; owner approved 2026-10-11 | Installed exact version `6.2.12` |

No HTTP client package is proposed; use built-in Node `fetch` with `AbortSignal.timeout` and
explicit response-schema validation. No Redis, worker, queue, cache server or container is
introduced. Parent serializes the approved manifest/lockfile update.

Better Auth email change is disabled in the current config and remains disabled for licensed
accounts. License transfer is not supported. A user needing another email must create a new
account with a separately issued license. No Better Auth hook or package change is proposed
by SA.
