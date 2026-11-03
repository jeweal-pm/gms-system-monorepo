import { z } from "zod";

/** decimal-setup SA rev 1 / ADR-0038 (SA-DEC-02 as changed by the owner, Q-DEC-08): display/entry ranges. */
// Owner 2026-11-03 (Q-DEC-08 changed: "max decimal 4", display and typing only): both settings accept 0–4.
// Storage scales (weight numeric(12,3), money numeric(18,2)), document validation and the 2-dp server totals do not change.
export const WEIGHT_PLACES_MAX = 4;
export const PRICE_PLACES_MAX = 4;
/** Seed row and missing-row answer (Q-DEC-09: weight starts at 2 places). */
export const DECIMAL_SETUP_DEFAULTS = { weightPlaces: 2, pricePlaces: 2 } as const;

export const saveDecimalSetupBodySchema = z.object({
  weightPlaces: z.number().int().min(0).max(WEIGHT_PLACES_MAX),
  pricePlaces: z.number().int().min(0).max(PRICE_PLACES_MAX),
  /** The version that was loaded; 0 only when `get` returned the missing-row defaults. */
  expectedVersion: z.number().int().min(0),
}).strict();

export type SaveDecimalSetupInput = z.output<typeof saveDecimalSetupBodySchema>;

/** Contract output (api-contract.md). */
export type DecimalSetup = {
  weightPlaces: number;
  pricePlaces: number;
  /** ≥ 1; 0 = the row is missing and the defaults were returned. */
  version: number;
  updatedAt: string;
  /** User id; null = seeded by the migration. */
  updatedBy: string | null;
};
