import type { ReactNode } from "react";

/**
 * CP-03 (company-profile ui-spec): a label column (title, optional description) beside the form
 * column, with a 1 px divider above every section but the first. The label column is 330 px at
 * ≥ 1280, 240 px at 1024–1279, and stacks above the form below 1024 (responsive table).
 */
export function ProfileSection({ id, title, description, children }: Readonly<{ id: string; title: string; description?: string; children: ReactNode }>) {
  const titleId = `${id}-title`;
  return (
    <section
      aria-labelledby={titleId}
      className="grid grid-cols-1 gap-x-16 gap-y-4 border-t border-gms-border py-6 first:border-t-0 first:pt-2 lg:grid-cols-[240px_minmax(0,860px)] xl:grid-cols-[330px_minmax(0,860px)]"
    >
      <div>
        <h2 id={titleId} className="text-gms-heading font-normal text-gms-text">
          {title}
        </h2>
        {description && <p className="mt-1.5 text-gms-label text-gms-text-secondary">{description}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/** Two-column field grid (one column below 768 px); rows 72 px apart like the partner forms. */
export const fieldGrid = "grid grid-cols-1 items-start gap-x-4 gap-y-5 md:grid-cols-2";
