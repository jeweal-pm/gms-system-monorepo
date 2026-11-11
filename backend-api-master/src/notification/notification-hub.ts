import type { NotificationSignal } from "./notification-types";

/**
 * ADR-0049 D6/D7: in-process fan-out to the open SSE streams (api-master runs one process). Holds no DB connection.
 * ≤ 3 streams per user (a 4th closes the oldest) and ≤ 200 per process (the gate answers 503 before opening one).
 */
export const STREAMS_PER_USER = 3;
export const STREAMS_MAX = 200;

export type StreamPush = { id: string; type: NotificationSignal["type"]; documentType: NotificationSignal["documentType"] };
export type StreamSubscriber = { userId: string; push(event: StreamPush): void; close(): void };

export class NotificationHub {
  private readonly byUser = new Map<string, StreamSubscriber[]>();
  private total = 0;

  constructor(private readonly perUser = STREAMS_PER_USER, private readonly max = STREAMS_MAX) {}

  get size() {
    return this.total;
  }

  isFull() {
    return this.total >= this.max;
  }

  /** Registers a stream; returns its unregister function, or null when the process is at its cap. */
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
      if (at < 0) return; // already closed as the oldest
      current.splice(at, 1);
      this.total -= 1;
      if (current.length === 0) this.byUser.delete(subscriber.userId);
      else this.byUser.set(subscriber.userId, current);
    };
  }

  /** After commit: tells each recipient's open streams that a notification exists (ids only). */
  publish(signal: NotificationSignal) {
    const event: StreamPush = { id: signal.eventId, type: signal.type, documentType: signal.documentType };
    for (const userId of new Set(signal.recipients)) {
      for (const subscriber of this.byUser.get(userId) ?? []) {
        try {
          subscriber.push(event);
        } catch {
          // A broken stream is closed by its own cleanup; the user refetches on reconnect.
        }
      }
    }
  }
}

export const notificationHub = new NotificationHub();

/** Call only after the transaction that wrote the notifications has committed. */
export function emitNotificationSignals(signals: readonly (NotificationSignal | null | undefined)[]) {
  for (const signal of signals) if (signal && signal.recipients.length > 0) notificationHub.publish(signal);
}
