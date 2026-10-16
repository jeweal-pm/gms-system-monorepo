"use client";

import { ChevronLeft, ChevronRight, ShieldAlert, Users } from "lucide-react";
import Link from "next/link";
import { useState, useSyncExternalStore, type ReactNode, type Ref } from "react";
import { Button, cx, focusRing } from "@/components/ui/button";
import { isCallerLicenseCode, readDomainError } from "@/lib/trpc-error";
import { partnerAccess, type PartnerAccess } from "../access";
import { lowerPlural, lowerSingular, type PartnerEntity } from "../entity";
import { usePermissionMine } from "../hooks";

/**
 * Page pieces shared by the Partner Master pages (vendor FE-VEN-001, extracted from the customer
 * page). The state machine wiring stays in each entity's `<entity>-page.tsx`.
 */

/** The drawer always overlays the content (owner 2026-10-16); below this width it starts closed. */
const PUSH_LAYOUT_QUERY = "(min-width: 1280px)";

export const printDateFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" });

export function PartnerPageFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-gms-page">
      <div className="relative min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">{children}</div>
    </div>
  );
}

/**
 * `permission.mine` gate (customer FE-CUS-004, vendor FE-VEN-003): renders the workspace only with
 * `{entity.key}:VIEW`, so no entity request is made without it. Pending / error + Retry / denied states.
 */
export function PartnerAccessGuard({ entity, children }: { entity: PartnerEntity; children: (access: PartnerAccess) => ReactNode }) {
  const mine = usePermissionMine();

  if (mine.isPending) {
    return (
      <PartnerPageFrame>
        <div aria-busy="true" aria-label="Checking access" className="space-y-4">
          <div className="h-8 w-80 max-w-full animate-pulse rounded-gms-sm bg-gms-surface-sunken" />
          <div className="h-[220px] animate-pulse rounded-gms-lg bg-gms-surface-sunken" />
        </div>
      </PartnerPageFrame>
    );
  }

  if (mine.isError) {
    const { domainCode } = readDomainError(mine.error);
    const message = isCallerLicenseCode(domainCode)
      ? "Your license doesn't allow using this page right now."
      : domainCode === "UNAUTHORIZED"
        ? "Your session has ended. Sign in again."
        : "Couldn't check your access to this page.";
    return (
      <PartnerPageFrame>
        <div role="alert" className="flex flex-col items-start gap-3 rounded-gms-lg border border-gms-border bg-gms-surface p-6">
          <p className="text-gms-body text-gms-text">{message}</p>
          <Button onClick={() => void mine.refetch()}>Retry</Button>
        </div>
      </PartnerPageFrame>
    );
  }

  const access = partnerAccess(mine.data, entity.key);
  if (!access.view) {
    const titleId = `${entity.key}-access-denied-title`;
    return (
      <PartnerPageFrame>
        <section aria-labelledby={titleId} className="flex flex-col items-start gap-3 rounded-gms-lg border border-gms-border bg-gms-surface p-8">
          <ShieldAlert size={28} className="text-gms-text-secondary" aria-hidden />
          <h1 id={titleId} className="text-gms-title font-medium text-gms-text-heading">
            {`You don't have access to ${entity.singular}`}
          </h1>
          <p className="text-gms-body text-gms-text-secondary">{`Ask an administrator for the ${entity.singular} view permission.`}</p>
          <Link href="/" className={cx("mt-2 rounded-gms-md border border-gms-border px-4 py-2 text-gms-body font-medium text-gms-text hover:bg-gms-surface-sunken", focusRing)}>
            Back to Home
          </Link>
        </section>
      </PartnerPageFrame>
    );
  }

  return <>{children(access)}</>;
}

const subscribeNever = () => () => {};

/**
 * Drawer open state: the user's choice in this visit, else the remembered state (localStorage,
 * convenience only), else open on wide screens (≥ 1280 px) only. The server snapshot is "open"
 * (deterministic hydration).
 */
