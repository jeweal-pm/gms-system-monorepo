# API contract: master / decimal-setup (SA revision 1, pending-review)

Transport: tRPC over `/api/master/trpc` (ADR-0025), router `decimalSetup` in `backend-api-master/src/master/router.ts`.
Consumers: FE-DEC-101…105 in [decimal-setup.md](../../../../task/todo/decimal-setup.md).

## Types (zod, `src/decimal-setup/decimal-setup.schemas.ts`)

```ts
export const WEIGHT_PLACES_MAX = 3; // partner weight columns numeric(12,3)
export const PRICE_PLACES_MAX = 2;  // partner money columns numeric(18,2)
export const DECIMAL_SETUP_DEFAULTS = { weightPlaces: 2, pricePlaces: 2 } as const;

export const saveDecimalSetupBodySchema = z.object({
  weightPlaces: z.number().int().min(0).max(WEIGHT_PLACES_MAX),
  pricePlaces: z.number().int().min(0).max(PRICE_PLACES_MAX),
  /** The version that was loaded; 0 only when `get` returned the missing-row defaults. */
  expectedVersion: z.number().int().min(0),
}).strict();

type DecimalSetup = {
  weightPlaces: number;      // 0..3
  pricePlaces: number;       // 0..2
  version: number;           // ≥ 1 (0 = row missing, defaults returned)
  updatedAt: string;         // ISO 8601
  updatedBy: string | null;  // user id; null = seeded by migration
};
```

## Operations

| Operation | Input | Output | Authorization | Errors (`data.domainCode`) |
|---|---|---|---|---|
| `decimalSetup.get` query | none | `{ setup: DecimalSetup }` | signed in, current authorization, license ELIGIBLE; **no menu grant** ([authorization](authorization.md)) | `UNAUTHENTICATED` 401, `LICENSE_REQUIRED` 403, `AUTHORIZATION_UNAVAILABLE` 503, `PARTNER_UNAVAILABLE` 503 |
| `decimalSetup.save` mutation | `saveDecimalSetupBodySchema` | `{ setup: DecimalSetup }` | `decimal-setup:EDIT` + CSRF | `VALIDATION_ERROR` 400 (unknown key, non-integer, out of range), `DECIMAL_SETUP_CHANGED` 409, `PERMISSION_DENIED` 403, `CSRF_INVALID` 403, plus the `get` errors |

- No pagination (single object). Output is never cached by the server.
- Compatibility: new procedures only; no existing operation changes. Quotation/memo/reserve schemas keep `decimal(p, s)` at storage
  scale (SA-DEC-05), so documents created by any client remain valid regardless of the setting.
- Frontend cache contract: query key = tRPC key of `decimalSetup.get`; after a successful save the client sets the query data
  to the returned `setup` (and invalidates it), so every open tab in this browser re-renders with the new places.

## Examples

```jsonc
// get → 
{ "setup": { "weightPlaces": 2, "pricePlaces": 2, "version": 1, "updatedAt": "2026-11-03T02:00:00.000Z", "updatedBy": null } }
// save { "weightPlaces": 3, "pricePlaces": 2, "expectedVersion": 1 } →
{ "setup": { "weightPlaces": 3, "pricePlaces": 2, "version": 2, "updatedAt": "2026-11-03T03:10:00.000Z", "updatedBy": "usr_…" } }
// save { "weightPlaces": 4, … } → 400 VALIDATION_ERROR
// save { …, "expectedVersion": 1 } after another admin saved → 409 DECIMAL_SETUP_CHANGED
```
