import { Banknote, Bell, CodeXml, Crown, FileBadge, FileUser, MapPinned, Pickaxe, Settings, UserLock, UserRound, type LucideIcon } from "lucide-react";
import { setupPlaceholderLink } from "@/features/home/navigation";

/** Tile square colors (design-system tokens; Notifications uses the primary color exactly). */
export type SetupTileColor = "indigo" | "green" | "primary" | "neutral";

export type SetupLinkDestination = { kind: "link"; id: string; label: string; href: string; icon: LucideIcon; color: SetupTileColor };
export type SetupMasterCodeEntry = { kind: "master-code"; id: string; label: string; icon: LucideIcon; color: SetupTileColor };

const placeholder = (slug: Parameters<typeof setupPlaceholderLink>[0], icon: LucideIcon, color: SetupTileColor): SetupLinkDestination => ({
  kind: "link",
  id: slug,
  ...setupPlaceholderLink(slug),
  icon,
  color,
});

/** Setup landing tiles in reading order (S3). Company Profile and Notifications are placeholders (Q-NAV-05). */
export const setupLandingTiles: (SetupLinkDestination | SetupMasterCodeEntry)[] = [
  placeholder("company-profile", Settings, "indigo"),
  { kind: "link", id: "user-permission", label: "User and Permission", href: "/setup/user-permission", icon: UserLock, color: "green" },
  placeholder("notifications", Bell, "primary"),
  { kind: "master-code", id: "master-code", label: "Master Code", icon: CodeXml, color: "neutral" },
];

/** Master Code modal tiles (S4). Partner Master opens the Vendor page (Q-NAV-04); the rest are placeholders. */
export const masterCodeDestinations: SetupLinkDestination[] = [
  { kind: "link", id: "partner-master", label: "Partner Master", href: "/setup/vendor", icon: FileUser, color: "neutral" },
  placeholder("currency", Banknote, "neutral"),
  placeholder("stone-master", Crown, "neutral"),
  placeholder("location-master", MapPinned, "neutral"),
  placeholder("certificate-master", FileBadge, "neutral"),
  placeholder("labor-name", Pickaxe, "neutral"),
  // Lucide has no user-with-$ glyph; UserRound is the closest installed icon.
  placeholder("sale-person", UserRound, "neutral"),
];
