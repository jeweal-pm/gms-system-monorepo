import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { holdSaga } from "../trade-document/inventory-hold-saga";

/**
 * ADR-0052 D19/D22: re-drive of the inventory hold saga at start and every 60 s (single flight, ≤ 20 due ops per tick,
 * 15 s lease); finished ops older than 30 days are purged in the same tick (≤ 500 rows).
 */
export const SWEEP_INTERVAL_MS = 60_000;

@Injectable()
export class InventorySyncSweep implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("InventorySyncSweep");
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  onModuleInit() {
    const tick = () => void this.tick();
    const first = setTimeout(tick, 5_000);
    first.unref();
    this.timer = setInterval(tick, SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const driven = await holdSaga.sweep();
      if (driven > 0) this.logger.log({ event: "master.inventory_sync_swept", driven });
    } catch (error) {
      this.logger.warn({ event: "master.inventory_sync_sweep_failed", errorName: error instanceof Error ? error.name : "unknown" });
    } finally {
      this.running = false;
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
