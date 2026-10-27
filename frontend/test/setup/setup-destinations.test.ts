import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { contextNavFor, moduleBreadcrumbs } from "@/features/home/navigation";
import { masterCodeDestinations, setupLandingTiles } from "@/features/setup/setup-destinations";

/** UT-NAV-F01…F05: Setup landing tiles and Master Code modal tiles (owner design 2026-10-16). */

describe("masterCodeDestinations", () => {
  it("UT-NAV-F05 every tile uses its design icon; Labor Name is shown as Service Fee (owner 2026-10-20)", () => {
    const tiles = masterCodeDestinations.map((tile) => {
      const html = renderToStaticMarkup(createElement(tile.icon, { size: 26, strokeWidth: 1.5 }));
      return [tile.id, tile.label, html.match(/data-icon="([^"]+)"/)?.[1], html.includes('viewBox="0 0 24 24"')];
    });
    expect(tiles).toEqual([
      ["partner-master", "Partner Master", "partner-master", true],
      ["currency", "Currency", "currency", true],
      ["stone-master", "Stone Master", "stone-master", true],
      ["location-master", "Location Master", "location-master", true],
      ["certificate-master", "Certificate Master", "certificate-master", true],
      ["labor-name", "Service Fee", "service-fee", true],
      ["sale-person", "Sale Person", "sale-person", true],
    ]);
    expect(moduleBreadcrumbs("labor-name")?.label).toBe("Service Fee");
  });

  it("UT-NAV-F07 links Currency to its real page and context panel, gated by the currency leaf (currency UI rev 1)", () => {
    const tile = masterCodeDestinations.find((entry) => entry.id === "currency");
    expect(tile).toMatchObject({ kind: "link", href: "/setup/currency", permission: ["currency"] });
    const nav = contextNavFor("/setup/currency");
    expect(nav?.id).toBe("setup-currency");
    expect(nav?.groups[0]?.children.map((child) => [child.label, child.href, child.permission])).toEqual([["Currency", "/setup/currency", ["currency"]]]);
  });

  it("UT-NAV-F06 per-path stroke weights and the filled Service Fee shape are kept", () => {
    const currency = masterCodeDestinations.find((tile) => tile.id === "currency");
    const fee = masterCodeDestinations.find((tile) => tile.id === "labor-name");
    const html = (tile: typeof currency) => (tile ? renderToStaticMarkup(createElement(tile.icon, { size: 24 })) : "");
    expect(html(currency).match(/stroke-width="1.25"/g)).toHaveLength(2);
    expect(html(fee)).toContain('fill="currentColor"');
    expect(html(fee)).toContain('stroke="none"');
    expect(html(fee)).not.toContain("#1C252E");
  });
});

describe("setupLandingTiles", () => {
  it("UT-NAV-F01 lists the tiles in the design order with their colors (Decimal Setup added 2026-10-27)", () => {
    expect(setupLandingTiles.map((tile) => [tile.label, tile.kind, tile.color])).toEqual([
      ["Company Profile", "link", "indigo"],
      ["User and Permission", "link", "green"],
      ["Notifications", "link", "red"],
      ["Master Code", "master-code", "neutral"],
      ["Document Setup", "link", "blue"],
      ["Decimal Setup", "link", "blue"],
      ["Stone Factory", "unavailable", "stone"],
    ]);
  });

  it("UT-DEC-05 links Decimal Setup to its page, gated by document-setup until it has its own leaf (Q-DEC-05)", () => {
    const tile = setupLandingTiles.find((entry) => entry.id === "decimal-setup");
    expect(tile && "href" in tile ? tile.href : null).toBe("/setup/decimal-setup");
    expect(tile?.permission).toEqual(["document-setup"]);
  });

  it("UT-NAV-F02 links Document Setup to its real page, gated by the document-setup leaf (UI rev 1)", () => {
    const tile = setupLandingTiles.find((entry) => entry.id === "document-setup");
    expect(tile && "href" in tile ? tile.href : null).toBe("/setup/document-setup");
    expect(tile?.permission).toEqual(["document-setup"]);
    expect(moduleBreadcrumbs("document-setup")).toEqual({
      label: "Document Setup",
      breadcrumbs: [{ label: "Home", href: "/" }, { label: "Setup", href: "/setup" }, { label: "Document Setup" }],
    });
  });

  it("UT-NAV-F03 gives Stone Factory no destination", () => {
    expect(setupLandingTiles.find((entry) => entry.id === "stone-factory")).not.toHaveProperty("href");
  });

  it("UT-NAV-F04 every tile but Stone Factory uses its design icon (owner 2026-10-20/21)", () => {
    const render = (id: string) => {
      const tile = setupLandingTiles.find((entry) => entry.id === id);
      return tile ? renderToStaticMarkup(createElement(tile.icon, { size: 32, strokeWidth: 1.5 })) : "";
    };
    for (const id of ["company-profile", "user-permission", "notifications", "master-code", "document-setup"]) {
      const html = render(id);
      expect(html).toContain(`data-icon="${id}"`);
      expect(html).toContain('viewBox="0 0 32 32"');
      expect(html).toContain('stroke="currentColor"');
      expect(html).toContain('stroke-width="2"');
      expect(html).not.toContain("#FCFCFC");
    }
  });
});
