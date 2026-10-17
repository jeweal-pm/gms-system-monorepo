"use client";

import { Lock, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { PermissionCatalog } from "../api";
import { ALL_SECTIONS, countEnabled, filterCatalog, groupIds, sectionOptions, type PermissionValues } from "../permission-utils";
import { Button, cx, focusRing } from "@/components/ui/button";
import { PermissionMatrix } from "./permission-matrix";
import { SectionFilter } from "./section-filter";

type PermissionsCardProps = {
  catalog: PermissionCatalog | undefined;
  catalogStatus: "pending" | "error" | "success";
  errorMessage?: string;
  onRetry: () => void;
  values: PermissionValues;
  /** Omit for a read-only matrix. */
  onChange?: (values: PermissionValues) => void;
  /** Super Admin target: every cell checked and locked, with the lock banner. */
  superAdminLocked?: boolean;
  /** DA-02: keys the signed-in user may hand out; null/undefined = all (Super Admin). */
  grantable?: ReadonlySet<string> | null;
};

const LOCK_BANNER_ID = "permissions-super-admin-lock";

const linkClass = cx("rounded-gms-sm text-gms-body text-[var(--gms-blue)] hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline", focusRing);

/**
 * Permissions card, UI revision 2 (rev2-02/03): search menu, "All Permissions"
 * filter, Expand All / Collapse All, live counter "{on} of {applicableCount}
 * permissions on" over the whole catalog (v2: 347), and the Super Admin banner.
 */
export function PermissionsCard({ catalog, catalogStatus, errorMessage, onRetry, values, onChange, superAdminLocked = false, grantable }: PermissionsCardProps) {
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<string>(ALL_SECTIONS);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  const enabled = useMemo(() => (catalog ? countEnabled(catalog.nodes, values) : null), [catalog, values]);
  const visible = useMemo(() => (catalog ? filterCatalog(catalog.nodes, query, section) : []), [catalog, query, section]);
  const sections = useMemo(() => (catalog ? sectionOptions(catalog.nodes) : sectionOptions([])), [catalog]);
  const allGroups = useMemo(() => (catalog ? groupIds(catalog.nodes) : []), [catalog]);
  const searching = query.trim() !== "";

  function toggleGroup(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const ready = catalogStatus === "success" && catalog !== undefined;

  return (
    <section aria-labelledby="permissions-title" className="flex min-h-[360px] flex-1 flex-col rounded-gms-lg border border-gms-border bg-gms-surface print:block">
      <header className="flex min-h-[62px] flex-wrap items-center gap-x-4 gap-y-3 border-b border-gms-border px-6 py-3">
        <h2 id="permissions-title" className="text-gms-heading font-medium text-gms-text">Permissions</h2>
        <label className="relative block w-full sm:w-[316px]">
          <span className="sr-only">Search menu</span>
          <Search size={18} aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gms-text" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search menu..."
            autoComplete="off"
            disabled={!ready}
            className="h-10 w-full rounded-gms-md border border-gms-border bg-gms-surface pl-11 pr-3 text-gms-body text-gms-text outline-none placeholder:text-gms-text-placeholder focus:border-gms-primary focus:ring-2 focus:ring-gms-primary/20 disabled:opacity-60"
          />
        </label>
        <SectionFilter options={sections} value={section} onChange={setSection} disabled={!ready} />
        <div className="flex items-center gap-3">
          <button type="button" className={linkClass} disabled={!ready || searching} onClick={() => setCollapsed(new Set())}>
            Expand All
          </button>
          <button type="button" className={linkClass} disabled={!ready || searching} onClick={() => setCollapsed(new Set(allGroups))}>
            Collapse All
          </button>
        </div>
        {catalog && enabled !== null && (
          <p className="ml-auto text-gms-label text-gms-text-secondary" aria-live="polite">
            <strong className="font-semibold text-gms-text">{enabled}</strong>
            {` of ${catalog.applicableCount} permissions on`}
          </p>
        )}
      </header>

      {!superAdminLocked && onChange && (
        <p className="border-b border-gms-border px-6 py-2 text-gms-label text-gms-text-secondary">
          Turning on any action also turns on View. Turning off View turns off the other actions of that menu.
        </p>
      )}

      {superAdminLocked && (
        <p id={LOCK_BANNER_ID} className="flex items-center gap-2 bg-gms-surface-sunken px-6 py-2.5 text-gms-body text-gms-text">
          <Lock size={16} aria-hidden className="shrink-0" />
          Super Admin always has every permission and can&apos;t be turned off. Personal information can still be edited.
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col px-6 pb-6 pt-6 print:block">
        {catalogStatus === "pending" && (
          <div aria-busy="true" aria-label="Loading permissions" className="space-y-2">
            <div className="h-[42px] animate-pulse rounded-gms-sm bg-gms-page" />
            {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-[46px] animate-pulse rounded-gms-sm bg-gms-surface-sunken" />)}
          </div>
        )}
        {catalogStatus === "error" && (
          <div role="alert" className="flex flex-col items-start gap-3 py-4">
            <p className="text-gms-body text-gms-text">{errorMessage ?? "Couldn't load the permission list."}</p>
            <Button onClick={onRetry}>Retry</Button>
          </div>
        )}
        {ready &&
          (visible.length === 0 ? (
            <p className="py-6 text-gms-body text-gms-text-secondary">
              {searching ? `No menus match "${query.trim()}"` : "No menus in this section"}
            </p>
          ) : (
            <PermissionMatrix
              nodes={visible}
              values={values}
              onChange={superAdminLocked ? undefined : onChange}
              collapsed={collapsed}
              onToggleGroup={toggleGroup}
              forceExpand={searching}
              lockedDescriptionId={superAdminLocked ? LOCK_BANNER_ID : undefined}
              grantable={grantable}
            />
          ))}
      </div>
    </section>
  );
}
