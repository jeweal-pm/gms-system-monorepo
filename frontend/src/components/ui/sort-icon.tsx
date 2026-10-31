/**
 * Column sort icon (owner design 2026-10-31): an up and a down chevron in #8A939D. On the sorted column the chevron of
 * the current direction turns primary (ascending = up, descending = down); the other stays grey.
 */
export function SortIcon({ direction, className }: { direction?: "asc" | "desc"; className?: string }) {
  const tone = (dir: "asc" | "desc") => (direction === dir ? "stroke-gms-primary" : "stroke-[#8A939D]");
  return (
    <svg width="6" height="9" viewBox="0 0 6 9" fill="none" strokeWidth={1.3} strokeLinecap="round" aria-hidden="true" className={className}>
      <path d="M0.649902 3.00256L2.7329 0.919434L4.8159 3.00256" className={tone("asc")} />
      <path d="M0.649902 5.50231L2.7329 7.58543L4.8159 5.50231" className={tone("desc")} />
    </svg>
  );
}
