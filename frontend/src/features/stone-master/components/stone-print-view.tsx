import type { StonePage } from "../kinds";

type StonePrintViewProps = {
  page: StonePage;
  title: string;
  rows: readonly { label: string; value: string }[];
  printedAt: string;
};

/** Print layout of the saved record (ui-spec "Print"): hidden on screen, shown by `window.print()`. */
export function StonePrintView({ page, title, rows, printedAt }: StonePrintViewProps) {
  return (
    <section aria-hidden className="hidden text-black print:block">
      <p className="text-gms-label">{`Stone Master › ${page.navLabel}`}</p>
      <h1 className="mt-1 text-gms-title font-medium">{title}</h1>
      <dl className="mt-6 grid grid-cols-[180px_1fr] gap-x-6 gap-y-2 text-gms-body">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="font-medium">{row.label}</dt>
            <dd>{row.value || "—"}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-8 text-gms-label">{`Printed ${printedAt}`}</p>
    </section>
  );
}
