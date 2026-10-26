import { describe, expect, it } from "vitest";
import { partnerDrawerId } from "@/features/partner/components/partner-drawer";
import { canViewWith, contextNavFor, navigationGroups, visibleContextGroups } from "@/features/home/navigation";
import { masterCodeDestinations } from "@/features/setup/setup-destinations";
import { mapDeleteError, mapSaveError, optionLabel, partCode, referencedIds, rowText, shownAutoCode, sizeAfterShapeChange, sizesForShape, toDuplicateValues, toFormValues, toInput, type StoneDetail } from "@/features/stone-master/api";
import { STONE_PAGES, stonePageBySlug, stonePageHref } from "@/features/stone-master/kinds";
import { emptyStoneForm, stoneFormIssues } from "@/features/stone-master/schema";
import { buildAutoCode, DEFAULT_PART_ORDER, isPartRequired, moveItem, sizePartCode } from "@/features/stone-master/stone-code";
import { gatewayError } from "../partner/helpers";

/** UT-SM-01…09: Stone Master pages (stone-master UI revision 1, testing.md). */

const ID = "11111111-1111-4111-8111-111111111111";

describe("pages (UT-SM-01)", () => {
  it("nine pages with unique slugs, all gated by stone-master", () => {
    expect(STONE_PAGES.map((page) => page.slug)).toEqual(["stone-group", "stone-name", "size", "shape", "color", "cutting", "clarity", "quality", "stone-code"]);
    expect(new Set(STONE_PAGES.map((page) => page.entity.key))).toEqual(new Set(["stone-master"]));
    expect(stonePageBySlug("stone-code")?.navLabel).toBe("Stone Code");
    expect(stonePageBySlug("nope")).toBeUndefined();
    expect(stonePageHref("size")).toBe("/setup/stone-master/size");
  });

  it("drawer ids have no spaces (aria-controls)", () => {
    expect(partnerDrawerId(STONE_PAGES[0].entity)).toBe("stone-groups-drawer");
    expect(partnerDrawerId({ key: "vendor", singular: "Vendor", plural: "Vendors" })).toBe("vendors-drawer");
  });
});

describe("form rules (UT-SM-02)", () => {
  const values = (patch: Partial<ReturnType<typeof emptyStoneForm>>) => ({ ...emptyStoneForm(), ...patch });
  const paths = (fields: Parameters<typeof stoneFormIssues>[0], patch: Partial<ReturnType<typeof emptyStoneForm>>) => stoneFormIssues(fields, values(patch)).map((issue) => issue.path);

  it("code and name", () => {
    expect(paths("simple", {})).toEqual(["code", "name"]);
    expect(paths("simple", { code: "DIA", name: "Diamond" })).toEqual([]);
    expect(paths("simple", { code: "A B", name: "x" })).toEqual(["code"]);
    expect(paths("simple", { code: "X".repeat(21), name: "x" })).toEqual(["code"]);
  });

  it("stone name group and HSN; shape sizes", () => {
    expect(paths("stoneName", { code: "RUB", name: "Ruby" })).toEqual(["groupId"]);
    expect(paths("stoneName", { code: "RUB", name: "Ruby", groupId: ID, hsn: "71A3" })).toEqual(["hsn"]);
    expect(paths("stoneName", { code: "RUB", name: "Ruby", groupId: ID, hsn: "" })).toEqual([]);
    expect(paths("shape", { code: "RD", name: "Round" })).toEqual(["sizeIds"]);
  });

  it("the parts at #1 and #2 are required wherever they are moved (owner 2026-10-20)", () => {
    const parts = { stoneNameId: ID, shapeId: ID, colorId: ID };
    const order: ReturnType<typeof emptyStoneForm>["partOrder"] = ["name", "clarity", "shape", "color", "cutting", "size", "quality"];
    expect(paths("stoneCode", { ...parts, partOrder: order })).toEqual(["clarityId"]);
    expect(paths("stoneCode", { ...parts, partOrder: order, clarityId: ID })).toEqual([]);
    expect(isPartRequired("clarity", order)).toBe(true);
    expect(isPartRequired("size", order)).toBe(false);
    expect(isPartRequired("color", order)).toBe(false);
    expect(isPartRequired("name", order)).toBe(true);
  });

  it("stone code required parts; manual code only in MANUAL mode", () => {
    // Owner 2026-10-20: only #1 and #2 are required; in the default order those are Name and Size.
    expect(paths("stoneCode", {})).toEqual(["stoneNameId", "sizeId"]);
    const parts = { stoneNameId: ID, sizeId: ID };
    expect(paths("stoneCode", { ...parts, mode: "AUTO", code: "" })).toEqual([]);
    expect(paths("stoneCode", { ...parts, mode: "MANUAL", code: "" })).toEqual(["code"]);
    expect(paths("stoneCode", { ...parts, mode: "MANUAL", code: "SAP-BLUE-2MM" })).toEqual([]);
  });
});

