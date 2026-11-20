"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { inventoryNotificationApi, inventoryNotificationKeys } from "@/features/inventory/notifications";
import { INVENTORY_QUERY_KEY } from "@/features/inventory/query-keys";
import { approveMenuFor } from "@/features/approve-center/menus";
import { renewAccess } from "@/lib/domain-trpc-fetch";
import { newLeaseOwner } from "@/lib/tab-lease";
import { masterTrpc } from "@/lib/master-trpc";
import { retryTransient } from "@/lib/trpc-error";
import { combineFeeds, NOTIFICATION_PAGE_SIZE, splitIdsBySource, type FeedState, type NotificationItem, type NotificationScope } from "./model";
import { INVENTORY_STREAM, MASTER_STREAM, startNotificationStream, type NotificationHint, type StreamChannelNames } from "./stream";

/**
 * Owner 2026-11-16 ("approved, but the status stays until a reload"): a notification means a document of that type
 * changed status (sent to approve, approved, rejected, sent back), so every open page of that type refetches: the
 * document itself, its daybook and list, and the Approve menus and counts; an approval also moves stock. Pages in
 * hidden tabs refetch when shown. Unknown types still refresh the Approve menus.
 */
export function invalidateForNotification(queryClient: QueryClient, hint: NotificationHint | undefined): Promise<unknown> {
  const menu = hint ? approveMenuFor(hint.documentType) : undefined;
  const proc = menu && menu.availability !== "not-available" ? menu.proc : undefined;
  // FE-LS-015: an inventory document (Load to Stock) refreshes every inventory read; its approval also changes the PUs.
  if (proc === "loadToStock" || proc === "sale") {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: INVENTORY_QUERY_KEY }),
      // sale FE-SL-009: an approved sale moves Reserve lines and Memo Stock instead of the PUs.
      ...(hint?.type === "document.approved" ? (proc === "sale" ? [[["memoStock"]], [["reserve"]]] : [[["purchase"]]]).map((queryKey) => queryClient.invalidateQueries({ queryKey })) : []),
    ]);
  }
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: [["approval"]] }),
    ...(proc ? [queryClient.invalidateQueries({ queryKey: [[proc]] })] : []),
    ...(proc && hint?.type === "document.approved" ? [queryClient.invalidateQueries({ queryKey: [["memoStock"]] })] : []),
  ]);
}

/**
 * Notifications data access (api-contract rev 1) over two feeds (FE-LS-015, ADR-0049 D10 / ADR-0052 D12): master and
 * backend-api-inventory. The bell adds the two unread counts; the panel merges both lists newest first; a mark-read goes
 * to the service that owns the item. A feed that can't be reached leaves the other one working.
 */

const NOTIFICATION_QUERY = { retry: retryTransient, refetchOnWindowFocus: true } as const;

export function useUnreadCount() {
  const master = masterTrpc.notification.unreadCount.useQuery(undefined, { staleTime: 30_000, ...NOTIFICATION_QUERY });
  const inventory = useQuery({ queryKey: inventoryNotificationKeys.unread(), queryFn: () => inventoryNotificationApi.unreadCount(), staleTime: 30_000, ...NOTIFICATION_QUERY });
  const count = master.data || inventory.data ? (master.data?.count ?? 0) + (inventory.data?.count ?? 0) : undefined;
  return { ...master, data: count === undefined ? undefined : { count } };
}

export function useNotificationList(scope: NotificationScope, enabled: boolean) {
  const master = masterTrpc.notification.list.useInfiniteQuery(
    { scope, limit: NOTIFICATION_PAGE_SIZE },
    { enabled, getNextPageParam: (page) => page.nextCursor ?? undefined, staleTime: 15_000, ...NOTIFICATION_QUERY },
  );
  const inventory = useInfiniteQuery({
    queryKey: inventoryNotificationKeys.list(scope),
    queryFn: ({ pageParam }) => inventoryNotificationApi.list(scope, pageParam, NOTIFICATION_PAGE_SIZE),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 15_000,
    enabled,
    ...NOTIFICATION_QUERY,
  });
  const feed = (query: typeof inventory | typeof master, source: "master" | "inventory"): FeedState => ({
    items: (query.data?.pages ?? []).flatMap((page) => page.items.map((item) => ({ ...(item as NotificationItem), source }))),
    isPending: query.isPending,
    isError: query.isError,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    isFetchNextPageError: query.isFetchNextPageError,
  });
  const combined = combineFeeds(feed(master, "master"), feed(inventory, "inventory"));
  return {
    ...combined,
    fetchNextPage: () => Promise.all([master.hasNextPage ? master.fetchNextPage() : null, inventory.hasNextPage ? inventory.fetchNextPage() : null]),
    refetch: () => Promise.all([master.refetch(), inventory.refetch()]),
  };
}

