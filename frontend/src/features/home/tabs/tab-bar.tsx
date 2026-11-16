"use client";

import { ArrowLeft, ArrowRight, ChevronDown, CircleX } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { TabView } from "./tab-host";

const focusRing = "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gms-primary";
/** Arrows scroll the strip by about one tab. */
const SCROLL_STEP = 160;

export type TabBarProps = {
  tabs: TabView[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onCloseAll: () => void;
};

/**
 * App Shell tab bar (app-shell-tabs UI rev 1, sources 03–07): ← tabs →, the count box with the list of
 * tabs, and Close all. Below `md` only the count box and its list are shown.
 */
export function TabBar({ tabs, activeId, onSelect, onClose, onCloseAll }: Readonly<TabBarProps>) {
  // Home has no tab (owner 2026-11-03), so an empty strip means only Home is open.
  const none = tabs.length === 0;
  return (
    <div className="flex h-full min-w-0 flex-1 items-stretch">
      <TabStrip tabs={tabs} activeId={activeId} onSelect={onSelect} onClose={onClose} />
      <div className="flex shrink-0 items-center gap-3 pl-2 md:pl-3">
        <TabCountMenu tabs={tabs} activeId={activeId} disabled={none} onSelect={onSelect} onClose={onClose} onCloseAll={onCloseAll} closeAllDisabled={none} />
        <button
          type="button"
          onClick={onCloseAll}
          disabled={none}
          className={`hidden h-8 items-center gap-2 rounded-gms-md px-2 text-gms-body whitespace-nowrap text-gms-text-muted transition-colors hover:bg-gms-surface-sunken hover:text-gms-text disabled:bg-transparent disabled:text-gms-text-placeholder sm:flex ${focusRing}`}
        >
          <CircleX aria-hidden size={18} strokeWidth={1.5} />
          Close all
        </button>
      </div>
    </div>
  );
}

function TabStrip({ tabs, activeId, onSelect, onClose }: Readonly<Pick<TabBarProps, "tabs" | "activeId" | "onSelect" | "onClose">>) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ overflow: false, atStart: true, atEnd: true });

  const measure = useCallback(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const overflow = strip.scrollWidth > strip.clientWidth + 1;
    const next = { overflow, atStart: strip.scrollLeft <= 0, atEnd: strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 1 };
    setEdges((current) => (current.overflow === next.overflow && current.atStart === next.atStart && current.atEnd === next.atEnd ? current : next));
  }, []);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [measure, tabs.length]);

  // The active tab always scrolls into view.
  useEffect(() => {
    const strip = stripRef.current;
    const tab = strip?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(activeId)}"]`);
    if (!strip || !tab) return;
    if (tab.offsetLeft < strip.scrollLeft) strip.scrollLeft = tab.offsetLeft;
    else if (tab.offsetLeft + tab.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = tab.offsetLeft + tab.offsetWidth - strip.clientWidth;
    measure();
  }, [activeId, measure, tabs.length]);

  const scrollBy = (delta: number) => stripRef.current?.scrollBy({ left: delta, behavior: "smooth" });

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const buttons = Array.from(stripRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []);
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const next = buttons[(index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length];
      next?.focus();
    } else if (event.key === "Delete") {
      event.preventDefault();
      onClose(tabs[index].id);
    }
  }

  return (
    <div className="hidden min-w-0 flex-1 items-stretch md:flex">
      {edges.overflow && <ArrowButton label="Scroll tabs left" disabled={edges.atStart} onClick={() => scrollBy(-SCROLL_STEP)} icon="left" />}
      <div ref={stripRef} role="tablist" aria-label="Open pages" onScroll={measure} className="-mb-px flex min-w-0 flex-1 items-end overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab, index) => {
          const active = tab.id === activeId;
          return (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              role="presentation"
              className={`group flex h-9 max-w-[220px] shrink-0 items-center gap-2 rounded-t-gms-md border-r border-gms-border-header px-3 transition-colors last:border-r-0 ${
                // Owner 2026-11-07: the tab shell is 40px high and each tab 36px, bottom-aligned. Owner 2026-11-05: active #FFFFFF, hover #F9F9F9, inactive #EDEDED. The strip overlaps the topbar's bottom
                // border by 1px (-mb-px): the active tab covers it so it joins the page below; inactive tabs draw the line.
                active
                  ? "bg-[#FFFFFF] text-gms-text"
                  : "bg-[#EDEDED] text-gms-text-muted shadow-[inset_0_-1px_0_var(--color-gms-border-header)] hover:bg-[#F9F9F9]"
              }`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                title={tab.title}
                onClick={() => onSelect(tab.id)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                // Owner 2026-11-13: the shown tab's name is bold; the others are regular. `!` because the unlayered
                // `button { font: inherit }` in globals.css outranks layered utilities on a <button>.
                className={`min-w-0 truncate rounded-gms-sm py-1 text-gms-body tracking-normal ${active ? "font-semibold!" : "font-normal!"} ${focusRing}`}
              >
               {tab.title}
              </button>
              {/* Owner 2026-11-03: no dot on the shown tab; it marks unsaved changes in the other tabs. */}
              {tab.dirty && !active && <span aria-label="Unsaved changes" role="img" className="size-1.5 shrink-0 rounded-full bg-gms-primary" />}
              <CloseButton title={tab.title} alwaysVisible={active} onClick={() => onClose(tab.id)} />
            </div>
          );
        })}
      </div>
      {edges.overflow && <ArrowButton label="Scroll tabs right" disabled={edges.atEnd} onClick={() => scrollBy(SCROLL_STEP)} icon="right" />}
    </div>
  );
}

