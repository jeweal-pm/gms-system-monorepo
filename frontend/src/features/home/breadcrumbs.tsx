import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { Breadcrumb } from "./navigation";

/**
 * Topbar breadcrumbs (07-topbar.png): 13 px, earlier items #656B71, current item #1C252E medium.
 * Below `md` only the current item is shown so the topbar never scrolls horizontally.
 */
export function Breadcrumbs({ items }: Readonly<{ items: Breadcrumb[] }>) {
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-2 text-gms-label leading-5">
        {items.map((item, index) => {
          const isCurrent = index === items.length - 1;
          return (
            <li key={`${index}-${item.label}`} className={`min-w-0 items-center gap-2 ${isCurrent ? "flex" : "hidden md:flex"}`}>
              {index > 0 && <ChevronRight aria-hidden size={12} strokeWidth={2} className="hidden shrink-0 text-gms-text-secondary md:block" />}
              {isCurrent ? (
                <span aria-current="page" className="truncate font-medium text-gms-text">
                  {item.label}
                </span>
              ) : item.href ? (
                <Link
                  href={item.href}
                  className="truncate rounded-gms-sm text-gms-text-secondary hover:text-gms-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gms-primary"
                >
                  {item.label}
                </Link>
              ) : (
                <span className="truncate text-gms-text-secondary">{item.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
