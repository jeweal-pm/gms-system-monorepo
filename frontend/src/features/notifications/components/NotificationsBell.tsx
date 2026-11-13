"use client";

import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useNotificationActions, useNotificationList, useNotificationStream, useUnreadCount } from "../api";
import { ANNOUNCE_EVERY_MS, bellLabel, countBadge, groupByDay, listHref, openHref, type NotificationItem, type NotificationScope } from "../model";
import { NotificationItemRow, NotificationItemSkeleton } from "./NotificationItemRow";

const bellButton =
  "relative flex size-8 shrink-0 items-center justify-center rounded-gms-md text-gms-text transition-colors hover:bg-gms-nav-active focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gms-primary aria-expanded:bg-gms-nav-active";

/**
 * FE-NT-001…003 (notifications UI rev 1): the top-bar bell with an unread dot (Q-NT-01) and its 440 × 650 panel.
 * Mounted only inside the signed-in shell, so the stream lives exactly as long as the session's shell.
 */
export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const lastAnnounce = useRef(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const count = useUnreadCount().data?.count;

  useNotificationStream(() => {
    const now = Date.now();
    if (now - lastAnnounce.current < ANNOUNCE_EVERY_MS) return;
    lastAnnounce.current = now;
    setAnnouncement("1 new notification");
  });

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={bellLabel(count)}
        title="Notifications"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className={bellButton}
      >
        <Bell aria-hidden size={20} strokeWidth={1.5} />
        {count !== undefined && count > 0 && <span aria-hidden data-unread-dot className="absolute right-1 top-[5px] size-[7px] rounded-full bg-gms-danger" />}
      </button>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {open && <NotificationsPanel id={panelId} unread={count ?? 0} onClose={close} />}
    </div>
  );
}

export function NotificationsPanel({ id, unread, onClose }: Readonly<{ id: string; unread: number; onClose: (returnFocus: boolean) => void }>) {
  const router = useRouter();
  const [scope, setScope] = useState<NotificationScope>("for-me");
  const { markRead, markAllRead } = useNotificationActions();
  const titleId = `${id}-title`;

  function openItem(item: NotificationItem) {
    if (scope === "for-me" && item.readAt === null) markRead.mutate({ ids: [item.id] });
    const href = openHref(item);
    onClose(false);
    if (href) router.push(href);
  }

  function openList(item: NotificationItem) {
    const href = listHref(item);
    onClose(false);
    if (href) router.push(href);
  }

  return (
    <div
      id={id}
      role="dialog"
      aria-labelledby={titleId}
      className="absolute right-0 top-10 z-50 flex h-[650px] max-h-[calc(100vh-56px)] w-[440px] flex-col overflow-hidden rounded-gms-md border border-[#E3E6EA] bg-gms-surface shadow-gms-overlay max-[471px]:fixed max-[471px]:inset-x-4 max-[471px]:top-14 max-[471px]:w-auto"
    >
      <div className="flex h-14 shrink-0 items-center justify-between bg-[#FBFBFB] px-4">
        <h2 id={titleId} className="text-gms-heading font-medium text-gms-text">
          Notifications
        </h2>
        <button
          type="button"
          disabled={unread === 0 || markAllRead.isPending}
          onClick={() => markAllRead.mutate()}
          className="rounded-gms-sm text-gms-label font-medium text-gms-text-muted outline-none hover:text-gms-text focus-visible:outline-2 focus-visible:outline-gms-primary disabled:cursor-default disabled:opacity-50 disabled:hover:text-gms-text-muted"
        >
          Mark all as read
        </button>
      </div>
      <NotificationTabs scope={scope} unread={unread} onChange={setScope} panelId={`${id}-list`} />
      <NotificationList key={scope} id={`${id}-list`} scope={scope} onOpen={openItem} onOpenList={openList} />
    </div>
  );
}

const TABS: { scope: NotificationScope; label: string }[] = [
  { scope: "for-me", label: "For me" },
  // Owner design 2026-11-12: the second tab is "Overview" (scope "all": every event of the types the user may VIEW).
  { scope: "all", label: "Overview" },
];

/**
 * Sources 05/06: default #637381, hover #1C252E, focus 1 px outline, active #1C252E + 3 px #006A70 underline under
 * the whole tab (label and badge). The underline is its own bar: a bottom border on a rounded tab tapered to a stub.
 */
