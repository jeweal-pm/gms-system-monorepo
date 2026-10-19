"use client";

import { GripVertical } from "lucide-react";
import { MotionConfig, Reorder, useDragControls } from "motion/react";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cx, focusRing } from "@/components/ui/button";
import { moveItem, PART_LABEL, type PartKey } from "../stone-code";

type PartOrderListProps = {
  order: readonly PartKey[];
  onChange: (order: PartKey[]) => void;
  readOnly: boolean;
  /** The select for one part (rendered inside its row). */
  renderPart: (part: PartKey) => ReactNode;
};

/** Lift while dragging (reference: 21st.dev ddoemonn/reorder-list, owner 2026-10-19). */
const DRAG_STYLE = { scale: 1.015, boxShadow: "0 14px 32px -10px rgb(16 24 40 / 0.28), 0 2px 6px -2px rgb(16 24 40 / 0.12)" };
/**
 * Resting shadow with the same two layers, fully transparent: motion animates back to it when the drag
 * ends. Without a resting value the drag shadow stayed on every dropped row (owner 2026-10-19).
 */
const REST_STYLE = { boxShadow: "0 0 0 0 rgb(16 24 40 / 0), 0 0 0 0 rgb(16 24 40 / 0)" };
const SPRING = { type: "spring", stiffness: 520, damping: 38, mass: 0.8 } as const;

/**
 * Stone Code parts list (S4–S6): "handle · #n · select" rows. Drag by the handle (mouse/touch) with
 * `motion` Reorder: the dragged row lifts and follows the pointer while the others spring into place
 * (motion 14.0.0, owner-approved 2026-10-19). Keyboard: focus the handle and press ArrowUp/ArrowDown.
 * Every move is announced in a polite live region. Reduced-motion users get instant moves.
 */
export function PartOrderList({ order, onChange, readOnly, renderPart }: PartOrderListProps) {
  const handleRefs = useRef<Partial<Record<PartKey, HTMLButtonElement | null>>>({});
  const [announcement, setAnnouncement] = useState("");

  function announce(part: PartKey, next: readonly PartKey[]) {
    setAnnouncement(`${PART_LABEL[part]} moved to position ${next.indexOf(part) + 1} of ${next.length}`);
  }

  function moveByKey(event: KeyboardEvent<HTMLButtonElement>, part: PartKey) {
    if (readOnly || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    const from = order.indexOf(part);
    const to = event.key === "ArrowUp" ? from - 1 : from + 1;
    if (to < 0 || to >= order.length) return;
    const next = moveItem(order, from, to);
    onChange(next);
    announce(part, next);
    window.requestAnimationFrame(() => handleRefs.current[part]?.focus());
  }

  function reorder(next: PartKey[]) {
    const moved = next.find((part, index) => order[index] !== part);
    onChange(next);
    if (moved) announce(moved, next);
  }

  return (
    <MotionConfig reducedMotion="user">
      <Reorder.Group as="ol" axis="y" values={[...order]} onReorder={reorder} className="flex flex-col gap-1" aria-label="Code parts, in order">
        {order.map((part, index) => (
          <PartRow
            key={part}
            part={part}
            index={index}
            total={order.length}
            readOnly={readOnly}
            onKeyDown={moveByKey}
            handleRef={(element) => {
              handleRefs.current[part] = element;
            }}
          >
            {renderPart(part)}
          </PartRow>
        ))}
      </Reorder.Group>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </MotionConfig>
  );
}

type PartRowProps = {
  part: PartKey;
  index: number;
  total: number;
  readOnly: boolean;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, part: PartKey) => void;
  handleRef: (element: HTMLButtonElement | null) => void;
  children: ReactNode;
};

/** One row; only the handle starts a drag, so the select stays clickable. */
function PartRow({ part, index, total, readOnly, onKeyDown, handleRef, children }: PartRowProps) {
  const controls = useDragControls();
  const [dragging, setDragging] = useState(false);
  return (
    <Reorder.Item
      as="li"
      value={part}
      dragListener={false}
      dragControls={controls}
      layout="position"
      transition={SPRING}
      style={REST_STYLE}
      whileDrag={DRAG_STYLE}
      onDragStart={() => setDragging(true)}
      onDragEnd={() => setDragging(false)}
      // `isolate`: each row is its own stacking context, so a field label (z-[1]) of the row underneath
      // can't show through the dragged row (owner 2026-10-19). Every row has inner padding (the card's gap
      // to its border); only the dragged row is drawn as a floating card, and its border/fill go away on drop.
      // The horizontal padding is offset by a negative margin, so the fields keep their alignment.
      className={cx(
        "relative isolate -mx-3 flex items-end gap-3 rounded-gms-lg border px-3 py-2 transition-colors duration-200",
        dragging ? "z-50 border-gms-border bg-gms-surface" : "z-0 border-transparent bg-transparent",
      )}
    >
      <button
        type="button"
        ref={handleRef}
        aria-label={`Move ${PART_LABEL[part]}, position ${index + 1} of ${total}. Use the up and down arrow keys.`}
        disabled={readOnly}
        onKeyDown={(event) => onKeyDown(event, part)}
        onPointerDown={(event) => {
          if (readOnly || event.button !== 0) return;
          event.preventDefault();
          controls.start(event);
        }}
        className={cx(
          "mb-4 flex h-6 w-6 shrink-0 touch-none items-center justify-center rounded-gms-sm text-gms-text-secondary",
          readOnly ? "cursor-default opacity-50" : "cursor-grab active:cursor-grabbing hover:bg-gms-surface-sunken",
          focusRing,
        )}
      >
        <GripVertical size={18} aria-hidden />
      </button>
      <span aria-hidden className="mb-[18px] w-8 shrink-0 text-gms-body text-gms-text">{`#${index + 1}`}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </Reorder.Item>
  );
}
