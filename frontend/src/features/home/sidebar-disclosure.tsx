"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { isNavItemActive, type NavDisclosure, type NavLink } from "./navigation";

export const sidebarFocusRing = "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gms-primary";
/** Shared row look of `SidebarLink` and the disclosure parent: 36 px, padding 10, gap 8, 15 px label. */
export const sidebarRow = `flex h-9 w-full items-center gap-2 rounded-gms-md px-2.5 text-left text-[15px] leading-5 text-gms-text transition-colors hover:bg-gms-nav-active ${sidebarFocusRing}`;

/** Sub-item (N-04): no icon, label aligned with the parent label (36 px inset), 14 px secondary text. */
function SidebarSubLink({ item, pathname, onNavigate }: Readonly<{ item: NavLink; pathname: string; onNavigate?: () => void }>) {
  const active = isNavItemActive(item, pathname);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      onNavigate={onNavigate}
      className={`flex h-8 items-center rounded-gms-md pr-2.5 pl-9 text-sm leading-5 transition-colors hover:bg-gms-nav-active ${sidebarFocusRing} ${
        active ? "bg-gms-nav-active font-semibold text-gms-text" : "text-gms-text-secondary"
      }`}
    >
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

/**
 * Disclosure parent (D-05, APG disclosure navigation): a button with `aria-expanded`/`aria-controls`
 * and a › / ⌄ chevron; children are `hidden` while closed, so Tab skips them. No active style on
 * the parent (Q-NAV-03); the active child carries `aria-current="page"`.
 */
export function SidebarDisclosure({
  item,
  listId,
  open,
  onToggle,
  pathname,
  onNavigate,
}: Readonly<{ item: NavDisclosure; listId: string; open: boolean; onToggle: () => void; pathname: string; onNavigate?: () => void }>) {
  const Icon = item.icon;
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <>
      {/* The chevron sits 3 px from the right edge (S3: ≈10 px) and the label may run up to it, so the
          longest labels ("Account Outstanding" ≈150 px on Windows rendering) are not truncated. */}
      <button type="button" aria-expanded={open} aria-controls={listId} onClick={onToggle} className={`${sidebarRow} relative pr-[21px]`}>
        <Icon aria-hidden size={18} strokeWidth={1.5} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        <Chevron aria-hidden size={20} strokeWidth={1.5} className="absolute top-1/2 right-[3px] -translate-y-1/2" />
      </button>
      <ul id={listId} hidden={!open} className="mt-px flex flex-col">
        {item.children.map((child) => (
          <li key={child.id}>
            <SidebarSubLink item={child} pathname={pathname} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>
    </>
  );
}
