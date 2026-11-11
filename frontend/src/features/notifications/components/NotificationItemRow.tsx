"use client";

import { ChevronRight } from "lucide-react";
import { bodyText, timeLabel, titleParts, typeLabel, type NotificationItem } from "../model";

/** The owner's bell glyph (2026-11-11 SVG, `#637381`), centred in the 40 px item avatar. */
export function NotificationBellGlyph({ className }: { className?: string }) {
  return (
    <svg aria-hidden width="24" height="24" viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M11.9996 6.85715C11.644 6.85715 11.3568 7.14442 11.3568 7.5V7.88572C9.89024 8.18304 8.78533 9.48081 8.78533 11.0357V11.4134C8.78533 12.3576 8.43779 13.2696 7.811 13.9768L7.66234 14.1435C7.49359 14.3324 7.45341 14.6036 7.55587 14.8346C7.65832 15.0656 7.88935 15.2143 8.14247 15.2143H15.8568C16.1099 15.2143 16.3389 15.0656 16.4434 14.8346C16.5478 14.6036 16.5056 14.3324 16.3369 14.1435L16.1882 13.9768C15.5614 13.2696 15.2139 12.3596 15.2139 11.4134V11.0357C15.2139 9.48081 14.109 8.18304 12.6425 7.88572V7.5C12.6425 7.14442 12.3552 6.85715 11.9996 6.85715ZM12.9097 16.7672C13.1507 16.5261 13.2853 16.1987 13.2853 15.8571H11.9996H10.7139C10.7139 16.1987 10.8485 16.5261 11.0896 16.7672C11.3306 17.0083 11.6581 17.1429 11.9996 17.1429C12.3411 17.1429 12.6686 17.0083 12.9097 16.7672Z"
        fill="#637381"
      />
    </svg>
  );
}

const avatar = "flex size-10 shrink-0 items-center justify-center rounded-full bg-[#F4F6F8]";

/**
 * Source 03 item: read = white (hover #FBFBFB), unread = #E2F0F0 (hover #A3C9CC) with a red dot. The row opens the
 * document; the chevron (shown on hover / focus) opens its list page, with the tooltip "Open list page" (source 07).
 */
export function NotificationItemRow({
  item,
  unread,
  now,
  onOpen,
  onOpenList,
}: Readonly<{
  item: NotificationItem;
  unread: boolean;
  now: Date;
  onOpen: (item: NotificationItem) => void;
  onOpenList: ((item: NotificationItem) => void) | null;
}>) {
  const { docNo, action } = titleParts(item);
  const label = typeLabel(item.documentType);
  const body = bodyText(item);
  const createdAt = new Date(item.createdAt);
  return (
    <li
      data-unread={unread || undefined}
      className={`group/item relative border-b border-[#EDEDED] transition-colors ${
        unread ? "bg-[#E2F0F0] hover:bg-[#A3C9CC] focus-within:bg-[#A3C9CC]" : "bg-gms-surface hover:bg-[#FBFBFB] focus-within:bg-[#FBFBFB]"
      }`}
    >
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="flex w-full items-start gap-3 py-4 pl-4 pr-14 text-left outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gms-primary"
      >
        <span className={avatar}>
          <NotificationBellGlyph />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-gms-body font-medium text-gms-text">
            {unread && <span className="sr-only">Unread: </span>}
            <span className="font-semibold">{docNo}</span> {action}
          </span>
          <span className="line-clamp-2 text-gms-body text-gms-text-muted">
            <span className="mr-1.5 inline-block rounded-[4px] bg-[#EEF0F2] px-1.5 align-[1px] text-[11px] leading-4 text-gms-text-muted">{label}</span>
            {body}
          </span>
          <time dateTime={item.createdAt} className="mt-1 text-gms-label text-[#A9A9A9]">
            {timeLabel(createdAt, now)}
          </time>
        </span>
      </button>
      {unread && <span aria-hidden data-unread-dot className="absolute right-5 top-5 size-2 rounded-full bg-gms-danger" />}
      {onOpenList && (
        <button
          type="button"
          onClick={() => onOpenList(item)}
          aria-label={`Open list page for ${label}`}
          className={`group/chevron absolute right-4 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-gms-md text-gms-text opacity-0 outline-none transition-opacity group-hover/item:opacity-100 group-focus-within/item:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-gms-primary ${
            unread ? "bg-[#E2F0F0]" : "bg-[#F4F6F8]"
          }`}
        >
          <ChevronRight aria-hidden size={18} strokeWidth={1.75} />
          <span
            role="tooltip"
            className="pointer-events-none absolute bottom-full right-0 mb-2 rounded-gms-sm bg-black px-2 py-1 text-gms-label whitespace-nowrap text-white opacity-0 transition-opacity group-hover/chevron:opacity-100 group-focus-visible/chevron:opacity-100"
          >
            Open list page
          </span>
        </button>
      )}
    </li>
  );
}

/** Source 02/03 loading item: avatar kept, skeleton bars. */
export function NotificationItemSkeleton() {
  const bar = "h-2.5 rounded-full bg-[#F4F6F8]";
  return (
    <li aria-hidden className="flex items-start gap-3 border-b border-[#EDEDED] px-4 py-4">
      <span className={avatar}>
        <NotificationBellGlyph />
      </span>
      <span className="flex flex-1 flex-col gap-2 pt-1">
        <span className={`${bar} w-2/5`} />
        <span className="flex gap-1.5">
          <span className={`${bar} w-2/5`} />
          <span className={`${bar} w-2/5`} />
        </span>
        <span className="flex gap-1.5">
          <span className={`${bar} w-3/5`} />
          <span className={`${bar} w-1/5`} />
        </span>
        <span className={`${bar} mt-1 w-2/5`} />
      </span>
    </li>
  );
}
