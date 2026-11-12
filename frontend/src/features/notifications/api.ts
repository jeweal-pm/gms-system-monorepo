"use client";

import { useEffect, useRef } from "react";
import { renewAccess } from "@/lib/domain-trpc-fetch";
import { newLeaseOwner } from "@/lib/tab-lease";
import { masterTrpc } from "@/lib/master-trpc";
import { retryTransient } from "@/lib/trpc-error";
import { NOTIFICATION_PAGE_SIZE, type NotificationItem, type NotificationScope } from "./model";
import { startNotificationStream, STREAM_CHANNEL } from "./stream";

/** Notifications data access (api-contract rev 1): count on the bell, lazy pages in the panel. */

export function useUnreadCount() {
  return masterTrpc.notification.unreadCount.useQuery(undefined, { staleTime: 30_000, retry: retryTransient, refetchOnWindowFocus: true });
}

export function useNotificationList(scope: NotificationScope, enabled: boolean) {
  const query = masterTrpc.notification.list.useInfiniteQuery(
    { scope, limit: NOTIFICATION_PAGE_SIZE },
    { enabled, getNextPageParam: (page) => page.nextCursor ?? undefined, staleTime: 15_000, retry: retryTransient, refetchOnWindowFocus: true },
  );
  const items: NotificationItem[] = query.data?.pages.flatMap((page) => page.items) ?? [];
  return { ...query, items };
}

export function useNotificationActions() {
  const utils = masterTrpc.useUtils();
  const refresh = () => Promise.all([utils.notification.unreadCount.invalidate(), utils.notification.list.invalidate()]);
  const markRead = masterTrpc.notification.markRead.useMutation({ onSettled: refresh });
  const markAllRead = masterTrpc.notification.markAllRead.useMutation({ onSettled: refresh });
  return { markRead, markAllRead, refresh };
}

function browserLeaseStorage() {
  try {
    return typeof window === "undefined" ? null : { storage: window.localStorage, owner: newLeaseOwner() };
  } catch {
    return null;
  }
}

/** FE-NT-003: keeps the stream open while mounted (signed-in shell) and refetches on each signal. */
export function useNotificationStream(onSignal: () => void) {
  const utils = masterTrpc.useUtils();
  const signalRef = useRef(onSignal);
  useEffect(() => {
    signalRef.current = onSignal;
  });
  useEffect(() => {
    if (typeof EventSource === "undefined") return undefined;
    const refetch = () => {
      void utils.notification.unreadCount.invalidate();
      void utils.notification.list.invalidate();
    };
    const start = () => startNotificationStream({
      createEventSource: (url) => new EventSource(url, { withCredentials: true }),
      renew: () => renewAccess(),
      // INV-20261111-001: one stream per browser, relayed to the other tabs.
      locks: typeof navigator !== "undefined" && navigator.locks ? navigator.locks : null,
      // Plain-http LAN address (no Web Locks): a localStorage lease picks the streaming tab.
      lease: browserLeaseStorage(),
      openChannel: () => (typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(STREAM_CHANNEL)),
      onReady: () => void utils.notification.unreadCount.invalidate(),
      onNotification: () => {
        refetch();
        signalRef.current();
      },
    });
    let stop = start();
    // Leaving the page runs no effect cleanup: hand the stream (and its lease) to another tab now, not when it lapses.
    const onPageHide = () => stop();
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) stop = start();
    };
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      stop();
    };
  }, [utils]);
}
