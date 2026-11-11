import { describe, expect, it, vi } from "vitest";
import {
  HEALTHY_MS,
  MAX_FAILURES,
  NOTIFICATION_STREAM_URL,
  RECONNECT_BASE_MS,
  LEADER_KEY,
  LEADER_TICK_MS,
  LEADER_TTL_MS,
  STREAM_LOCK,
  startNotificationStream,
  stopNotificationStreams,
  type StreamDeps,
} from "@/features/notifications/stream";
import { coordinatedRenew, RENEWED_AT_KEY, RENEWED_RECENTLY_MS, RENEWING_KEY, RENEW_LOCK, type RenewCoordination } from "@/lib/domain-trpc-fetch";

/** UT-NT-FE-06…14 (FE-NT-003, INV-20261111-001 fix): the EventSource lifecycle across tabs. */
class FakeSource {
  listeners = new Map<string, () => void>();
  onerror: ((event: Event) => void) | null = null;
  closed = false;
  constructor(public url: string) {}
  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, listener);
  }
  close() {
    this.closed = true;
  }
  emit(type: string) {
    this.listeners.get(type)?.();
  }
  fail() {
    this.onerror?.(new Event("error"));
  }
}

/** Exclusive Web Locks for one browser: a request runs when the lock is free, else waits in order. */
function fakeLocks() {
  const held = new Map<string, boolean>();
  const queues = new Map<string, (() => void)[]>();
  const names: string[] = [];
  return {
    names,
    request(name: string, options: { signal?: AbortSignal } | (() => Promise<unknown>), maybe?: () => Promise<unknown>) {
      const callback = (typeof options === "function" ? options : maybe) as () => Promise<unknown>;
      const signal = typeof options === "function" ? undefined : options.signal;
      names.push(name);
      return new Promise((resolve, reject) => {
        const run = () => {
          held.set(name, true);
          void callback().then((value) => {
            held.set(name, false);
            resolve(value);
            queues.get(name)?.shift()?.();
          });
        };
        if (!held.get(name)) {
          run();
          return;
        }
        const queue = queues.get(name) ?? [];
        queue.push(run);
        queues.set(name, queue);
        signal?.addEventListener("abort", () => {
          const at = queue.indexOf(run);
          if (at >= 0) queue.splice(at, 1);
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    },
  };
}

/** A BroadcastChannel bus: a message reaches every other open channel. */
function fakeBus() {
  const open = new Set<{ onmessage: ((event: { data: unknown }) => void) | null }>();
  return () => {
    const channel = {
      onmessage: null as ((event: { data: unknown }) => void) | null,
      postMessage(data: unknown) {
        for (const other of open) if (other !== channel) other.onmessage?.({ data });
      },
      close() {
        open.delete(channel);
      },
    };
    open.add(channel);
    return channel as never;
  };
}

function setup(extra: Partial<StreamDeps> = {}) {
  const sources: FakeSource[] = [];
  const timers: { run: () => void; ms: number }[] = [];
  const clock = { now: 0 };
  const deps = {
    createEventSource: vi.fn((url: string) => {
      const source = new FakeSource(url);
      sources.push(source);
      return source as never;
    }),
    renew: vi.fn(async () => true),
    onNotification: vi.fn(),
    onReady: vi.fn(),
    setTimer: (run: () => void, ms: number) => {
      timers.push({ run, ms });
      return timers.length;
    },
    clearTimer: vi.fn(),
    now: () => clock.now,
    random: () => 0.5,
    ...extra,
  };
  const flush = async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
    const due = timers.splice(0);
    for (const timer of due) timer.run();
    return due.map((timer) => timer.ms);
  };
  return { sources, deps, flush, clock, last: () => sources[sources.length - 1] };
}

describe("notification stream", () => {
  it("UT-NT-FE-06 opens one same-origin stream; ready catches up and each notification asks for a refetch", () => {
    const { sources, deps } = setup();
    const stop = startNotificationStream(deps);
    expect(sources.map((source) => source.url)).toEqual([NOTIFICATION_STREAM_URL]);
    sources[0].emit("ready");
    sources[0].emit("notification");
    sources[0].emit("notification");
    expect(deps.onReady).toHaveBeenCalledTimes(1);
    expect(deps.onNotification).toHaveBeenCalledTimes(2);
    stop();
    expect(sources[0].closed).toBe(true);
  });

  it("UT-NT-FE-07 a reauth after a healthy stream renews and reopens after a small random delay, without counting a failure", async () => {
    const { sources, deps, flush, clock, last } = setup();
    startNotificationStream(deps);
    for (let round = 0; round < MAX_FAILURES + 2; round += 1) {
      last().emit("ready");
      clock.now += 14 * 60_000;
      last().emit("reauth");
      expect(await flush()).toEqual([1_500]);
    }
    expect(deps.renew).toHaveBeenCalledTimes(MAX_FAILURES + 2);
    expect(sources).toHaveLength(MAX_FAILURES + 3);
    expect(sources.slice(0, -1).every((source) => source.closed)).toBe(true);
    stopNotificationStreams();
  });

  it("UT-NT-FE-08 a reauth right after opening (renewal not working) never reopens at once: it backs off and stops", async () => {
    const { sources, deps, flush, last } = setup({ renew: vi.fn(async () => false) });
    startNotificationStream(deps);
    const delays: number[] = [];
    for (let round = 0; round < MAX_FAILURES; round += 1) {
      last().emit("ready");
      last().emit("reauth");
      delays.push(...(await flush()));
    }
    expect(delays).toEqual([RECONNECT_BASE_MS, RECONNECT_BASE_MS * 2, RECONNECT_BASE_MS * 3]);
    const count = sources.length;
    last().emit("ready");
    last().emit("reauth");
    expect(await flush()).toEqual([]);
    expect(sources).toHaveLength(count);
    expect(last().closed).toBe(true);
  });

  it("UT-NT-FE-09 errors back off 5 s / 10 s / 15 s and stop; a short-lived ready (e.g. an evicted stream) does not reset the count, a healthy one does", async () => {
    const { sources, deps, flush, clock, last } = setup();
    startNotificationStream(deps);
    last().fail();
    expect(await flush()).toEqual([RECONNECT_BASE_MS]);
    last().emit("ready");
    clock.now += HEALTHY_MS;
    last().fail(); // healthy for 30 s: the count starts over
    expect(await flush()).toEqual([RECONNECT_BASE_MS]);
    for (let attempt = 2; attempt <= MAX_FAILURES; attempt += 1) {
      last().emit("ready");
      clock.now += 1_000;
      last().fail();
      expect(await flush()).toEqual([RECONNECT_BASE_MS * attempt]);
    }
    const count = sources.length;
    last().emit("ready");
    last().fail();
    expect(await flush()).toEqual([]);
    expect(sources).toHaveLength(count);
    expect(last().closed).toBe(true);
  });

  it("UT-NT-FE-10 sign-out stops every stream, including a pending reconnect", async () => {
    const { sources, deps } = setup();
    startNotificationStream(deps);
    sources[0].fail();
    stopNotificationStreams();
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
    expect(sources).toHaveLength(1);
    expect(sources[0].closed).toBe(true);
  });

  it("UT-NT-FE-11 one stream per browser: the lock holder streams and relays; when it closes the next tab takes over", async () => {
    const locks = fakeLocks();
    const openChannel = fakeBus();
    const tabA = setup({ locks, openChannel });
    const tabB = setup({ locks, openChannel });
    const stopA = startNotificationStream(tabA.deps);
    const stopB = startNotificationStream(tabB.deps);
    expect(locks.names).toEqual([STREAM_LOCK, STREAM_LOCK]);
    expect(tabA.sources).toHaveLength(1);
    expect(tabB.sources).toHaveLength(0);
    tabA.sources[0].emit("ready");
    tabA.sources[0].emit("notification");
    expect(tabB.deps.onReady).toHaveBeenCalledTimes(1);
    expect(tabB.deps.onNotification).toHaveBeenCalledTimes(1);
    expect(tabA.deps.onNotification).toHaveBeenCalledTimes(1);

    stopA();
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
    expect(tabA.sources[0].closed).toBe(true);
    expect(tabB.sources).toHaveLength(1);
    stopB();
    expect(tabB.sources[0].closed).toBe(true);
  });

  it("UT-NT-FE-12 tabs renew one at a time; a renewal moments ago in another tab is reused, never sent again", async () => {
    const locks = fakeLocks();
    const { storage, data } = memoryStorage();
    const clock = { now: 1_000_000 };
    const coordination: RenewCoordination = {
      locks: { request: (name, callback) => locks.request(name, callback) as never },
      storage, now: () => clock.now, sleep: fakeSleep(clock), owner: "tab-a",
    };
    const refresh = vi.fn(async () => true);
    expect(await Promise.all([coordinatedRenew(refresh, coordination), coordinatedRenew(refresh, coordination)])).toEqual([true, true]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(locks.names).toEqual([RENEW_LOCK, RENEW_LOCK]);
    expect(data.get(RENEWED_AT_KEY)).toBe(String(clock.now));
    clock.now += RENEWED_RECENTLY_MS;
    await coordinatedRenew(refresh, coordination);
    expect(refresh).toHaveBeenCalledTimes(2);

    const failing = vi.fn(async () => false);
    clock.now += RENEWED_RECENTLY_MS;
    expect(await coordinatedRenew(failing, coordination)).toBe(false);
    expect(data.get(RENEWED_AT_KEY)).toBe(String(clock.now - RENEWED_RECENTLY_MS));
    expect(await coordinatedRenew(refresh, null)).toBe(true);
  });

  it("UT-NT-FE-13 without Web Locks (plain-http LAN) a localStorage lease still lets only one tab renew", async () => {
    const { storage, data } = memoryStorage();
    const clock = { now: 2_000_000 };
    const tab = (owner: string): RenewCoordination => ({ locks: null, storage, now: () => clock.now, sleep: fakeSleep(clock), owner });
    const owners: string[] = [];
    const refresh = vi.fn(async () => {
      owners.push(JSON.parse(data.get(RENEWING_KEY) ?? "{}").owner);
      await Promise.resolve();
      return true;
    });
    const first = coordinatedRenew(refresh, tab("tab-a"));
    const second = coordinatedRenew(refresh, tab("tab-b"));
    expect(await Promise.all([first, second])).toEqual([true, true]);
    expect(owners).toEqual(["tab-a"]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(data.has(RENEWING_KEY)).toBe(false);
  });

  it("UT-NT-FE-14 without Web Locks the lease holder streams; others take over when it stops or its lease lapses", async () => {
    const { storage, data } = memoryStorage();
    const openChannel = fakeBus();
    const make = (owner: string) => {
      const tab = setup({ lease: { storage, owner }, openChannel });
      tab.deps.sleep = fakeSleep(tab.clock);
      return tab;
    };
    const tabA = make("tab-a");
    const tabB = make("tab-b");
    const stopA = startNotificationStream(tabA.deps);
    await settle();
    const stopB = startNotificationStream(tabB.deps);
    await settle();
    expect(tabA.sources).toHaveLength(1);
    expect(tabB.sources).toHaveLength(0);
    tabA.sources[0].emit("notification");
    expect(tabB.deps.onNotification).toHaveBeenCalledTimes(1);

    stopA();
    expect(data.has(LEADER_KEY)).toBe(false);
    expect(await tabB.flush()).toEqual([LEADER_TICK_MS]);
    await settle();
    expect(tabB.sources).toHaveLength(1);
    stopB();

    // A tab that vanished without releasing: its lease lapses and the next tab claims it.
    data.set(LEADER_KEY, JSON.stringify({ owner: "ghost", until: 1 }));
    const tabC = make("tab-c");
    tabC.clock.now = LEADER_TTL_MS;
    const stopC = startNotificationStream(tabC.deps);
    await settle();
    expect(tabC.sources).toHaveLength(1);
    stopC();
  });
});

describe("notification stream lease (regression)", () => {
  it("UT-NT-FE-15 an instance stopped while its claim settles (React effect re-run) hands the lease back at once", async () => {
    const { storage, data } = memoryStorage();
    const first = setup({ lease: { storage, owner: "mount-1" } });
    first.deps.sleep = fakeSleep(first.clock);
    const stopFirst = startNotificationStream(first.deps);
    expect(JSON.parse(data.get(LEADER_KEY) ?? "{}").owner).toBe("mount-1");
    stopFirst();
    await settle();
    expect(first.sources).toHaveLength(0);
    expect(data.has(LEADER_KEY)).toBe(false);

    const second = setup({ lease: { storage, owner: "mount-2" } });
    second.deps.sleep = fakeSleep(second.clock);
    const stopSecond = startNotificationStream(second.deps);
    await settle();
    expect(second.sources).toHaveLength(1);
    stopSecond();
  });
});

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    storage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
    },
  };
}

function fakeSleep(clock: { now: number }) {
  return async (ms: number) => {
    clock.now += ms;
    await Promise.resolve();
  };
}

async function settle() {
  for (let i = 0; i < 30; i += 1) await Promise.resolve();
}
