"use client";

import Link from "next/link";
import { GmsMark } from "./gms-mark";
import { isNavItemActive, sidebarFooterItems, sidebarSections, type NavItem } from "./navigation";

const focusRing = "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gms-primary";

function SidebarLink({ item, pathname, onNavigate }: Readonly<{ item: NavItem; pathname: string; onNavigate?: () => void }>) {
  const active = isNavItemActive(item, pathname);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      onNavigate={onNavigate}
      className={`flex h-9 items-center gap-2 rounded-gms-md px-2.5 text-[15px] leading-5 text-gms-text transition-colors hover:bg-gms-nav-active ${focusRing} ${
        active ? "bg-gms-nav-active font-semibold" : ""
      }`}
    >
      <Icon aria-hidden size={18} strokeWidth={1.5} className="shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

/**
 * C-01 sidebar (FE-UP-017, source 06-sidebar.png): 236 px wide, #FCFCFC, 1 px #EDEDED right
 * border, padding 16/14, 15 px gap between logo, menu and the pinned Setup item.
 */
export function Sidebar({ pathname, onNavigate, className = "" }: Readonly<{ pathname: string; onNavigate?: () => void; className?: string }>) {
  return (
    <div className={`flex h-full w-gms-sidebar shrink-0 flex-col gap-[15px] border-r border-gms-border bg-gms-surface-muted px-[14px] py-4 ${className}`}>
      <Link href="/" onNavigate={onNavigate} aria-label="GMS home" className={`flex h-[52px] shrink-0 items-start self-start rounded-gms-sm pt-0.5 ${focusRing}`}>
        <GmsMark />
      </Link>
      <nav aria-label="Main menu" className="flex min-h-0 flex-1 flex-col gap-[15px]">
        <div className="scrollbar-none flex min-h-0 flex-1 flex-col gap-[15px] overflow-y-auto">
          {sidebarSections.map((section) => {
            const headingId = section.title ? `sidebar-${section.id}` : undefined;
            return (
              <div key={section.id} className={section.divider ? "-mt-2 border-t border-gms-border pt-[13px]" : undefined}>
                {section.title && (
                  <h2 id={headingId} className="mb-1 text-[13px] font-normal leading-[17px] text-gms-text-subtle">
                    {section.title}
                  </h2>
                )}
                <ul aria-labelledby={headingId} className="flex flex-col gap-1">
                  {section.items.map((item) => (
                    <li key={item.href}>
                      <SidebarLink item={item} pathname={pathname} onNavigate={onNavigate} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <ul className="flex shrink-0 flex-col gap-1">
          {sidebarFooterItems.map((item) => (
            <li key={item.href}>
              <SidebarLink item={item} pathname={pathname} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
