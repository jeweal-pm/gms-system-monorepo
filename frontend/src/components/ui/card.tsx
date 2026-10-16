import type { ReactNode } from "react";
import { cx } from "./button";

type CardProps = {
  title: string;
  titleId: string;
  badge?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Overrides the default title style (customer cards use 18 px medium). */
  titleClassName?: string;
  headerClassName?: string;
};

/** C-06: header (title, optional badge, trailing slot), divider, body. */
export function Card({ title, titleId, badge, trailing, children, className, bodyClassName, titleClassName, headerClassName }: CardProps) {
  return (
    <section aria-labelledby={titleId} className={cx("rounded-gms-lg border border-gms-border bg-gms-surface", className)}>
      <header className={cx("flex min-h-[58px] items-center justify-between gap-4 border-b border-gms-border px-6 py-3", headerClassName)}>
        <div className="flex items-center gap-3">
          <h2 id={titleId} className={titleClassName ?? "text-gms-heading font-semibold text-gms-text"}>{title}</h2>
          {badge}
        </div>
        {trailing}
      </header>
      <div className={cx("p-6", bodyClassName)}>{children}</div>
    </section>
  );
}

export function CountBadge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex h-6 items-center rounded-gms-sm bg-gms-page px-2 text-gms-label text-gms-text", className)}>{children}</span>;
}

export type BadgeVariant = "default" | "draft" | "inactive";

const badgeVariantClass: Record<BadgeVariant, string> = {
  // Owner decision Q-CUS-06 (2026-10-14): text #22C55E on #C1EFD2, as in the design.
  default: "bg-gms-success-subtle text-gms-success-text",
  draft: "bg-gms-warning-subtle text-gms-warning-text",
  inactive: "border border-gms-border bg-gms-page text-gms-text-secondary",
};

/** Text badge (customer C-14). The word carries the meaning; color is never the only signal. */
export function Badge({ variant, children, className }: { variant: BadgeVariant; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex h-6 shrink-0 items-center rounded-gms-sm px-2 text-gms-label font-medium", badgeVariantClass[variant], className)}>
      {children}
    </span>
  );
}