describe("stone code helpers (UT-SM-03/04)", () => {
  it("auto code follows the order and skips empty parts", () => {
    // Owner 2026-10-19 format "xx-xxxxxx": first two together, "-", then the rest without separators.
    expect(buildAutoCode(DEFAULT_PART_ORDER, { name: "RUB", size: "1.0", shape: "RD", color: "D", cutting: "EX" })).toBe("RUB1.0-RDDEX");
    expect(buildAutoCode(["shape", "name", "size", "color", "cutting", "clarity", "quality"], { name: "RUB", shape: "OV", color: "RED" })).toBe("OVRUB-RED");
    expect(buildAutoCode(DEFAULT_PART_ORDER, { name: "RUB", shape: "OV" })).toBe("RUBOV");
    expect(buildAutoCode(DEFAULT_PART_ORDER, {})).toBe("");
  });

  it("moveItem moves and clamps", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, -5)).toEqual(["c", "a", "b"]);
    expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]);
  });
});

describe("size in shape (UT-SM-05)", () => {
  const options = {
    size: [{ id: "s1", code: "1.0", name: "1.0 mm", active: true }, { id: "s2", code: "2.5", name: "2.5 mm", active: true }],
    shape: [{ id: "rd", code: "RD", name: "Round", active: true, sizeIds: ["s1"] }, { id: "ov", code: "OV", name: "Oval", active: true, sizeIds: ["s1", "s2"] }],
  };

  it("offers only the chosen shape's sizes; none before a shape", () => {
    expect(sizesForShape(options, "rd").map((option) => option.id)).toEqual(["s1"]);
    expect(sizesForShape(options, "ov").map((option) => option.id)).toEqual(["s1", "s2"]);
    expect(sizesForShape(options, "")).toEqual([]);
  });

  it("changing the shape clears a size the new shape doesn't have", () => {
    expect(sizeAfterShapeChange(options, "rd", "s2")).toBe("");
    expect(sizeAfterShapeChange(options, "ov", "s2")).toBe("s2");
    expect(sizeAfterShapeChange(options, "rd", "")).toBe("");
  });
});

