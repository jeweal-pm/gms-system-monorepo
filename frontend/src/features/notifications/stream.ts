/**
 * FE-NT-003 (ADR-0049 D6) with the INV-20261111-001 fix: the browser never renders from an event; a `notification`
 * only tells the tabs to refetch.
 *
 * - One stream per browser: the tab holding the `gms-notification-stream` Web Lock opens the EventSource and relays
 *   `ready` / `notification` to the other tabs over a BroadcastChannel. Closing that tab releases the lock and the next
 *   tab takes over. (Without Web Locks every tab streams on its own, as before.)
 * - On `reauth` or an error the session is renewed (shared across tabs, see `coordinatedRenew`) and the stream is
 *   reopened after a delay — never immediately: `reauth` waits a small random delay, an error backs off 5 s, 10 s, 15 s.
 * - A stream counts as healthy only after it stayed open HEALTHY_MS; a `reauth` sooner than that is a failure. After
 *   MAX_FAILURES failures in a row the stream stops (the lock is kept, so no other tab retries) and the bell relies on
 *   focus refetch until the next page load.
 * - Sign-out stops every stream (`stopNotificationStreams`).
 */
import { claimLease, readLease, releaseLease, sleep, writeLease, type LeaseStorage } from "@/lib/tab-lease";

export const NOTIFICATION_STREAM_URL = "/api/master/notifications/stream";
/** Lease fallback: long enough to survive background-tab timer throttling (about one tick a minute). */
export const LEADER_KEY = "gms.notifications.leader";
export const LEADER_TTL_MS = 90_000;
export const LEADER_TICK_MS = 10_000;
export const STREAM_LOCK = "gms-notification-stream";
export const STREAM_CHANNEL = "gms-notifications";
export const MAX_FAILURES = 3;
export const RECONNECT_BASE_MS = 5_000;
export const REAUTH_JITTER_MS = 3_000;
export const HEALTHY_MS = 30_000;

type EventSourceLike = Pick<EventSource, "addEventListener" | "close"> & { onerror: ((event: Event) => void) | null };
type ChannelLike = Pick<BroadcastChannel, "postMessage" | "close" | "onmessage">;
type LockManagerLike = { request(name: string, options: { signal: AbortSignal }, callback: () => Promise<void>): Promise<unknown> };

