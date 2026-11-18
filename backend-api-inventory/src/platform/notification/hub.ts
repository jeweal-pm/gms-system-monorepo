import type { NotificationSignal } from "./store";

/**
 * In-process SSE fan-out (ADR-0049 D6/D7 as master; one inventory process): ≤ 3 streams per user (a 4th closes the
 * oldest), ≤ 200 per process. Holds no DB connection; local and non-durable — the client refetches the list.
 */
export const STREAMS_PER_USER = 3;
export const STREAMS_MAX = 200;

export type StreamPush = { id: string; type: NotificationSignal["type"]; documentType: NotificationSignal["documentType"] };
export type StreamSubscriber = { userId: string; push(event: StreamPush): void; close(): void };

export class NotificationHub {
  private readonly byUser = new Map<string, StreamSubscriber[]>();
  private total = 0;

  constructor(private readonly perUser = STREAMS_PER_USER, private readonly max = STREAMS_MAX) {}

  get size() { return this.total; }
  isFull() { return this.total >= this.max; }

  open(subscriber: StreamSubscriber): (() => void) | null {
    if (this.isFull()) return null;
    const list = this.byUser.get(subscriber.userId) ?? [];
    while (list.length >= this.perUser) {
      const oldest = list.shift();
      this.total -= 1;
      oldest?.close();
    }
    list.push(subscriber);
    this.byUser.set(subscriber.userId, list);
    this.total += 1;
    let open = true;
    return () => {
      if (!open) return;
      open = false;
      const current = this.byUser.get(subscriber.userId) ?? [];
      const at = current.indexOf(subscriber);
      if (at < 0) return;
      current.splice(at, 1);
      this.total -= 1;
      if (current.length === 0) this.byUser.delete(subscriber.userId);
    };
  }

  publish(signal: NotificationSignal) {
    const event: StreamPush = { id: signal.eventId, type: signal.type, documentType: signal.documentType };
    for (const userId of new Set(signal.recipients)) {
      for (const subscriber of this.byUser.get(userId) ?? []) {
        try { subscriber.push(event); } catch { /* the stream's own cleanup closes it */ }
      }
    }
  }

  /** Call only after the transaction that wrote the notifications committed. */
  emit(signals: readonly (NotificationSignal | null | undefined)[]) {
    for (const signal of signals) if (signal && signal.recipients.length > 0) this.publish(signal);
  }
}
