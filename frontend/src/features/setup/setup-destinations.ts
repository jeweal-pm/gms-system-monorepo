import { Banknote, Bell, CodeXml, Crown, Factory, FileBadge, FileCog, FileUser, MapPinned, Pickaxe, Settings, UserLock, UserRound, type LucideIcon } from "lucide-react";
import { MASTER_CODE_MENU_KEYS, menuKeyFor, setupPlaceholderLink } from "@/features/home/navigation";

/** Tile square colors (design-system tokens, owner design 2026-10-16). */
export type SetupTileColor = "indigo" | "green" | "red" | "blue" | "stone" | "neutral";

/** `permission`: catalog keys; the tile shows when the user has VIEW on any (owner 2026-10-17). Undefined = always. */
export type SetupLinkDestination = { kind: "link"; id: string; label: string; href: string; icon: LucideIcon; color: SetupTileColor; permission?: readonly string[] };
export type SetupMasterCodeEntry = { kind: "master-code"; id: string; label: string; icon: LucideIcon; color: SetupTileColor; permission?: readonly string[] };
/** Shown faded and not clickable until the page exists (Stone Factory in the 2026-10-16 design). */
export type SetupUnavailableEntry = { kind: "unavailable"; id: string; label: string; icon: LucideIcon; color: SetupTileColor; permission?: readonly string[] };

const permissionFor = (id: string): readonly string[] | undefined => {
  const key = menuKeyFor(id);
  return key ? [key] : undefined;
};

const placeholder = (slug: Parameters<typeof setupPlaceholderLink>[0], icon: LucideIcon, color: SetupTileColor): SetupLinkDestination => ({
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
 * Factory is drawn faded in the design, so it is shown as not available yet.
 */
export const setupLandingTiles: (SetupLinkDestination | SetupMasterCodeEntry | SetupUnavailableEntry)[] = [
  { kind: "link", id: "company-profile", label: "Company Profile", href: "/setup/company-profile", icon: Settings, color: "indigo", permission: ["company-profile"] },
  { kind: "link", id: "user-permission", label: "User and Permission", href: "/setup/user-permission", icon: UserLock, color: "green", permission: ["user-and-permission"] },
  placeholder("notifications", Bell, "red"),
  { kind: "master-code", id: "master-code", label: "Master Code", icon: CodeXml, color: "neutral", permission: MASTER_CODE_MENU_KEYS },
  placeholder("document-setup", FileCog, "blue"),
  { kind: "unavailable", id: "stone-factory", label: "Stone Factory", icon: Factory, color: "stone" },
];

/** Master Code modal tiles (S4). Partner Master opens the Vendor page (Q-NAV-04); the rest are placeholders. */
export const masterCodeDestinations: SetupLinkDestination[] = [
  // Shown with VIEW on Vendor or Customer; the dialog opens Customer when only that one is allowed.
  { kind: "link", id: "partner-master", label: "Partner Master", href: "/setup/vendor", icon: FileUser, color: "neutral", permission: ["vendor", "customer"] },
  placeholder("currency", Banknote, "neutral"),
  placeholder("stone-master", Crown, "neutral"),
  placeholder("location-master", MapPinned, "neutral"),
  placeholder("certificate-master", FileBadge, "neutral"),
  placeholder("labor-name", Pickaxe, "neutral"),
  // Lucide has no user-with-$ glyph; UserRound is the closest installed icon.
  placeholder("sale-person", UserRound, "neutral"),
];