describe("mapping (UT-SM-06)", () => {
  const stoneCode: StoneDetail = {
    id: ID, code: "RD-1.0-RD-D", active: true, updatedAt: "2026-10-19T00:00:00.000Z", mode: "AUTO",
    parts: { stoneNameId: "n", sizeId: null, shapeId: "s", colorId: "c", cuttingId: null, clarityId: null, qualityId: null },
    partOrder: [...DEFAULT_PART_ORDER],
  };

  it("form ↔ input: uppercase codes, empty HSN → null, empty parts → null, manual code only in MANUAL", () => {
    expect(toInput("simple", { ...emptyStoneForm(), code: " dia ", name: " Diamond " })).toEqual({ code: "DIA", name: "Diamond", active: true });
    expect(toInput("stoneName", { ...emptyStoneForm(), code: "rub", name: "Ruby", groupId: ID, hsn: " " })).toMatchObject({ hsn: null, groupId: ID });
    const auto = toInput("stoneCode", toFormValues("stoneCode", stoneCode));
    expect(auto).not.toHaveProperty("code");
    expect(auto).toMatchObject({ mode: "AUTO", parts: { sizeId: null, cuttingId: null, shapeId: "s" } });
    expect(toInput("stoneCode", { ...toFormValues("stoneCode", stoneCode), mode: "MANUAL", code: "sap-1" })).toMatchObject({ code: "SAP-1" });
  });

  it("duplicate clears the code; referenced ids are sent as include", () => {
    expect(toDuplicateValues("stoneCode", stoneCode).code).toBe("");
    expect(referencedIds("stoneCode", stoneCode)).toEqual(["n", "s", "c"]);
    expect(referencedIds("simple", stoneCode)).toEqual([]);
  });

  it("row text per page: code first, then name (owner 2026-10-23); a size shows only its name", () => {
    expect(rowText("simple", { id: ID, code: "E", name: "Excellent", active: true })).toEqual({ primary: "E", secondary: "Excellent" });
    expect(rowText("stoneName", { id: ID, code: "RD", name: "Round Diamond", active: true, hsn: "7102", group: { code: "DIA", name: "Diamond" } }))
      .toEqual({ primary: "RD", secondary: "Round Diamond · DIA · Diamond · HSN 7102" });
    expect(rowText("shape", { id: ID, code: "RD", name: "Round", active: true, sizeCount: 1 })).toEqual({ primary: "RD", secondary: "Round · 1 size" });
    expect(rowText("size", { id: ID, code: null, name: "2.0 mm", active: true })).toEqual({ primary: "2.0 mm", secondary: "" });
    expect(rowText("stoneCode", { id: ID, code: "RD-1.0", name: "", active: true, mode: "MANUAL", stoneName: { code: "RD", name: "Round Diamond" } })).toEqual({ primary: "RD-1.0", secondary: "Round Diamond · Manual code" });
  });
});

describe("size name only and saved auto codes (UT-SM-10, owner 2026-10-23)", () => {
  const saved: StoneDetail = {
    id: ID, code: "R2-DISDEVVSSQAAA", active: true, updatedAt: "2026-10-23T00:00:00.000Z", mode: "AUTO",
    parts: { stoneNameId: "n", sizeId: "s", shapeId: "sh", colorId: "c", cuttingId: null, clarityId: null, qualityId: null },
    partOrder: ["color", "size", "name", "shape", "cutting", "clarity", "quality"],
  };

  it("a size form has only a name; the input sends name + active", () => {
    const paths = (patch: Partial<ReturnType<typeof emptyStoneForm>>) => stoneFormIssues("size", { ...emptyStoneForm(), ...patch }).map((issue) => issue.path);
    expect(paths({})).toEqual(["name"]);
    expect(paths({ name: "2.0 mm" })).toEqual([]);
    expect(paths({ name: "2.0 × 3.0" })).toEqual(["name"]);
    expect(paths({ name: "x".repeat(21) })).toEqual(["name"]);
    expect(toInput("size", { ...emptyStoneForm(), code: "X", name: " 2.0 mm " })).toEqual({ name: "2.0 mm", active: true });
    expect(toDuplicateValues("size", { id: ID, name: "2.0 mm", active: true, updatedAt: "2026-10-23T00:00:00.000Z" })).toMatchObject({ name: "", code: "" });
    expect(stonePageBySlug("size")?.fields).toBe("size");
  });

  it("a size option is labelled and coded by its name", () => {
    const size = { id: "s", name: "2.0 mm", active: true };
    expect(optionLabel(size)).toBe("2.0 mm");
    expect(optionLabel({ id: "c", code: "RED", name: "Red", active: false })).toBe("RED · Red (inactive)");
    expect(partCode("size", size)).toBe("2.0MM");
    expect(partCode("color", { id: "c", code: "RED", name: "Red", active: true })).toBe("RED");
    expect(partCode("color", undefined)).toBeUndefined();
    expect(sizePartCode(" 1.0 mm ")).toBe("1.0MM");
  });

  it("viewing shows the saved auto code; create/edit (no viewed record) show the live code", () => {
    expect(shownAutoCode(saved, "GRL2-DISDEVVSSQAAA")).toBe("R2-DISDEVVSSQAAA");
    expect(shownAutoCode({ ...saved, mode: "MANUAL" }, "LIVE")).toBe("LIVE");
    expect(shownAutoCode(undefined, "GRL2-DISDEVVSSQAAA")).toBe("GRL2-DISDEVVSSQAAA");
  });

  it("a taken size name is reported on the name field", () => {
    expect(mapSaveError(gatewayError({ domainCode: "STONE_MASTER_CODE_TAKEN", httpStatus: 409, code: "CONFLICT", fieldErrors: [{ path: "name", code: "duplicate" }] }), "size").fieldErrors)
      .toEqual([{ name: "name", message: "This name is already used" }]);
  });
});