function NotificationTabs({ scope, unread, onChange, panelId }: Readonly<{ scope: NotificationScope; unread: number; onChange: (scope: NotificationScope) => void; panelId: string }>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const badge = countBadge(unread);

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length;
    onChange(TABS[next].scope);
    refs.current[next]?.focus();
  }

  return (
    <div role="tablist" aria-label="Notification lists" className="flex shrink-0 gap-6 border-b border-[#E3E6EA] bg-[#FBFBFB] px-4">
      {TABS.map((tab, index) => {
        const selected = tab.scope === scope;
        return (
          <button
            key={tab.scope}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.scope)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`relative -mb-px flex h-12 items-center gap-1.5 text-base font-medium outline-none focus-visible:rounded-gms-sm focus-visible:outline-1 focus-visible:outline-[#E3E6EA] ${
              selected ? "text-gms-text" : "text-gms-text-muted hover:text-gms-text"
            }`}
          >
            {selected && <span aria-hidden data-tab-underline className="absolute inset-x-0 bottom-0 h-[3px] bg-[#006A70]" />}
            {tab.label}
            {tab.scope === "for-me" && badge && (
              <span data-count-badge className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-gms-danger px-1 text-[11px] leading-none font-medium text-white">
                <span className="sr-only">, </span>
                {badge}
                <span className="sr-only"> unread</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function NotificationList({
  id,
  scope,
  onOpen,
  onOpenList,
}: Readonly<{ id: string; scope: NotificationScope; onOpen: (item: NotificationItem) => void; onOpenList: (item: NotificationItem) => void }>) {
  const list = useNotificationList(scope, true);
  const endRef = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;

  useEffect(() => {
    const end = endRef.current;
    if (!end || !hasNextPage || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
    });
    observer.observe(end);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const now = new Date();
  let content: React.ReactNode;
  if (list.isPending) {
    content = (
      <ul aria-busy="true" aria-label="Loading notifications">
        {Array.from({ length: 5 }, (_, index) => <NotificationItemSkeleton key={index} />)}
      </ul>
    );
  } else if (list.isError && list.items.length === 0) {
    content = (
      <div role="alert" className="flex flex-col items-center gap-3 px-6 py-16 text-center text-gms-body text-gms-text-muted">
        <p>Couldn&apos;t load notifications.</p>
        <button type="button" onClick={() => void list.refetch()} className="rounded-gms-md border border-gms-border px-3 py-1.5 font-medium text-gms-text hover:bg-gms-nav-active focus-visible:outline-2 focus-visible:outline-gms-primary">
          Try again
        </button>
      </div>
    );
  } else if (list.items.length === 0) {
    content = <EmptyState />;
  } else {
    content = (
      <>
        {groupByDay(list.items, now).map((group) => (
          <section key={group.label} aria-label={group.label}>
            <h3 className="px-4 pb-3 pt-4 text-base text-gms-text-muted">{group.label}</h3>
            <ul>
              {group.items.map((item) => (
                <NotificationItemRow
                  key={item.id}
                  item={item}
                  unread={scope === "for-me" && item.readAt === null}
                  now={now}
                  onOpen={onOpen}
                  onOpenList={listHref(item) ? onOpenList : null}
                />
              ))}
            </ul>
          </section>
        ))}
        {list.hasNextPage && (
          <div ref={endRef} className="px-4 py-3 text-center text-gms-label text-gms-text-muted">
            {list.isFetchingNextPage ? "Loading more…" : list.isFetchNextPageError ? (
              <button type="button" onClick={() => void list.fetchNextPage()} className="underline">Try again</button>
            ) : null}
          </div>
        )}
      </>
    );
  }

  return (
    <div id={id} role="tabpanel" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {content}
    </div>
  );
}

/** Source 02 empty state: stacked placeholder rows and the hint text. */
function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6 py-10 text-center">
      <div aria-hidden className="flex w-[214px] flex-col gap-2 opacity-70">
        {[0, 1, 2, 3, 4].map((row) => (
          <div key={row} className="flex items-center gap-2 rounded-gms-sm border border-[#F1F2F4] bg-[#FCFCFC] px-3 py-2.5" style={{ opacity: 1 - row * 0.18 }}>
            <span className="size-6 rounded-full bg-[#F1F2F4]" />
            <span className="flex flex-1 flex-col gap-1">
              <span className="h-1 w-2/5 rounded-full bg-[#F1F2F4]" />
              <span className="h-1 w-4/5 rounded-full bg-[#F1F2F4]" />
            </span>
          </div>
        ))}
      </div>
      <p className="text-gms-body text-gms-text-muted">Alerts about your organization and account will show here</p>
    </div>
  );
}
