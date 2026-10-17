"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useId } from "react";
import { isNavItemActive, visibleContextGroups, type ContextNav } from "./navigation";
import { sidebarFocusRing } from "./sidebar-disclosure";
import { useMenuAccess } from "./use-menu-access";

/**
 * Context panel (app-navigation revision 2, source 06-partner-master-context.png): shown next to the
 * collapsed rail on the pages of one context (Setup › Partner master). 236 px, #FCFCFC, 1 px #EDEDED
 * right border; title, then each group as a link row (icon, label, ⌄) above its indented children.
 * The group row is a link, not a disclosure: Partner master returns to `/setup` with the Master Code
 * modal open; its children stay visible.
 */
export function SidebarContextPanel({ nav, pathname }: Readonly<{ nav: ContextNav; pathname: string }>) {
  const titleId = useId();
  const groups = visibleContextGroups(nav, useMenuAccess());
  return (
    <nav aria-labelledby={titleId} className="flex h-full w-gms-sidebar shrink-0 flex-col border-r border-gms-border bg-gms-surface-muted px-[14px] py-4">
      <h2 id={titleId} className="shrink-0 px-1.5 pt-2.5 text-gms-heading font-semibold text-gms-text">
        {nav.title}
      </h2>
      <ul className="scrollbar-none mt-[26px] flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {groups.map((group) => {
          const Icon = group.icon;
          return (
            <li key={group.id}>
              <Link
                href={group.href}
                className={`flex h-9 items-center gap-2 rounded-gms-md px-2 text-gms-body leading-5 text-gms-text transition-colors hover:bg-gms-nav-active ${sidebarFocusRing}`}
              >
                <Icon aria-hidden size={18} strokeWidth={1.5} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate">{group.label}</span>
                <ChevronDown aria-hidden size={18} strokeWidth={1.5} className="shrink-0" />
              </Link>
              <ul className="mt-1 ml-2.5 flex flex-col gap-1 border-l border-gms-border pl-2">
                {group.children.map((child) => {
                  const active = isNavItemActive(child, pathname);
                  return (
                    <li key={child.id}>
                      <Link
                        href={child.href}
                        aria-current={active ? "page" : undefined}
                        className={`flex h-8 items-center rounded-gms-md px-4 text-gms-body leading-5 transition-colors hover:bg-gms-nav-active ${sidebarFocusRing} ${
                          active ? "bg-gms-nav-active text-gms-text" : "text-gms-text-secondary"
                        }`}
                      >
                        <span className="truncate">{child.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