describe("errors (UT-SM-07)", () => {
  it("save errors map to fields or banners", () => {
    expect(mapSaveError(gatewayError({ domainCode: "STONE_MASTER_CODE_TAKEN", httpStatus: 409, code: "CONFLICT" }), "simple").fieldErrors).toEqual([{ name: "code", message: "This code is already used" }]);
    expect(mapSaveError(gatewayError({ domainCode: "STONE_MASTER_REFERENCE_INVALID", httpStatus: 422, code: "UNPROCESSABLE_CONTENT", fieldErrors: [{ path: "parts.sizeId", code: "invalid_reference" }] }), "stoneCode"))
      .toMatchObject({ fieldErrors: [{ name: "sizeId" }], refetchOptions: true });
    expect(mapSaveError(gatewayError({ domainCode: "STONE_MASTER_CHANGED", httpStatus: 409, code: "CONFLICT" }), "simple")).toMatchObject({ stale: true });
    expect(mapSaveError(gatewayError({ domainCode: "STONE_MASTER_NOT_FOUND", httpStatus: 404, code: "NOT_FOUND" }), "simple")).toMatchObject({ notFound: true });
    expect(mapSaveError(gatewayError({ domainCode: "PERMISSION_DENIED", httpStatus: 403, code: "FORBIDDEN" }), "simple")).toMatchObject({ recheckAccess: true });
  });

  it("delete in use stays in the dialog; gone closes it", () => {
    expect(mapDeleteError(gatewayError({ domainCode: "STONE_MASTER_IN_USE", httpStatus: 409, code: "CONFLICT" }), "Stone Group")).toEqual({ kind: "dialog", message: "This stone group is used by other records. Turn off Active instead." });
    expect(mapDeleteError(gatewayError({ domainCode: "STONE_MASTER_NOT_FOUND", httpStatus: 404, code: "NOT_FOUND" }), "Size").kind).toBe("gone");
  });
});

describe("navigation (UT-SM-08)", () => {
  const can = (permissions: string[]) => (permission: readonly string[] | undefined) => canViewWith({ isSuperAdmin: false, permissions }, permission);

  it("Stone Master context group shows its nine pages only with stone-master:VIEW", () => {
    const nav = contextNavFor("/setup/stone-master/shape");
    // Stone pages show only the Stone Master group (owner 2026-10-19); vendor pages only Partner master.
    expect(nav?.groups.map((group) => group.id)).toEqual(["stone-master"]);
    expect(contextNavFor("/setup/vendor")?.groups.map((group) => group.id)).toEqual(["partner-master"]);
    const withView = visibleContextGroups(nav!, can(["stone-master:VIEW"])).find((group) => group.id === "stone-master");
    expect(withView?.children.map((child) => child.href)).toEqual(STONE_PAGES.map((page) => stonePageHref(page.slug)));
    expect(visibleContextGroups(nav!, can(["vendor:VIEW"])).some((group) => group.id === "stone-master")).toBe(false);
  });

  it("Master Code tile and Home shortcuts open the real pages", () => {
    const tile = masterCodeDestinations.find((destination) => destination.id === "stone-master");
    expect(tile).toMatchObject({ href: "/setup/stone-master/stone-group", permission: ["stone-master"] });
    const group = navigationGroups.find((entry) => entry.title === "Stone Master");
    expect(group?.items.map((item) => item.href)).toEqual(STONE_PAGES.map((page) => stonePageHref(page.slug)));
  });
});
