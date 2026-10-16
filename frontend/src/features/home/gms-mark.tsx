import Image from "next/image";

/**
 * GMS logo. `full`: 36 px tall (131.5 × 36 CSS px) in the sidebar, measured from 06-sidebar.png.
 * `mark` (FE-NAV-005, Q-NAV-10): the left square of the same 263 × 72 asset, cropped with CSS
 * to ≈31 × 31 px for the collapsed rail (the mark spans x 0–65, y 3–66 of the asset).
 */
export function GmsMark({ variant = "full", className = "h-9 w-auto" }: Readonly<{ variant?: "full" | "mark"; className?: string }>) {
  if (variant === "mark") {
    return (
      <span className="block size-[31px] overflow-hidden">
        <Image src="/gms-logo.png" alt="GMS home" width={263} height={72} priority className="-mt-[1.5px] h-[34px] w-[124px] max-w-none" />
      </span>
    );
  }
  return <Image src="/gms-logo.png" alt="GMS Gemstone Management System" width={263} height={72} priority className={className} />;
}
