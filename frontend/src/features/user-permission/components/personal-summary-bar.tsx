"use client";

import { ChevronUp } from "lucide-react";
import { useWatch, type UseFormReturn } from "react-hook-form";
import type { LocationOption } from "../api";
import type { UserFormValues } from "../schema";
import { cx, focusRing } from "@/components/ui/button";
import { ActiveSwitch } from "./personal-information-card";

/** Height of the compact bar; the permission table's sticky header sits right below it. */
export const SUMMARY_BAR_HEIGHT = 72;

type PersonalSummaryBarProps = {
  form: UseFormReturn<UserFormValues>;
  readOnly: boolean;
  superAdmin: boolean;
  isSelf: boolean;
  locations: readonly LocationOption[];
  /** Photo shown in the card (saved, or the picked preview); null shows the empty tile. */
  photoSrc: string | null;
  /** "{enabled} of {applicable} on"; null until the permission list has loaded. */
  permissionCount: { enabled: number; applicable: number } | null;
  /** Brings the full Personal Information card back into view. */
  onExpand: () => void;
};

/** Selected location names in option order, e.g. "Primary, Bangkok HQ". */
export function locationSummary(options: readonly LocationOption[], ids: readonly string[]): string {
  const chosen = new Set(ids);
  return options.filter((option) => chosen.has(option.id)).map((option) => option.label).join(", ");
}

const divider = <span aria-hidden className="h-8 w-px shrink-0 bg-gms-border" />;

/**
 * Compact Personal Information (owner design 2026-10-21): shown sticky at the top once the full card
 * has scrolled away. Photo, name and username, the live Active switch, locations, the permission
 * counter and "Personal info", which scrolls the full card back into view.
 */
export function PersonalSummaryBar({ form, readOnly, superAdmin, isSelf, locations, photoSrc, permissionCount, onExpand }: PersonalSummaryBarProps) {
  const [name, username, locationIds] = useWatch({ control: form.control, name: ["name", "username", "locationIds"] });
  const where = locationSummary(locations, locationIds ?? []);

  return (
    <div
      role="region"
      aria-label="Personal information summary"
      style={{ height: SUMMARY_BAR_HEIGHT }}
      // Owner design 2026-10-21: square corners, shadow 0 4px 14px #18202A1A.
      className="flex items-center gap-5 rounded-none border border-gms-border bg-gms-surface px-6 shadow-[0px_4px_14px_0px_#18202A1A]"
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-gms-md border border-dashed border-gms-border bg-gms-upload-tile">
          {photoSrc && (
            // eslint-disable-next-line @next/next/no-img-element -- same photo as the card's tile
            <img src={photoSrc} alt="" className="block max-h-full max-w-full object-contain" />
          )}
        </span>
        <div className="min-w-0">
          <p className="truncate text-gms-heading font-medium text-gms-text">{name?.trim() || "New user"}</p>
          <p className="truncate text-gms-body text-gms-text-secondary">{username?.trim() ? `@${username.trim()}` : "No username yet"}</p>
        </div>
      </div>

      <ActiveSwitch id="user-active-summary" form={form} readOnly={readOnly} superAdmin={superAdmin} isSelf={isSelf} showHint={false} />
      {divider}
      <p className="hidden min-w-0 max-w-[280px] truncate text-gms-body text-gms-text-secondary lg:block">
        Location <span className="ml-1">{where || "—"}</span>
      </p>
      {permissionCount && (
        <>
          <span className="hidden lg:contents">{divider}</span>
          <p className="shrink-0 text-gms-body text-gms-text-secondary">
            <strong className="font-semibold text-gms-text">{permissionCount.enabled}</strong>
            {` of ${permissionCount.applicable} on`}
          </p>
        </>
      )}
      <button
        type="button"
        onClick={onExpand}
        className={cx("flex shrink-0 items-center gap-2 rounded-gms-sm px-1 text-gms-body font-medium text-gms-primary hover:underline", focusRing)}
      >
        <ChevronUp size={18} aria-hidden />
        Personal info
      </button>
    </div>
  );
}
