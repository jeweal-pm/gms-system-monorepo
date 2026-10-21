"use client";

import { useState, useSyncExternalStore } from "react";

/**
 * List drawers (User and Permission, Vendor, Customer, every Stone Master page) on a "PC" screen push the page
 * content aside and start open; on a touch tablet such as an iPad in landscape they overlay the content and
 * start closed (owner 2026-10-21).
 * - 1440 px and wider: PC. No iPad is that wide in landscape (largest: 1376 px), and DevTools device
 *   emulation reports a touch pointer even for desktop sizes.
 * - 1366-1439 px: PC only with a mouse/trackpad (fine pointer); an iPad Pro in landscape is a tablet.
 * - Narrower: tablet/phone.
 */
export const PC_LAYOUT_QUERY = "(min-width: 1440px), (pointer: fine) and (min-width: 1366px)";

/**
 * The same rule as classes for the page column while its drawer is open: room for the 320 px drawer plus the
 * 40 px gutter, so the drawer pushes the content on a PC. Important (!) so it beats a column's own responsive
 * padding such as sm:pr-10, which Tailwind may emit after an arbitrary min-[…] breakpoint.
 */
export const DRAWER_PUSH_CLASS = "pointer-fine:min-[1366px]:pr-[360px]! min-[1440px]:pr-[360px]!";

const subscribeNever = () => () => {};

/** True on a PC screen (see PC_LAYOUT_QUERY). Read once on the client; the server snapshot is true. */
export function usePcLayout(): boolean {
  return useSyncExternalStore(subscribeNever, () => window.matchMedia(PC_LAYOUT_QUERY).matches, () => true);
}

/**
 * Open state of a page's list drawer, the same on every drawer page (owner 2026-10-21): open by default on a
 * PC, closed on a tablet; the user's toggle wins for the rest of the visit. Nothing is remembered between
 * visits, so each visit starts from the device default.
 */
export function useDrawerState(): { open: boolean; setOpen: (open: boolean) => void } {
  const pc = usePcLayout();
  const [choice, setChoice] = useState<boolean | null>(null);
  return { open: choice ?? pc, setOpen: setChoice };
}
