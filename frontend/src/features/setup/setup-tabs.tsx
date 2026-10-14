"use client";

import { Bell, Coins, FileBadge, Hammer, MapPin, MapPinned, Settings, UserCog, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type SetupTab = {
  label: string;
  /** null = no route yet; shown disabled (proposal in FE-UP-002). */
  href: string | null;
  icon: LucideIcon;
  iconClass: string;
};

/** Order and labels from screenshot S1. Existing Setup pages are the /modules/<slug> placeholders. */
const setupTabs: SetupTab[] = [
  { label: "General", href: null, icon: Settings, iconClass: "bg-indigo-600" },
  { label: "User and permission", href: "/setup/user-permission", icon: UserCog, iconClass: "bg-green-600" },
  { label: "Notifications", href: null, icon: Bell, iconClass: "bg-teal-700" },
  { label: "Main Location", href: "/modules/main-location", icon: MapPin, iconClass: "bg-red-500" },
  { label: "Sub Location", href: "/modules/sub-location", icon: MapPinned, iconClass: "bg-red-500" },
  { label: "Currency", href: "/modules/currency", icon: Coins, iconClass: "bg-orange-500" },
  { label: "Certificate Type", href: "/modules/certificate-type", icon: FileBadge, iconClass: "bg-zinc-500" },
  { label: "Labour Type", href: "/modules/labour-type", icon: Hammer, iconClass: "bg-blue-600" },
];

function TabIcon({ icon: Icon, iconClass }: Pick<SetupTab, "icon" | "iconClass">) {
  return (
    <span aria-hidden className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] ${iconClass}`}>
      <Icon size={10} strokeWidth={2.4} className="text-white" />
    </span>
  );
}

/** C-02: Setup tab bar shared by Setup pages. */
export function SetupTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Setup" className="shrink-0 overflow-x-auto border-b border-gms-border-tabs bg-gms-surface px-5">
      <ul className="flex h-9 min-w-max items-stretch gap-3">
        {setupTabs.map((tab) => {
          const active = tab.href !== null && pathname === tab.href;
          const content = (
            <>
              <TabIcon icon={tab.icon} iconClass={tab.iconClass} />
              {tab.label}
            </>
          );
          const base = "relative -mb-px flex h-full items-center gap-2 border-b px-1.5 text-[15px] whitespace-nowrap";
          return (
            <li key={tab.label} className="flex">
              {tab.href === null ? (
                <span aria-disabled="true" title={`${tab.label} is not available yet`} className={`${base} cursor-not-allowed border-transparent text-gms-text-secondary opacity-60`}>
                  {content}
                </span>
              ) : (
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={`${base} rounded-t-gms-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gms-primary ${
                    active ? "border-gms-text font-medium text-gms-text" : "border-transparent text-gms-text-secondary hover:text-gms-text"
                  }`}
                >
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
