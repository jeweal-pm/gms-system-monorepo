"use client";

import Link from "next/link";
import type { Ref } from "react";
import type { LucideIcon } from "lucide-react";
import type { SetupTileColor } from "./setup-destinations";

const tileColorClass: Record<SetupTileColor, string> = {
  indigo: "bg-gms-tile-indigo",
  green: "bg-gms-tile-green",
  primary: "bg-gms-primary",
  neutral: "bg-gms-tile-neutral",
};

type TileContentProps = {
  label: string;
  icon: LucideIcon;
  color: SetupTileColor;
  /** `landing`: shadow + 32 px icon (S3). `modal`: no shadow, 26 px icon (S4). */
  variant: "landing" | "modal";
};

const tileClassName =
  "group flex w-full flex-col items-center rounded-gms-lg px-1 py-2 text-gms-text focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-gms-primary";

function TileContent({ label, icon: Icon, color, variant }: Readonly<TileContentProps>) {
  return (
    <>
      <span
        aria-hidden
        className={`flex size-[54px] items-center justify-center rounded-gms-xl text-gms-on-primary ${tileColorClass[color]} ${variant === "landing" ? "shadow-gms-setup-tile" : ""}`}
      >
        <Icon size={variant === "landing" ? 32 : 26} strokeWidth={1.5} />
      </span>
      <span className="mt-2.5 text-sm leading-5 font-medium whitespace-nowrap group-hover:underline">{label}</span>
    </>
  );
}

/**
 * SetupTile (N-11): one focusable element (54 × 54 colored square + one-line label). Hover underlines
 * the label; focus-visible draws a 2 px primary ring around the whole tile (radius 12).
 */
export function SetupTileLink({ href, onNavigate, ...content }: Readonly<TileContentProps & { href: string; onNavigate?: () => void }>) {
  return (
    <Link href={href} onNavigate={onNavigate} className={tileClassName}>
      <TileContent {...content} />
    </Link>
  );
}

/** Button variant (Master Code tile): opens a dialog, so it announces `aria-haspopup="dialog"`. */
export function SetupTileButton({ ref, onClick, ...content }: Readonly<TileContentProps & { onClick: () => void; ref?: Ref<HTMLButtonElement> }>) {
  return (
    <button ref={ref} type="button" aria-haspopup="dialog" onClick={onClick} className={`${tileClassName} cursor-pointer`}>
      <TileContent {...content} />
    </button>
  );
}
