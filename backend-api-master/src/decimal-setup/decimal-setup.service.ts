import { Injectable, Logger } from "@nestjs/common";
import { WRITE_TX } from "../common/persistence";
import { prisma } from "../database/prisma-client";
import type { DecimalSetup as DecimalSetupRow } from "../generated/prisma/client";
import { decimalSetupChanged, mapDecimalSetupError } from "./decimal-setup.errors";
import { DECIMAL_SETUP_DEFAULTS, type DecimalSetup, type SaveDecimalSetupInput } from "./decimal-setup.schemas";

/** The single row's primary key (CHECK id = 1). */
export const DECIMAL_SETUP_ID = 1;

export function toDecimalSetup(row: DecimalSetupRow): DecimalSetup {
  return { weightPlaces: row.weightPlaces, pricePlaces: row.pricePlaces, version: row.version, updatedAt: row.updatedAt.toISOString(), updatedBy: row.updatedBy };
}

/** Answer when the seed row was removed by hand: today's display, version 0 so the first save creates the row. */
export function missingRowDefaults(): DecimalSetup {
  return { ...DECIMAL_SETUP_DEFAULTS, version: 0, updatedAt: new Date(0).toISOString(), updatedBy: null };
}

/**
 * Global Decimal Setup (decimal-setup SA rev 1, ADR-0038): weight and price places used by every page for display
 * and keyboard entry. No backend domain reads it (SA-DEC-05): server validation and totals stay at storage scale.
 */
@Injectable()
export class DecimalSetupService {
  private readonly logger = new Logger(DecimalSetupService.name);

  async get(): Promise<{ setup: DecimalSetup }> {
    try {
      const row = await prisma.decimalSetup.findUnique({ where: { id: DECIMAL_SETUP_ID } });
      if (row) return { setup: toDecimalSetup(row) };
      this.logger.warn({ event: "decimal_setup.row_missing" });
      return { setup: missingRowDefaults() };
    } catch (error) {
      throw mapDecimalSetupError(error, "get");
    }
  }

  /**
   * Optimistic save in one write transaction. `expectedVersion` 0 creates the row (a parallel create → P2002 →
   * CHANGED); otherwise the row is updated only at that version (count 0 → CHANGED). Every save bumps the version.
   */
  async save(actorId: string, input: SaveDecimalSetupInput): Promise<{ setup: DecimalSetup }> {
    try {
      const { saved, previous } = await prisma.$transaction(async (tx) => {
        const previous = await tx.decimalSetup.findUnique({ where: { id: DECIMAL_SETUP_ID }, select: { weightPlaces: true, pricePlaces: true } });
        const data = { weightPlaces: input.weightPlaces, pricePlaces: input.pricePlaces, updatedBy: actorId, updatedAt: new Date() };
        if (input.expectedVersion === 0) {
          await tx.decimalSetup.create({ data: { id: DECIMAL_SETUP_ID, ...data, version: 1 } });
        } else {
          const updated = await tx.decimalSetup.updateMany({
            where: { id: DECIMAL_SETUP_ID, version: input.expectedVersion },
            data: { ...data, version: { increment: 1 } },
          });
          if (updated.count === 0) throw decimalSetupChanged();
        }
        const saved = await tx.decimalSetup.findUniqueOrThrow({ where: { id: DECIMAL_SETUP_ID } });
        return { saved, previous };
      }, WRITE_TX);
      this.logger.log({
        event: "decimal_setup.updated",
        actorId,
        version: saved.version,
        weightPlaces: saved.weightPlaces,
        pricePlaces: saved.pricePlaces,
        previousWeightPlaces: previous?.weightPlaces ?? null,
        previousPricePlaces: previous?.pricePlaces ?? null,
      });
      return { setup: toDecimalSetup(saved) };
    } catch (error) {
      throw mapDecimalSetupError(error, "save");
    }
  }
}