export type StreamDeps = {
  createEventSource: (url: string) => EventSourceLike;
  renew: () => Promise<boolean>;
  /** A committed notification for this user exists. */
  onNotification: () => void;
  /** The stream is (re)connected: catch up on anything missed meanwhile. */
  onReady: () => void;
  /** Web Locks; null / absent = this tab streams on its own. */
  locks?: LockManagerLike | null;
  /** Without Web Locks: the localStorage lease that picks the streaming tab; null / absent = this tab streams. */
  lease?: { storage: LeaseStorage; owner: string } | null;
  sleep?: (ms: number) => Promise<void>;
  /** Relay to the other tabs; null / absent = no relay. */
  openChannel?: () => ChannelLike | null;
  setTimer?: (run: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
  now?: () => number;
  random?: () => number;
};

type RelayMessage = "ready" | "notification";

const active = new Set<() => void>();

/** The EventSource side, run by the tab that streams. Returns its stop function. */
function runStream(deps: StreamDeps, relay: (message: RelayMessage) => void): () => void {
  const setTimer = deps.setTimer ?? ((run, ms) => setTimeout(run, ms));
  const clearTimer = deps.clearTimer ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
  const now = deps.now ?? Date.now;
  const random = deps.random ?? Math.random;
  let source: EventSourceLike | null = null;
  let timer: unknown = null;
  let failures = 0;
  let readyAt: number | null = null;
  let stopped = false;

  const closeSource = () => {
    if (!source) return;
    source.onerror = null;
    source.close();
    source = null;
  };

  /** A stream that stayed up long enough clears the failure count; then this ending counts as one more or not. */
  const settle = (failed: boolean) => {
    if (readyAt !== null && now() - readyAt >= HEALTHY_MS) failures = 0;
    readyAt = null;
    if (failed) failures += 1;
  };

  const reopen = (delay: number) => {
    closeSource();
    if (failures > MAX_FAILURES) {
      stop();
      return;
    }
    void deps.renew().catch(() => false).then(() => {
      if (stopped) return;
      timer = setTimer(() => { timer = null; open(); }, delay);
    });
  };

  function open() {
    if (stopped) return;
    const next = deps.createEventSource(NOTIFICATION_STREAM_URL);
    source = next;
    next.addEventListener("ready", () => {
      readyAt = now();
      deps.onReady();
      relay("ready");
    });
    next.addEventListener("notification", () => {
      deps.onNotification();
      relay("notification");
    });
    next.addEventListener("reauth", () => {
      // Expected about every 14 minutes; one that comes right after opening means renewal is not working.
      const early = readyAt === null || now() - readyAt < HEALTHY_MS;
      settle(early);
      reopen(early ? RECONNECT_BASE_MS * failures : Math.floor(random() * REAUTH_JITTER_MS));
    });
    next.onerror = () => {
      // Handled here instead of the browser's own retry, so a refused (401/503) stream is not retried forever.
      settle(true);
      reopen(RECONNECT_BASE_MS * failures);
    };
  }

  function stop() {
    stopped = true;
    if (timer !== null) clearTimer(timer);
    timer = null;
    closeSource();
  }

  open();
  return stop;
}

export function startNotificationStream(deps: StreamDeps): () => void {
  let stopped = false;
  let stopStream: (() => void) | null = null;
  let releaseLock: (() => void) | null = null;
  const channel = deps.openChannel?.() ?? null;
  const relay = (message: RelayMessage) => channel?.postMessage(message);
  if (channel) {
    channel.onmessage = (event) => {
      if (event.data === "notification") deps.onNotification();
      else if (event.data === "ready") deps.onReady();
    };
  }

  const abort = new AbortController();
  const lease = deps.locks ? null : deps.lease ?? null;
  let tickTimer: unknown = null;
  if (lease) {
    // No Web Locks (plain-http LAN address): the tab holding the localStorage lease streams; the others check every
    // LEADER_TICK_MS whether it lapsed (its tab closed) and take over.
    const setTimer = deps.setTimer ?? ((run, ms) => setTimeout(run, ms));
    const now = deps.now ?? Date.now;
    const wait = deps.sleep ?? sleep;
    const tick = async () => {
      tickTimer = null;
      if (stopped) return;
      const current = readLease(lease.storage, LEADER_KEY);
      if (stopStream) {
        if (current && current.owner !== lease.owner && current.until > now()) {
          // Another tab took over (this one was asleep past the lease): it streams now.
          stopStream();
          stopStream = null;
        } else {
          writeLease(lease.storage, LEADER_KEY, lease.owner, now() + LEADER_TTL_MS);
        }
      } else if (await claimLease(lease.storage, LEADER_KEY, lease.owner, LEADER_TTL_MS, now, wait)) {
        // Stopped while claiming (e.g. an effect cleanup): hand the lease straight back.
        if (stopped) releaseLease(lease.storage, LEADER_KEY, lease.owner);
        else stopStream = runStream(deps, relay);
      }
      if (!stopped) tickTimer = setTimer(() => void tick(), LEADER_TICK_MS);
    };
    void tick();
  } else if (deps.locks) {
    // Waits (without polling) until no other tab of this browser holds the stream.
    void deps.locks
      .request(STREAM_LOCK, { signal: abort.signal }, () => new Promise<void>((release) => {
        if (stopped) {
          release();
          return;
        }
        releaseLock = release;
        stopStream = runStream(deps, relay);
      }))
      .catch(() => undefined);
  } else {
    stopStream = runStream(deps, relay);
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    abort.abort();
    if (tickTimer !== null) (deps.clearTimer ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>)))(tickTimer);
    // Only removes the lease when this instance owns it (also a claim still settling).
    if (lease) releaseLease(lease.storage, LEADER_KEY, lease.owner);
    stopStream?.();
    releaseLock?.();
    if (channel) {
      channel.onmessage = null;
      channel.close();
    }
    active.delete(stop);
  }

  active.add(stop);
  return stop;
}

/** Sign-out: close every open stream before the session ends. */
export function stopNotificationStreams() {
  for (const stop of [...active]) stop();
}
