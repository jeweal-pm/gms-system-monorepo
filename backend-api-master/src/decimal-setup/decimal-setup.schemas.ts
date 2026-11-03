import { z } from "zod";

/** decimal-setup SA rev 1 / ADR-0038 (SA-DEC-02): ranges follow storage scale, never wider. */
export const WEIGHT_PLACES_MAX = 3; // partner weight columns numeric(12,3)
export const PRICE_PLACES_MAX = 2; // partner money columns numeric(18,2)
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
