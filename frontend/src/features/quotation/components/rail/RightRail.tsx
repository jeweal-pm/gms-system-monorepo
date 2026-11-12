"use client";

import type { ReactNode } from "react";
import { DaybookIcon, SummaryValueIcon } from "@/components/ui/rail-icons";
import { daybookLoadError, daybookState, DocumentDaybook, type DaybookDot } from "@/features/trade-document/document-api";
import { useApprovalSetting } from "@/features/trade-document/approval-flow";
import { flowDot } from "@/features/trade-document/flow-status";
import { useDaybook } from "../../api";
import type { QuotationTotals } from "../../lib/calculate";
import { SummaryValue } from "../summary/SummaryValue";
import { cx, IconButton, SidePanel } from "../ui";

export type RailPanel = "daybook" | "summary" | null;

export function RailButtons({ active, onChange }: { active: RailPanel; onChange: (panel: RailPanel) => void }) {
  const items = [
    { id: "daybook" as const, label: "Daybook", icon: DaybookIcon },
    { id: "summary" as const, label: "Summary Value", icon: SummaryValueIcon },
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
  daybook,
}: {
  panel: Exclude<RailPanel, null>;
  totals: QuotationTotals;
  currency: string;
  onClose: () => void;
  /** The document's daybook list; defaults to quotations (Memo Receive and memo out pass their own). */
  daybook?: ReactNode;
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
      {daybook ?? <DaybookList />}
    </SidePanel>
  );
}

/** FE-AS-012: Quotation uses the shared ADR-0048 dots (Draft grey, Pending / Revise orange, Approved green, Rejected red). */
export const quotationDot = (status: string, requireApproval?: boolean): DaybookDot => flowDot(status, requireApproval);

/** Quotations newest first, without cancelled ones (owner 2026-10-26, Q-QT-06); Active / Deleted (FE-SD-001). */
function DaybookList() {
  const daybook = useDaybook();
  const { requireApproval } = useApprovalSetting("quotation");
  return (
    <DocumentDaybook
      plural="quotations"
      href={(id) => `/pre-sale/quotation/${id}`}
      requireApproval={requireApproval}
      emptyText="No results found."
      state={daybookState(daybook, (error) => daybookLoadError(error, "quotations"), (item) => String(item.customerName ?? ""))}
    />
  );
}
