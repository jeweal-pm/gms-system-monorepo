"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";
import type { LucideIcon } from "lucide-react";
import { GmsMark } from "./gms-mark";
import { isNavItemActive, isNavSectionActive, railModules, sidebarSections, sidebarToggleIcon, type NavLink, type NavSection } from "./navigation";

/** What should receive focus right after the layout switches (keeps keyboard users in place). */
export type SidebarFocusRequest = { target: "toggle" } | { target: "section"; sectionId: string };
/** Returns the pending request once and clears it, so a later remount never reuses it. */
export type TakeSidebarFocusRequest = () => SidebarFocusRequest | null;

const railFocusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gms-primary";
const railButtonBase = `relative flex size-10 shrink-0 items-center justify-center rounded-gms-lg text-gms-text transition-colors hover:bg-gms-nav-active ${railFocusRing}`;

/* ---------- RailTooltip (N-06): hover ≈150 ms, focus immediate, Escape/blur/leave hide ---------- */

const hoverDelayMs = 150;
/** Grace period for moving the pointer from a section button across the gap into its submenu. */
const leaveDelayMs = 150;

/**
 * Tooltip in the top layer (`popover="manual"`), so the rail's scroll container never clips it.
 * Plain tooltips duplicate the control's accessible name and are therefore `aria-hidden`.
 * With `menu` (section buttons, app-navigation revision 3) the tooltip also lists the
 * section's pages as links: it stays open while the pointer or focus is inside it, Tab moves
 * from the button into it (it follows the button in DOM order), and Escape closes it.
 * Without Popover API support it is not shown. WCAG 1.4.13: dismissible, hoverable, persistent.
 */
function closeTooltip(tip: HTMLElement | null) {
  try {
    if (tip?.matches(":popover-open")) tip.hidePopover();
  } catch {
    // Popover API unsupported or the element is disconnected.
  }
}

function useRailTooltip(label: string, menu?: React.ReactNode) {
  const anchorRef = useRef<HTMLElement | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const interactive = menu !== undefined;

  // The open state is read from the element itself (:popover-open), never mirrored in a ref, so a
  // cleanup that runs while refs are detached (StrictMode remount) cannot leave a tooltip stuck open.
  const hide = useCallback(() => {
    window.clearTimeout(timerRef.current);
    closeTooltip(tipRef.current);
  }, []);

  const scheduleHide = useCallback(() => {
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => closeTooltip(tipRef.current), leaveDelayMs);
  }, []);

  const show = useCallback(() => {
    window.clearTimeout(timerRef.current);
    const tip = tipRef.current;
    const anchor = anchorRef.current;
    if (!tip || !anchor || typeof tip.showPopover !== "function") return;
    const rect = anchor.getBoundingClientRect();
    const centre = rect.top + rect.height / 2;
    tip.style.left = `${rect.right + 8}px`;
    tip.style.top = `${centre}px`;
    try {
      if (!tip.matches(":popover-open")) tip.showPopover();
    } catch {
      // Popover unsupported or the element is disconnected: no tooltip.
      return;
    }
    if (interactive) {
      // Title row level with the button, kept inside the viewport; the arrow keeps pointing at the button.
      const top = Math.max(8, Math.min(centre - 18, window.innerHeight - tip.offsetHeight - 8));
      tip.style.top = `${top}px`;
      tip.style.setProperty("--rail-arrow-top", `${centre - top}px`);
    }
  }, [interactive]);

  // Escape dismisses the tooltip; from inside a submenu, focus returns to its button first.
  useEffect(() => {
    const tip = tipRef.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (tip?.contains(document.activeElement)) anchorRef.current?.focus();
      hide();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(timerRef.current);
      closeTooltip(tip);
    };
  }, [hide]);

  const isInside = (node: EventTarget | null) => node instanceof Node && Boolean(tipRef.current?.contains(node) || anchorRef.current?.contains(node));

  const triggerProps = {
    onPointerEnter: () => {
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(show, hoverDelayMs);
    },
    onPointerLeave: interactive ? scheduleHide : hide,
    onFocus: (event: React.FocusEvent<HTMLElement>) => {
      let keyboardFocus = true;
      try {
        keyboardFocus = event.currentTarget.matches(":focus-visible");
      } catch {
        // Engines without :focus-visible: treat as keyboard focus.
      }
      if (keyboardFocus) show();
    },
    onBlur: (event: React.FocusEvent<HTMLElement>) => {
      if (!interactive || !isInside(event.relatedTarget)) hide();
    },
  };

  const tooltip = interactive ? (
    <div
      ref={tipRef}
      popover="manual"
      onPointerEnter={() => window.clearTimeout(timerRef.current)}
      onPointerLeave={scheduleHide}
      onBlur={(event) => {
        if (!isInside(event.relatedTarget)) hide();
      }}
      // A submenu link starts a navigation: close the menu.
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest("a[href]")) hide();
      }}
      className="fixed inset-auto m-0 min-w-[188px] overflow-visible rounded-gms-md border-0 bg-gms-tooltip p-1.5 text-gms-label text-gms-on-primary shadow-gms-overlay"
    >
      <span aria-hidden className="absolute top-(--rail-arrow-top) -left-[3px] size-2 -translate-y-1/2 rotate-45 bg-gms-tooltip" />
      <div className="relative">{menu}</div>
    </div>
  ) : (
    <div
      ref={tipRef}
      popover="manual"
      aria-hidden
      className="pointer-events-none fixed inset-auto m-0 -translate-y-1/2 overflow-visible rounded-md border-0 bg-gms-tooltip px-3 py-[7px] text-gms-label whitespace-nowrap text-gms-on-primary"
    >
      <span className="absolute top-1/2 -left-[3px] size-2 -translate-y-1/2 rotate-45 bg-gms-tooltip" />
      <span className="relative">{label}</span>
    </div>
  );

  return { anchorRef, hide, triggerProps, tooltip };
}

