"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { GmsMark } from "./gms-mark";
import { activeDisclosureIds, isNavItemActive, sidebarSections, sidebarToggleIcon, visibleSections, type NavLink } from "./navigation";
import { SIDEBAR_ICON_SIZE, SidebarDisclosure, sidebarFocusRing, sidebarRow } from "./sidebar-disclosure";
import { RailActionButton, type SidebarFocusRequest, type TakeSidebarFocusRequest } from "./sidebar-rail";
import { useMenuAccess } from "./use-menu-access";

function SidebarLink({ item, pathname, onNavigate }: Readonly<{ item: NavLink; pathname: string; onNavigate?: () => void }>) {
  const active = isNavItemActive(item, pathname);
  const Icon = item.icon;
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined} onNavigate={onNavigate} className={`${sidebarRow} ${active ? "bg-gms-nav-active font-semibold" : ""}`}>
      {Icon && <Icon aria-hidden size={SIDEBAR_ICON_SIZE} strokeWidth={1.5} className="shrink-0" />}
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

/**
 * Disclosure parents opened in this browser tab. In-memory only (not persisted, ui-spec); it lets
 * opening stay additive across client navigations, which remount the shell. It is mutated only in a
 * client effect, so it is empty on the server and at hydration and the first render stays deterministic.
 */
const rememberedOpenIds = new Set<string>();

type CollapseControl = { controlsId: string; onCollapse: () => void; takeFocusRequest: TakeSidebarFocusRequest };

/**
 * Expanded sidebar (C-01 / N-03; S3, S2): 236 px, #FCFCFC, 1 px #EDEDED right border, padding 16/14,
 * sections with grey group labels, disclosure parents, and, at ≥ md only, the ⇆ "Collapse sidebar"
 * toggle pinned at the bottom (Q-NAV-07). The mobile drawer renders it without `collapse`.
 */
export function Sidebar({
  pathname,
  onNavigate,
  collapse,
  className = "",
}: Readonly<{ pathname: string; onNavigate?: () => void; collapse?: CollapseControl; className?: string }>) {
  const idPrefix = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Menus without VIEW are not shown at all (owner 2026-10-17).
  const sections = visibleSections(sidebarSections, useMenuAccess());
  const [openIds, setOpenIds] = useState(() => new Set([...rememberedOpenIds, ...activeDisclosureIds(pathname)]));
  const [openedForPath, setOpenedForPath] = useState(pathname);

  // Same shell, new route (e.g. /modules/a → /modules/b): open the active child's parent, additively.
  if (openedForPath !== pathname) {
    setOpenedForPath(pathname);
    const missing = activeDisclosureIds(pathname).filter((id) => !openIds.has(id));
    if (missing.length > 0) setOpenIds(new Set([...openIds, ...missing]));
  }

  useEffect(() => {
    rememberedOpenIds.clear();
    for (const id of openIds) rememberedOpenIds.add(id);
  }, [openIds]);

  // On mount and navigation: keep the active item visible (e.g. Barcode Printing or a Report child).
  // Right after a layout switch, the switch's focus request wins instead: focus the collapse toggle, or
  // scroll a section's label into view and focus its first item (Q-NAV-02). The request is taken once
  // and remembered for this pathname, so a repeated effect run cannot undo the section scroll.
  const takeFocusRequest = collapse?.takeFocusRequest;
  const focusRequestRef = useRef<{ pathname: string; request: SidebarFocusRequest | null } | null>(null);
  useEffect(() => {
    focusRequestRef.current ??= { pathname, request: takeFocusRequest?.() ?? null };
    const request = focusRequestRef.current.pathname === pathname ? focusRequestRef.current.request : null;
    if (request?.target === "section") {
      const section = listRef.current?.querySelector<HTMLElement>(`[data-nav-section="${request.sectionId}"]`);
      section?.scrollIntoView({ block: "start" });
      section?.querySelector<HTMLElement>("a[href], button")?.focus({ preventScroll: true });
      return;
    }
    listRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
    if (request?.target === "toggle") rootRef.current?.querySelector<HTMLElement>("[data-sidebar-toggle]")?.focus();
  }, [pathname, takeFocusRequest]);

  function toggle(id: string) {
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div ref={rootRef} className={`flex h-full w-gms-sidebar shrink-0 flex-col gap-[15px] border-r border-gms-border bg-gms-surface-muted px-[14px] py-4 ${className}`}>
      <Link href="/" onNavigate={onNavigate} aria-label="GMS home" className={`flex h-[52px] shrink-0 items-start self-start rounded-gms-sm pt-0.5 ${sidebarFocusRing}`}>
        <GmsMark />
      </Link>
      <nav aria-label="Main menu" className="flex min-h-0 flex-1 flex-col">
        <div ref={listRef} className="scrollbar-none flex min-h-0 flex-1 flex-col gap-[15px] overflow-y-auto">
          {sections.map((section) => {
            const headingId = section.title ? `${idPrefix}-section-${section.id}` : undefined;
            return (
              <div key={section.id} data-nav-section={section.id}>
                {section.title && (
                  <h2 id={headingId} className="mb-1 text-gms-label font-normal text-gms-text-subtle">
                    {section.title}
                  </h2>
                )}
                <ul aria-labelledby={headingId} className="flex flex-col gap-1">
                  {section.items.map((item) => (
                    <li key={item.id}>
                      {item.kind === "link" ? (
                        <SidebarLink item={item} pathname={pathname} onNavigate={onNavigate} />
                      ) : (
                        <SidebarDisclosure
                          item={item}
                          listId={`${idPrefix}-sub-${item.id}`}
                          open={openIds.has(item.id)}
                          onToggle={() => toggle(item.id)}
                          pathname={pathname}
                          onNavigate={onNavigate}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </nav>
      {collapse && (
        <div className="shrink-0">
          <RailActionButton label="Collapse sidebar" icon={sidebarToggleIcon} ariaControls={collapse.controlsId} isSidebarToggle onClick={collapse.onCollapse} />
        </div>
      )}
    </div>
  );
}