/**
 * Owner 2026-11-13: the shown tab always has its ×; another tab shows it on hover (or while the tab has keyboard focus).
 * Hidden with opacity, not removed, so the tab keeps its width and the × stays reachable by keyboard.
 */
function CloseButton({ title, alwaysVisible, onClick }: Readonly<{ title: string; alwaysVisible: boolean; onClick: () => void }>) {
  const visibility = alwaysVisible ? "" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100";
  return (
    <button type="button" aria-label={`Close ${title}`} title={`Close ${title}`} onClick={onClick} className={`shrink-0 rounded-full text-gms-text-muted transition-opacity hover:text-gms-text ${visibility} ${focusRing}`}>
      <CircleX aria-hidden size={18} strokeWidth={1.25} />
    </button>
  );
}

function ArrowButton({ label, disabled, onClick, icon }: Readonly<{ label: string; disabled: boolean; onClick: () => void; icon: "left" | "right" }>) {
  const Icon = icon === "left" ? ArrowLeft : ArrowRight;
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className={`flex w-8 shrink-0 items-center justify-center text-gms-text disabled:text-gms-text-placeholder ${focusRing}`}>
      <Icon aria-hidden size={18} strokeWidth={1.5} />
    </button>
  );
}

/** Q-TAB-07: the number of open tabs; opens the list of tabs to switch to or close. */
function TabCountMenu({
  tabs,
  activeId,
  disabled,
  closeAllDisabled,
  onSelect,
  onClose,
  onCloseAll,
}: Readonly<Pick<TabBarProps, "tabs" | "activeId" | "onSelect" | "onClose" | "onCloseAll"> & { disabled: boolean; closeAllDisabled: boolean }>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const isOpen = open && !disabled;

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    items[(at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        aria-label={`${tabs.length} open tabs`}
        onClick={() => setOpen((value) => !value)}
        className={`flex h-8 items-center gap-1.5 rounded-gms-md border border-gms-border bg-gms-surface px-2 text-gms-body font-medium text-gms-text disabled:text-gms-text-placeholder ${focusRing}`}
      >
        {tabs.length}
        <ChevronDown aria-hidden size={16} strokeWidth={1.75} />
      </button>
      {isOpen && (
        <div
          id={menuId}
          role="menu"
          aria-label="Open pages"
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 top-10 z-50 w-[280px] overflow-hidden rounded-gms-md border border-gms-border bg-gms-surface py-1 shadow-gms-overlay"
        >
          <ul className="max-h-[60vh] overflow-y-auto">
            {tabs.map((tab) => (
              <li key={tab.id} className={`flex items-center gap-2 px-2 ${tab.id === activeId ? "bg-[#FFFFFF]" : "hover:bg-gms-surface-sunken"}`}>
                <button
                  type="button"
                  role="menuitem"
                  title={tab.title}
                  onClick={() => {
                    close(false);
                    onSelect(tab.id);
                  }}
                  className={`min-w-0 flex-1 truncate rounded-gms-sm px-1 py-2 text-left text-gms-body ${tab.id === activeId ? "font-semibold text-gms-text" : "text-gms-text-muted"} ${focusRing}`}
                >
                  {tab.title}
                </button>
                {tab.dirty && tab.id !== activeId && <span aria-label="Unsaved changes" role="img" className="size-1.5 shrink-0 rounded-full bg-gms-primary" />}
                {/* The open-tabs list keeps every × visible: its rows are a menu, not the strip. */}
                <CloseButton title={tab.title} alwaysVisible onClick={() => onClose(tab.id)} />
              </li>
            ))}
          </ul>
          <div className="border-t border-gms-border pt-1">
            <button
              type="button"
              role="menuitem"
              disabled={closeAllDisabled}
              onClick={() => {
                close(true);
                onCloseAll();
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-gms-body text-gms-text-muted hover:bg-gms-surface-sunken disabled:text-gms-text-placeholder ${focusRing}`}
            >
              <CircleX aria-hidden size={18} strokeWidth={1.5} />
              Close all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