/* ---------- Section submenu (revision 3): the section's pages, disclosure children indented ---------- */

const menuLink =
  "block rounded-gms-sm px-2.5 py-1.5 whitespace-nowrap transition-colors hover:bg-gms-on-primary/15 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gms-on-primary";

function MenuLink({ item, pathname, nested = false }: Readonly<{ item: NavLink; pathname: string; nested?: boolean }>) {
  const active = isNavItemActive(item, pathname);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`${menuLink} ${nested ? "pl-5" : ""} ${active ? "bg-gms-on-primary/15 font-semibold" : "text-gms-on-primary/85"}`}
    >
      {item.label}
    </Link>
  );
}

function RailSectionMenu({ section, pathname }: Readonly<{ section: NavSection; pathname: string }>) {
  const label = section.title ?? section.id;
  return (
    <>
      <p aria-hidden className="px-2.5 pt-1 pb-1.5 font-semibold">
        {label}
      </p>
      <ul aria-label={label} className="flex flex-col gap-px">
        {section.items.map((item) =>
          item.kind === "link" ? (
            <li key={item.id}>
              <MenuLink item={item} pathname={pathname} />
            </li>
          ) : (
            <li key={item.id}>
              <p className="px-2.5 py-1.5 whitespace-nowrap text-gms-on-primary/60">{item.label}</p>
              <ul className="flex flex-col gap-px">
                {item.children.map((child) => (
                  <li key={child.id}>
                    <MenuLink item={child} pathname={pathname} nested />
                  </li>
                ))}
              </ul>
            </li>
          ),
        )}
      </ul>
    </>
  );
}

/* ---------- RailButton (N-06) ---------- */

function RailIcon({ icon: Icon }: Readonly<{ icon: LucideIcon }>) {
  return <Icon aria-hidden size={24} strokeWidth={1.5} className="shrink-0" />;
}

function RailLink({ href, label, icon, active }: Readonly<{ href: string; label: string; icon: LucideIcon; active: boolean }>) {
  const { anchorRef, hide, triggerProps, tooltip } = useRailTooltip(label);
  return (
    <>
      <Link
        ref={(node) => {
          anchorRef.current = node;
        }}
        href={href}
        aria-current={active ? "page" : undefined}
        onClick={hide}
        className={`${railButtonBase} ${active ? "bg-gms-nav-active" : "bg-gms-rail-button"}`}
        {...triggerProps}
      >
        <RailIcon icon={icon} />
        <span className="sr-only">{label}</span>
      </Link>
      {tooltip}
    </>
  );
}

