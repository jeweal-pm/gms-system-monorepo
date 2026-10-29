# Authorization: memo-receive (SA revision 1, 2026-10-29, approved 2026-10-29)

Uses the existing master boundary (ADR-0031, `requireMasterGrant`): session principal, live authorization view, license, and CSRF for mutations. The catalog already has the leaves `memo-receive` and `memo-return` with all nine actions, so **the catalog does not change**. `MasterMenu` gains `"memo-receive" | "memo-return"`.

| Procedure | Grant | CSRF |
|---|---|---|
| memoReceive.list / get / nextNumber / options | `memo-receive:VIEW` | – |
| memoReceive.create | `memo-receive:ADD` | yes |
| memoReceive.update | `memo-receive:EDIT` | yes |
| memoReceive.delete | `memo-receive:DELETE` | yes |
| memoReceive.approve | `memo-receive:APPROVE` (the creator may approve, like quotation Q-QT-02) | yes |
| memoStock.list | `memo-return:VIEW` **or** `memo-receive:VIEW` (`permittedAny`) | – |
| currency.options | adds `memo-receive` to its `permittedAny` list | – |

- The actor id comes only from the verified session and is never taken from input or headers.
- The frontend hides the Approve button without APPROVE. That is UX only, because the server checks every call.
- `memoReceive.options` replaces the four separate master reads (vendor, currency, stone master, document setup). A user then needs only `memo-receive:VIEW`.
- Prices are returned to every VIEW holder, as on Memo Out. A `PRICE` action gate is not in this revision.