export function useDrawerPreference(storageKey: string): { open: boolean; setOpen: (open: boolean) => void } {
  const [choice, setChoice] = useState<boolean | null>(null);
  const preferred = useSyncExternalStore(
    subscribeNever,
    () => {
      try {
        const stored = window.localStorage.getItem(storageKey);
        if (stored !== null) return stored === "true";
      } catch {
        // Private mode or blocked storage.
      }
      return window.matchMedia(PUSH_LAYOUT_QUERY).matches;
    },
    () => true,
  );
  const setOpen = (open: boolean) => {
    setChoice(open);
    try {
      window.localStorage.setItem(storageKey, String(open));
    } catch {
      // Convenience only (private mode or blocked storage).
    }
  };
  return { open: choice ?? preferred, setOpen };
}

/** 24×40 tab that shows / hides the list drawer. */
export function DrawerToggle({ entity, open, drawerId, onToggle, ref }: { entity: PartnerEntity; open: boolean; drawerId: string; onToggle: () => void; ref?: Ref<HTMLButtonElement> }) {
  const plural = lowerPlural(entity);
  return (
    <button
      ref={ref}
      type="button"
      aria-expanded={open}
      aria-controls={drawerId}
      aria-label={open ? `Hide ${plural} panel` : `Show ${plural} panel`}
      onClick={onToggle}
      className={cx(
        "absolute top-4 z-40 flex h-10 w-6 items-center justify-center rounded-l-gms-sm bg-gms-primary-strong text-gms-on-primary print:hidden",
        open ? "max-sm:hidden sm:right-80" : "right-0",
        focusRing,
      )}
    >
      {open ? <ChevronRight size={16} aria-hidden /> : <ChevronLeft size={16} aria-hidden />}
    </button>
  );
}

/** FormError banner (`role="alert"`), with Reload for a stale save. */
export function FormErrorBanner({ message, onReload, reloading }: { message: string; onReload?: () => void; reloading?: boolean }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-gms-md border border-gms-danger bg-gms-danger-subtle px-4 py-3">
      <p className="min-w-0 flex-1 text-gms-body text-gms-danger">{message}</p>
      {onReload && (
        <Button onClick={onReload} disabled={reloading}>
          Reload
        </Button>
      )}
    </div>
  );
}

/** Without ADD and with nothing selected. */
export function EmptySelection({ entity }: { entity: PartnerEntity }) {
  return (
    <section aria-label={`No ${lowerSingular(entity)} selected`} className="flex flex-col items-start gap-3 rounded-gms-lg border border-gms-border bg-gms-surface p-8">
      <Users size={28} className="text-gms-text-secondary" aria-hidden />
      <p className="text-gms-body text-gms-text">{`Select a ${lowerSingular(entity)} from the list.`}</p>
    </section>
  );
}

/** Load error of the selected record (+ Retry unless it no longer exists). */
export function DetailLoadError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-gms-lg border border-gms-border bg-gms-surface p-6">
      <p className="text-gms-body text-gms-text">{message}</p>
      {onRetry && <Button onClick={onRetry}>Retry</Button>}
    </div>
  );
}

/** Form skeleton while the selected record loads: information card + one or two address cards. */
export function FormSkeleton({ entity, addressCards }: { entity: PartnerEntity; addressCards: 1 | 2 }) {
  return (
    <div aria-busy="true" aria-label={`Loading ${lowerSingular(entity)}`} className="space-y-4">
      <div className="h-[260px] animate-pulse rounded-gms-lg bg-gms-surface-sunken" />
      {addressCards === 2 ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="h-[420px] animate-pulse rounded-gms-lg bg-gms-surface-sunken" />
          <div className="h-[420px] animate-pulse rounded-gms-lg bg-gms-surface-sunken" />
        </div>
      ) : (
        <div className="h-[420px] animate-pulse rounded-gms-lg bg-gms-surface-sunken" />
      )}
    </div>
  );
}
