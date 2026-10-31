import type { SVGProps } from "react";

/**
 * Barcode scan icon used by every scan button (owner design 2026-10-31). The stroke follows the text color
 * (`currentColor`, #1C252E on the light buttons), so disabled buttons dim it like the other icons.
 */
export function ScanIcon({ className = "size-4", ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} {...props}>
      <path d="M2 4.66667V3.33333C2 2.97971 2.14048 2.64057 2.39052 2.39052C2.64057 2.14048 2.97971 2 3.33333 2H4.66667" />
      <path d="M11.333 2H12.6663C13.02 2 13.3591 2.14048 13.6091 2.39052C13.8592 2.64057 13.9997 2.97971 13.9997 3.33333V4.66667" />
      <path d="M13.9997 11.3335V12.6668C13.9997 13.0205 13.8592 13.3596 13.6091 13.6096C13.3591 13.8597 13.02 14.0002 12.6663 14.0002H11.333" strokeWidth={1.25} />
      <path d="M4.66667 14.0002H3.33333C2.97971 14.0002 2.64057 13.8597 2.39052 13.6096C2.14048 13.3596 2 13.0205 2 12.6668V11.3335" strokeWidth={1.25} />
      <path d="M5.33301 4.6665V11.3332" strokeWidth={1.25} />
      <path d="M8 4.6665V11.3332" strokeWidth={1.25} />
      <path d="M11.333 4.6665V11.3332" strokeWidth={1.25} />
    </svg>
  );
}
