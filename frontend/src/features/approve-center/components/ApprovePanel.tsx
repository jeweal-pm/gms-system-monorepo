"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId } from "react";
import { cx, focusRing } from "@/components/ui/button";
import { approveMenuHref, type ApproveMenu, type ApproveMenuSlug } from "../menus";
import { menuBadge, type CountState, type MenuBadge } from "../model";

/** C-AP-03: count circle 20 × 20 (#E2F0F0 / #1C7B80), "off" pill, or nothing. */
export function PanelBadge({ badge }: { badge: MenuBadge }) {
  if (badge.kind === "off") {
    return <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-gms-border px-1.5 text-gms-label text-gms-text-secondary">off</span>;
  }
  if (badge.kind === "count") {
    return (
      <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-gms-count-badge px-1 text-gms-label font-medium text-gms-count-badge-text tabular-nums">
        <span className="sr-only">, </span>
        {badge.text}
        <span className="sr-only"> pending</span>
      </span>
    );
  }
  return null;
}

type PanelProps = {
  menus: readonly ApproveMenu[];
  active: ApproveMenuSlug | null;
  countOf: (menu: ApproveMenu) => CountState | undefined;
};

/**
 * C-AP-02 (sources 01/02, second column): 236 px, #FCFCFC, 1 px #EDEDED right border, title "Approve", items
 * 36 px high inset 8 px, radius 8 px, icon 18 px + label + right badge; active #F3F3F3. Shown from `lg`; below it
 * the page shows `ApproveMenuSelect` instead (Q-AP-10).
 */
export function ApprovePanel({ menus, active, countOf }: PanelProps) {
  const titleId = useId();
  return (
    <nav aria-labelledby={titleId} className="hidden h-full w-gms-sidebar shrink-0 flex-col border-r border-gms-border bg-gms-surface-muted px-2 py-4 lg:flex">
      <h2 id={titleId} className="shrink-0 px-2 pt-2.5 text-gms-heading font-semibold text-gms-text">
        Approve
      </h2>
      <ul className="scrollbar-none mt-[26px] flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {menus.map((menu) => {
          const Icon = menu.icon;
          const current = menu.slug === active;
          return (
            <li key={menu.slug}>
              <Link
                href={approveMenuHref(menu.slug)}
                aria-current={current ? "page" : undefined}
                className={cx(
                  "flex h-9 items-center gap-2 rounded-gms-md px-2 text-gms-body leading-5 text-gms-text transition-colors hover:bg-gms-nav-active",
                  current && "bg-gms-nav-active font-semibold",
                  focusRing,
                )}
              >
                <Icon aria-hidden size={18} strokeWidth={1.5} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate">{menu.label}</span>
                <PanelBadge badge={menuBadge(menu, countOf(menu))} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Below `lg` the panel becomes a full-width select above the title (default, Q-AP-10). */
export function ApproveMenuSelect({ menus, active, countOf }: PanelProps) {
  const router = useRouter();
  const id = useId();
  return (
    <div className="mb-4 lg:hidden">
      <label htmlFor={id} className="mb-1 block text-gms-label text-gms-text-secondary">
        Approve menu
      </label>
      <select
        id={id}
        value={active ?? ""}
        onChange={(event) => router.push(approveMenuHref(event.target.value as ApproveMenuSlug))}
        className={cx("h-9 w-full rounded-gms-md border border-gms-border bg-gms-surface px-3 text-gms-body text-gms-text", focusRing)}
      >
        {active === null && <option value="">Choose a menu</option>}
        {menus.map((menu) => {
          const badge = menuBadge(menu, countOf(menu));
          const suffix = badge.kind === "count" ? ` (${badge.text})` : badge.kind === "off" ? " (off)" : "";
          return (
            <option key={menu.slug} value={menu.slug}>
              {menu.label}
              {suffix}
            </option>
          );
        })}
      </select>
    </div>
  );
}
