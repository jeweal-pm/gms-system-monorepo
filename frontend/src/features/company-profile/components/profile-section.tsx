import type { ReactNode } from "react";

/**
 * CP-03 (company-profile UI revision 3): a section of the form column. The title sits above its
 * fields (no label column any more); a 1 px divider runs across the form column above every section
 * but the first. Fields stay within 860 px. At ≥ 1024 px every section sits in the page grid's
 * second column, beside the Company Logo column.
 */
export function ProfileSection({ id, title, children }: Readonly<{ id: string; title: string; children: ReactNode }>) {
  const titleId = `${id}-title`;
  return (
    <section aria-labelledby={titleId} className="min-w-0 border-t border-gms-border py-8 first-of-type:border-t-0 first-of-type:pt-0 lg:col-start-2">
      <h2 id={titleId} className="mb-6 text-gms-heading font-medium text-gms-text">
        {title}
      </h2>
      <div className="max-w-[860px] min-w-0">{children}</div>
    </section>
  );
}

/** Two-column field grid (one column below 768 px); rows 68 px apart (52 px field + 16 px gap). */
export const fieldGrid = "grid grid-cols-1 items-start gap-x-4 gap-y-4 md:grid-cols-2";