export function useNotificationActions() {
  const utils = masterTrpc.useUtils();
  const queryClient = useQueryClient();
  const refresh = () => Promise.all([utils.notification.unreadCount.invalidate(), utils.notification.list.invalidate(), queryClient.invalidateQueries({ queryKey: inventoryNotificationKeys.all() })]);
  const masterRead = masterTrpc.notification.markRead.useMutation({ onSettled: refresh });
  const masterAllRead = masterTrpc.notification.markAllRead.useMutation({ onSettled: refresh });
  const inventoryRead = useMutation({ mutationFn: (ids: string[]) => inventoryNotificationApi.markRead(ids), onSettled: refresh });
  const inventoryAllRead = useMutation({ mutationFn: () => inventoryNotificationApi.markAllRead(), onSettled: refresh });
  const markRead = {
    isPending: masterRead.isPending || inventoryRead.isPending,
    /** Each id goes to its owning service (`item.source`); unknown ids are master's. */
    mutate: ({ ids }: { ids: string[] }, items: readonly Pick<NotificationItem, "id" | "source">[] = []) => {
      const split = splitIdsBySource(ids, items);
      if (split.master.length) masterRead.mutate({ ids: split.master });
      if (split.inventory.length) inventoryRead.mutate(split.inventory);
    },
  };
  const markAllRead = {
    isPending: masterAllRead.isPending || inventoryAllRead.isPending,
    mutate: () => {
      masterAllRead.mutate();
      inventoryAllRead.mutate();
    },
  };
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
  useServiceStream(MASTER_STREAM, onSignal);
  useServiceStream(INVENTORY_STREAM, onSignal);
}

/**
 * One service's stream (FE-NT-003; FE-LS-015 adds the inventory one): a `notification` refetches that service's feed
 * and the open pages of the document type; `ready` (also after a reconnect) refetches the unread count.
 */
function useServiceStream(names: StreamChannelNames, onSignal: () => void) {
  const utils = masterTrpc.useUtils();
  const queryClient = useQueryClient();
  const signalRef = useRef(onSignal);
  useEffect(() => {
    signalRef.current = onSignal;
  });
  useEffect(() => {
    if (typeof EventSource === "undefined") return undefined;
    const inventory = names === INVENTORY_STREAM;
    const refetch = () => {
      if (inventory) {
        void queryClient.invalidateQueries({ queryKey: inventoryNotificationKeys.all() });
        return;
      }
      void utils.notification.unreadCount.invalidate();
      void utils.notification.list.invalidate();
    };
    const refetchCount = () => (inventory ? void queryClient.invalidateQueries({ queryKey: inventoryNotificationKeys.unread() }) : void utils.notification.unreadCount.invalidate());
    const start = () => startNotificationStream({
      names,
      createEventSource: (url) => new EventSource(url, { withCredentials: true }),
      renew: () => renewAccess(),
      // INV-20261111-001: one stream per browser, relayed to the other tabs.
      locks: typeof navigator !== "undefined" && navigator.locks ? navigator.locks : null,
      // Plain-http LAN address (no Web Locks): a localStorage lease picks the streaming tab.
      lease: browserLeaseStorage(),
      openChannel: () => (typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(names.channelName)),
      onReady: refetchCount,
      onNotification: (hint) => {
        refetch();
        void invalidateForNotification(queryClient, hint);
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
  }, [queryClient, utils, names]);
}
