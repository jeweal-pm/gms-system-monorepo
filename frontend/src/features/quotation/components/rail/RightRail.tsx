"use client";

import { Calculator, FileSearch } from "lucide-react";
import Link from "next/link";
import { loadErrorMessage, useDaybook, type QuotationStatus } from "../../api";
import type { QuotationTotals } from "../../lib/calculate";
import { formatDate } from "../../lib/format";
import { SummaryValue } from "../summary/SummaryValue";
import { cx, IconButton, SidePanel } from "../ui";

export type RailPanel = "daybook" | "summary" | null;

export function RailButtons({ active, onChange }: { active: RailPanel; onChange: (panel: RailPanel) => void }) {
  const items = [
    { id: "daybook" as const, label: "Daybook", icon: FileSearch },
    { id: "summary" as const, label: "Summary Value", icon: Calculator },
  ];
  return (
    <div className="flex flex-col gap-2 pt-4">
      {items.map(({ id, label, icon: Icon }) => (
        <IconButton
          key={id}
          label={label}
          onClick={() => onChange(active === id ? null : id)}
          className={cx(active === id && "bg-[#E6F1F1] text-[#0E5E63]")}
        >
          <Icon className="size-4" />
        </IconButton>
      ))}
    </div>
  );
}

export function RailPanelView({
  panel,
  totals,
  currency,
  onClose,
}: {
  panel: Exclude<RailPanel, null>;
  totals: QuotationTotals;
  currency: string;
  onClose: () => void;
}) {
  if (panel === "summary") {
    return (
      <SidePanel title="Summary Value" subtitle="Combined value derived from the data." onClose={onClose} className="h-full">
        <div className="px-5 py-2">
          <SummaryValue totals={totals} currency={currency} />
        </div>
      </SidePanel>
    );
  }
  return (
    <SidePanel title="Daybook" subtitle="Chronological daybook of all system activities." onClose={onClose} className="h-full">
      <DaybookList />
    </SidePanel>
  );
}

const DOT: Record<QuotationStatus, string> = {
  DRAFT: "bg-[#A9B1B9]",
  PENDING_APPROVAL: "bg-[#F5A524]",
  APPROVED: "bg-[#22C55E]",
  REJECTED: "bg-[#E5484D]",
  CANCELLED: "bg-[#D5DADF]",
};

/** Quotations newest first, without cancelled ones (owner 2026-10-26, Q-QT-06). */
function DaybookList() {
  const daybook = useDaybook();

  if (daybook.isPending) return <p className="py-16 text-center text-sm text-[#6B7480]">Loading…</p>;
  if (daybook.isError) return <p className="py-16 text-center text-sm text-[#E5484D]">{loadErrorMessage(daybook.error)}</p>;
  const entries = daybook.data.items;
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-[#6B7480]">
        <FileSearch className="size-10 text-[#1C252E]" strokeWidth={1.5} />
        No results found.
      </div>
    );
  }

  return (
    <ul className="px-5 py-3">
      {entries.map((e, i) => (
        <li key={e.id}>
          <Link href={`/pre-sale/quotation/${e.id}`} className="flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-[#F6F7F8]">
            <span className="w-8 shrink-0 text-[#1C252E]">#{i + 1}</span>
            <span className={cx("mt-1.5 size-3 shrink-0 rounded-full", DOT[e.status])} title={e.status} />
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-[#1C252E]">{e.docNo}</span>
              <span className="block truncate text-sm text-[#1C252E]">{e.customerName}</span>
            </span>
            <span className="shrink-0 text-sm text-[#A9B1B9]">{formatDate(e.docDate)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
