import { cardName, detailLine } from "../model";
import type { CardHeader } from "../types";

const label = "text-gms-label text-gms-text-secondary";
const value = "mt-1 truncate text-2xl leading-8 font-semibold text-gms-text-heading";

/**
 * The header block of the detail page (S6): Stone Code, Location and Lot over three equal cells, then the stone
 * description strip. A card without a lot shows "—".
 */
export function StockCardHeaderBlock({ header }: { header: CardHeader }) {
  const description = detailLine(header);
  return (
    <section aria-label="Stock card" className="rounded-gms-md border border-gms-border">
      <div className="grid grid-cols-1 divide-y divide-gms-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="min-w-0 px-4 py-3">
          <p className={label}>Stone Code</p>
          <p className={value}>{cardName(header)}</p>
        </div>
        <div className="min-w-0 px-4 py-3">
          <p className={label}>Location</p>
          <p className={value}>{header.location || "—"}</p>
        </div>
        <div className="min-w-0 px-4 py-3">
          <p className={label}>Lot</p>
          <p className={value}>{header.lot || "—"}</p>
        </div>
      </div>
      {description && <p className="border-t border-gms-border px-4 py-2.5 text-gms-body text-gms-text">{description}</p>}
    </section>
  );
}

export function StockCardHeaderSkeleton() {
  return <div aria-busy="true" aria-label="Loading stock card" className="h-[116px] animate-pulse rounded-gms-md bg-gms-surface-sunken" />;
}
