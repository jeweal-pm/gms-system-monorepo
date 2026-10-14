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
};

/** C-06: header (title, optional badge, trailing slot), divider, body. */
export function Card({ title, titleId, badge, trailing, children, className, bodyClassName }: CardProps) {
  return (
    <section aria-labelledby={titleId} className={cx("rounded-gms-lg border border-gms-border bg-gms-surface", className)}>
      <header className="flex min-h-[58px] items-center justify-between gap-4 border-b border-gms-border px-6 py-3">
        <div className="flex items-center gap-3">
          <h2 id={titleId} className="text-base font-semibold text-gms-text">{title}</h2>
          {badge}
        </div>
        {trailing}
      </header>
      <div className={cx("p-6", bodyClassName)}>{children}</div>
    </section>
  );
}

export function CountBadge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex h-6 items-center rounded-gms-sm bg-gms-page px-2 text-xs text-gms-text", className)}>{children}</span>;
}
