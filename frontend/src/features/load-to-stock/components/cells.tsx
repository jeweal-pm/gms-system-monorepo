"use client";

import { ChevronsUpDown, MessageSquare } from "lucide-react";
import type { ReactNode } from "react";
import { Badge, cx } from "@/features/quotation/components/ui";
import type { StoneAttrs } from "../types";

/** Shared cells of the Item table, the picker and the Load table (Purchase table look, DV-12 header case). */

export function HeaderCell({ title, sub, right, className }: { title: string; sub?: string; right?: boolean; className?: string }) {
  return (
    <th scope="col" className={cx("px-3 py-3 font-medium", right && "text-right", className)}>
      <span className={cx("inline-flex items-center gap-1.5", right && "flex-row-reverse")}>
        <span className="leading-tight">
          <span className="block">{title}</span>
          {sub && <span className="block text-[11px] font-normal text-[#6B7480]">{sub}</span>}
        </span>
        <ChevronsUpDown aria-hidden className="size-3 text-[#95A0A9]" />
      </span>
    </th>
  );
}

/** "Auto" until the Stock ID is issued (DV-07, ADR-0052 D5), then the issued ID. */
export function StockIdBadge({ stockId }: { stockId: string | null | undefined }) {
  return <span className="inline-flex items-center rounded bg-[#FFD88A]/60 px-1.5 py-0.5 font-mono text-xs text-[#8A5A00]">{stockId || "Auto"}</span>;
}

export function StoneCodeCell({ code, label, stockId, lot, note }: { code: string; label: string; stockId: string | null | undefined; lot?: string; note?: ReactNode }) {
  return (
    <>
      <div className="font-medium">{code || "—"}</div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[#6B7480]">
        <span>{label}</span>
        <StockIdBadge stockId={stockId} />
        {lot && <Badge variant="lot">{lot}</Badge>}
      </div>
      {note && (
        <div className="mt-1 flex items-center gap-1.5 text-xs text-[#6B7480]">
          <MessageSquare aria-hidden className="size-3" /> {note}
        </div>
      )}
    </>
  );
}

export function StoneCell({ attrs }: { attrs: Pick<StoneAttrs, "stone" | "shape" | "size"> }) {
  return (
    <>
      <div className="font-medium">{attrs.stone || "—"}</div>
      <div className="mt-1 text-xs text-[#6B7480]">{[attrs.shape, attrs.size].filter(Boolean).join(" · ")}</div>
    </>
  );
}

export function GradeCell({ attrs }: { attrs: Pick<StoneAttrs, "color" | "clarity" | "cutting" | "quality"> }) {
  return (
    <>
      <div>{[attrs.color, attrs.clarity].filter(Boolean).join(" · ") || "—"}</div>
      <div className="mt-1 text-xs text-[#6B7480]">{[attrs.cutting, attrs.quality].filter(Boolean).join(" · ")}</div>
    </>
  );
}

export function CerCell({ attrs }: { attrs: Pick<StoneAttrs, "cerType" | "cerNo"> }) {
  if (!attrs.cerType && !attrs.cerNo) return <span className="text-xs text-[#6B7480]">No certificate</span>;
  return (
    <>
      {attrs.cerType && <Badge>{attrs.cerType}</Badge>}
      <div className="mt-1 text-xs text-[#6B7480]">{attrs.cerNo}</div>
    </>
  );
}