type RailActionButtonProps = Readonly<{
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  active?: boolean;
  /** Extra screen-reader text after the label, e.g. "(current section)". */
  srSuffix?: string;
  ariaControls?: string;
  /** Marks the expand/collapse toggle so the layout that mounts next can focus it. */
  isSidebarToggle?: boolean;
  /** Section buttons: submenu shown in the tooltip (revision 3). */
  menu?: React.ReactNode;
}>;

/** Rail-style 40 × 40 button with tooltip; also used for the expanded sidebar's "Collapse sidebar" toggle. */
export function RailActionButton({ label, icon, onClick, active = false, srSuffix, ariaControls, isSidebarToggle = false, menu }: RailActionButtonProps) {
  const { anchorRef, hide, triggerProps, tooltip } = useRailTooltip(label, menu);
  return (
    <>
      <button
        ref={(node) => {
          anchorRef.current = node;
        }}
        type="button"
        aria-controls={ariaControls}
        data-sidebar-toggle={isSidebarToggle ? "" : undefined}
        className={`${railButtonBase} ${active ? "bg-gms-nav-active" : "bg-gms-rail-button"}`}
        {...triggerProps}
        onClick={() => {
          hide();
          onClick();
        }}
      >
        <RailIcon icon={icon} />
        <span className="sr-only">
          {label}
          {srSuffix ? ` ${srSuffix}` : ""}
        </span>
      </button>
      {tooltip}
    </>
  );
}

/* ---------- SidebarRail (N-05, S1): 55 + 1 px, logo mark, 11 modules, ⇆ Expand sidebar ---------- */

export function SidebarRail({
  pathname,
  controlsId,
  takeFocusRequest,
  onExpand,
}: Readonly<{
  pathname: string;
  /** Id of the sidebar container, referenced by the toggle's `aria-controls`. */
  controlsId: string;
  takeFocusRequest: TakeSidebarFocusRequest;
  onExpand: (request: SidebarFocusRequest) => void;
}>) {
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (takeFocusRequest()?.target === "toggle") railRef.current?.querySelector<HTMLElement>("[data-sidebar-toggle]")?.focus();
  }, [takeFocusRequest]);

  return (
    <div ref={railRef} className="flex h-full w-gms-rail shrink-0 flex-col border-r border-gms-border bg-gms-surface-muted">
      <Link href="/" className={`mx-auto mt-5 flex size-[31px] shrink-0 rounded-gms-sm ${railFocusRing}`}>
        <GmsMark variant="mark" />
      </Link>
      <nav aria-label="Main menu" className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-2 pt-[26px] pb-4">
        <ul className="flex flex-col gap-1.5">
          {railModules.map((module) => {
            if (module.kind === "link") {
              return (
                <li key={module.id}>
                  <RailLink href={module.link.href} label={module.label} icon={module.icon} active={isNavItemActive(module.link, pathname)} />
                </li>
              );
            }
            // Q-NAV-02: a group button expands the sidebar, scrolls to its section and focuses the first item.
            const active = isNavSectionActive(module.sectionId, pathname);
            const section = sidebarSections.find((entry) => entry.id === module.sectionId);
            return (
              <li key={module.id}>
                <RailActionButton
                  label={module.label}
                  icon={module.icon}
                  active={active}
                  srSuffix={active ? "(current section)" : undefined}
                  onClick={() => onExpand({ target: "section", sectionId: module.sectionId })}
                  menu={section ? <RailSectionMenu section={section} pathname={pathname} /> : undefined}
                />
              </li>
            );
          })}
          <li>
            <RailActionButton label="Expand sidebar" icon={sidebarToggleIcon} ariaControls={controlsId} isSidebarToggle onClick={() => onExpand({ target: "toggle" })} />
          </li>
        </ul>
      </nav>
    </div>
  );
}
