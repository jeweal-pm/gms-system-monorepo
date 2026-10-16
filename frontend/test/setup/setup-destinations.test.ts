import { describe, expect, it } from "vitest";
import { moduleBreadcrumbs } from "@/features/home/navigation";
import { setupLandingTiles } from "@/features/setup/setup-destinations";

/** UT-NAV-F01…F03: Setup landing tiles (owner design 2026-10-16). */

describe("setupLandingTiles", () => {
  it("UT-NAV-F01 lists the six tiles in the design order with their colors", () => {
    expect(setupLandingTiles.map((tile) => [tile.label, tile.kind, tile.color])).toEqual([
      ["Company Profile", "link", "indigo"],
      ["User and Permission", "link", "green"],
      ["Notifications", "link", "red"],
      ["Master Code", "master-code", "neutral"],
      ["Document Setup", "link", "blue"],
      ["Stone Factory", "unavailable", "stone"],
    ]);
  });

  it("UT-NAV-F02 links Document Setup to its placeholder under Setup", () => {
    const tile = setupLandingTiles.find((entry) => entry.id === "document-setup");
    expect(tile && "href" in tile ? tile.href : null).toBe("/modules/document-setup");
    expect(moduleBreadcrumbs("document-setup")).toEqual({
      label: "Document Setup",
      breadcrumbs: [{ label: "Home", href: "/" }, { label: "Setup", href: "/setup" }, { label: "Document Setup" }],
    });
  });

  it("UT-NAV-F03 gives Stone Factory no destination", () => {
    expect(setupLandingTiles.find((entry) => entry.id === "stone-factory")).not.toHaveProperty("href");
  });
});
