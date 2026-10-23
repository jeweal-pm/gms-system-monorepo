import { Factory } from "lucide-react";
import type { IconComponent } from "@/components/ui/design-icon";
import { MASTER_CODE_MENU_KEYS, menuKeyFor, setupPlaceholderLink } from "@/features/home/navigation";
import { DEFAULT_STONE_SLUG, STONE_MENU_KEY, stonePageHref } from "@/features/stone-master/kinds";
import {
  CertificateMasterIcon,
  CompanyProfileIcon,
  CurrencyIcon,
  DocumentSetupIcon,
  LocationMasterIcon,
  MasterCodeIcon,
  NotificationsIcon,
  PartnerMasterIcon,
  SalePersonIcon,
  ServiceFeeIcon,
  StoneMasterIcon,
  UserPermissionIcon,
} from "./setup-icons";

/** Tile square colors (design-system tokens, owner design 2026-10-16). */
export type SetupTileColor = "indigo" | "green" | "red" | "blue" | "stone" | "neutral";

/** `permission`: catalog keys; the tile shows when the user has VIEW on any (owner 2026-10-17). Undefined = always. */
export type SetupLinkDestination = { kind: "link"; id: string; label: string; href: string; icon: IconComponent; color: SetupTileColor; permission?: readonly string[] };
export type SetupMasterCodeEntry = { kind: "master-code"; id: string; label: string; icon: IconComponent; color: SetupTileColor; permission?: readonly string[] };
/** Shown faded and not clickable until the page exists (Stone Factory in the 2026-10-16 design). */
export type SetupUnavailableEntry = { kind: "unavailable"; id: string; label: string; icon: IconComponent; color: SetupTileColor; permission?: readonly string[] };

const permissionFor = (id: string): readonly string[] | undefined => {
  const key = menuKeyFor(id);
  return key ? [key] : undefined;
};

const placeholder = (slug: Parameters<typeof setupPlaceholderLink>[0], icon: IconComponent, color: SetupTileColor): SetupLinkDestination => ({
  kind: "link",
  id: slug,
  ...setupPlaceholderLink(slug),
  icon,
  color,
  permission: permissionFor(slug),
});

/**
 * Setup landing tiles in reading order (S3 + owner design 2026-10-16). Company Profile has its page
 * (company-profile FE-CP-001); Notifications and Document Setup are placeholders (Q-NAV-05); Stone
 * Factory is drawn faded in the design, so it is shown as not available yet. Every tile except Stone
 * Factory uses the owner's design SVGs (setup-icons.tsx, 2026-10-20/21).
 */
export const setupLandingTiles: (SetupLinkDestination | SetupMasterCodeEntry | SetupUnavailableEntry)[] = [
  { kind: "link", id: "company-profile", label: "Company Profile", href: "/setup/company-profile", icon: CompanyProfileIcon, color: "indigo", permission: ["company-profile"] },
  { kind: "link", id: "user-permission", label: "User and Permission", href: "/setup/user-permission", icon: UserPermissionIcon, color: "green", permission: ["user-and-permission"] },
  placeholder("notifications", NotificationsIcon, "red"),
  { kind: "master-code", id: "master-code", label: "Master Code", icon: MasterCodeIcon, color: "neutral", permission: MASTER_CODE_MENU_KEYS },
  // document-setup UI rev 1 (owner 2026-10-23): real page, gated by the new `document-setup` leaf.
  { kind: "link", id: "document-setup", label: "Document Setup", href: "/setup/document-setup", icon: DocumentSetupIcon, color: "blue", permission: ["document-setup"] },
  { kind: "unavailable", id: "stone-factory", label: "Stone Factory", icon: Factory, color: "stone" },
];

/**
 * Master Code modal tiles (S4). Partner Master opens the Vendor page (Q-NAV-04); the rest are placeholders.
 * Icons: the owner's design SVGs (setup-icons.tsx, 2026-10-20).
 */
export const masterCodeDestinations: SetupLinkDestination[] = [
  // Shown with VIEW on Vendor or Customer; the dialog opens Customer when only that one is allowed.
  { kind: "link", id: "partner-master", label: "Partner Master", href: "/setup/vendor", icon: PartnerMasterIcon, color: "neutral", permission: ["vendor", "customer"] },
  placeholder("currency", CurrencyIcon, "neutral"),
  // stone-master FE-SM-002: real pages (Stone Group first); `stone-master:VIEW` (Q-SM-04).
  { kind: "link", id: "stone-master", label: "Stone Master", href: stonePageHref(DEFAULT_STONE_SLUG), icon: StoneMasterIcon, color: "neutral", permission: [STONE_MENU_KEY] },
  placeholder("location-master", LocationMasterIcon, "neutral"),
  placeholder("certificate-master", CertificateMasterIcon, "neutral"),
  placeholder("labor-name", ServiceFeeIcon, "neutral"),
  placeholder("sale-person", SalePersonIcon, "neutral"),
];
