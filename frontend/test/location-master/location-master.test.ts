import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contextNavFor } from "@/features/home/navigation";
import { LOCATION_ENTITY, mapDeleteError, mapSaveError, rowText, toDuplicateValues, toFormValues, toInput, type LocationDetail } from "@/features/location-master/api";
import { locationOptions, NO_LOCATION_OPTION } from "@/features/location-master/location-options";
import { emptyLocationForm, locationFormSchema } from "@/features/location-master/schema";
import { mapPurchaseOrderError } from "@/features/purchase-order/api";
import { mapPurchaseSaveError, PURCHASE_LOCATION_UNKNOWN } from "@/features/purchase/api";
import { PURCHASE_CONFIG } from "@/features/purchase/components/PurchasePage";
import { masterCodeDestinations } from "@/features/setup/setup-destinations";
import { gatewayError, issuesByPath } from "../partner/helpers";

/** UT-LM-01…04: location-master UI rev 1 (ADR-0052, owner approval 2026-11-16). */

const detail = (overrides: Partial<LocationDetail> = {}): LocationDetail => ({
  id: "00000000-0000-4000-8000-000000000001",
  name: "Safe A",
  active: true,
  createdAt: "2026-11-16T00:00:00.000Z",
  updatedAt: "2026-11-16T01:00:00.000Z",
  ...overrides,
});

describe("UT-LM-01 form schema and values", () => {
  it("requires a trimmed name of 1–40 characters", () => {
    expect(issuesByPath(locationFormSchema, { name: "Safe A", active: true })).toEqual({});
    expect(issuesByPath(locationFormSchema, { name: "   ", active: true })).toEqual({ name: "Enter a name" });
    expect(issuesByPath(locationFormSchema, { name: "x".repeat(41), active: true })).toEqual({ name: "Up to 40 characters" });
    expect(issuesByPath(locationFormSchema, { name: ` ${"x".repeat(40)} `, active: true })).toEqual({});
    expect(emptyLocationForm()).toEqual({ name: "", active: true });
  });

  it("maps the detail to form values; Duplicate keeps Active and clears Name; the input is trimmed", () => {
    expect(toFormValues(detail({ active: false }))).toEqual({ name: "Safe A", active: false });
    expect(toDuplicateValues(detail({ active: false }))).toEqual({ name: "", active: false });
    expect(toInput({ name: "  Shelf 1 ", active: true })).toEqual({ name: "Shelf 1", active: true });
  });

  it("maps save / delete domain codes to field and form messages", () => {
    expect(mapSaveError(gatewayError({ domainCode: "LOCATION_NAME_TAKEN", fieldErrors: [{ path: "name", code: "duplicate" }], httpStatus: 409 }))).toEqual({
      fieldErrors: [{ name: "name", message: "This name is already used" }],
      formError: null,
    });
    expect(mapSaveError(gatewayError({ domainCode: "LOCATION_CHANGED", httpStatus: 409 }))).toMatchObject({ stale: true });
    expect(mapSaveError(gatewayError({ domainCode: "LOCATION_NOT_FOUND", httpStatus: 404 }))).toMatchObject({ notFound: true });
    expect(mapSaveError(gatewayError({ domainCode: "VALIDATION_ERROR", fieldErrors: [{ path: "name", code: "too_big" }] }))).toEqual({
      fieldErrors: [{ name: "name", message: "Up to 40 characters" }],
      formError: null,
    });
    expect(mapSaveError(gatewayError({ domainCode: "PERMISSION_DENIED", httpStatus: 403 }))).toMatchObject({ recheckAccess: true });
    expect(mapSaveError(new Error("raw"))).toEqual({ fieldErrors: [], formError: "Couldn't save. Try again." });
    expect(mapDeleteError(gatewayError({ domainCode: "LOCATION_NOT_FOUND", httpStatus: 404 }))).toEqual({ kind: "gone", message: "This location was already deleted." });
    expect(mapDeleteError(gatewayError({ domainCode: "LOCATION_CHANGED", httpStatus: 409 }))).toMatchObject({ kind: "dialog", stale: true });
  });
});

describe("UT-LM-02 drawer and page wording", () => {
  it("shows the name only, with the shared Location wording", () => {
    expect(rowText({ id: "1", name: "Safe A", active: false })).toEqual({ primary: "Safe A", secondary: "" });
    expect(LOCATION_ENTITY).toEqual({ key: "location-master", singular: "Location", plural: "Locations" });
    const page = readFileSync("src/features/location-master/location-master-page.tsx", "utf8");
    expect(page).toContain("PartnerDrawer");
    expect(page).toContain("Search name...");
  });
});

describe("UT-LM-03 navigation", () => {
  it("the Master Code tile opens /setup/location-master, gated by the location-master leaf", () => {
    const tile = masterCodeDestinations.find((entry) => entry.id === "location-master");
    expect(tile).toMatchObject({ kind: "link", href: "/setup/location-master", permission: ["location-master"] });
    const nav = contextNavFor("/setup/location-master");
    expect(nav?.id).toBe("setup-location-master");
    expect(nav?.groups[0]?.children.map((child) => [child.label, child.href, child.permission])).toEqual([["Location Master", "/setup/location-master", ["location-master"]]]);
    // Same trail as Currency (the tab's own breadcrumbs): Home › Setup › Location Master.
    const route = readFileSync("src/app/(app)/setup/location-master/page.tsx", "utf8");
    expect(route).toContain('[{ label: "Home", href: "/" }, { label: "Setup", href: "/setup" }, { label: "Location Master" }]');
    expect(route).toContain("<LocationMasterPage />");
  });
});

describe("UT-LM-04 PO / Purchase rows choose from the master", () => {
  it("turns options.locations into dropdown choices with a blank first", () => {
    expect(locationOptions(["Safe A", "Shelf 1"])).toEqual([NO_LOCATION_OPTION, { value: "Safe A", label: "Safe A" }, { value: "Shelf 1", label: "Shelf 1" }]);
    expect(locationOptions(undefined)).toEqual([NO_LOCATION_OPTION]);
  });

  it("Purchase derives its Location choices from the loaded options; PO does the same in its own kind", () => {
    expect(PURCHASE_CONFIG.kindFromOptions?.({ locations: ["Safe"] } as never)).toEqual({ locations: [NO_LOCATION_OPTION, { value: "Safe", label: "Safe" }] });
    expect(PURCHASE_CONFIG.kindFromOptions?.(undefined)).toEqual({ locations: [NO_LOCATION_OPTION] });
    const po = readFileSync("src/features/purchase-order/components/PurchaseOrderForm.tsx", "utf8");
    expect(po).toContain("locations: locationOptions(options.data?.locations)");
    const form = readFileSync("src/features/trade-document/document-form.tsx", "utf8");
    expect(form).toContain("config.kindFromOptions(api.options)");
  });

  it("a stored name missing from the list still shows in the row's dropdown", () => {
    const panel = readFileSync("src/features/quotation/components/items/ItemEditorPanel.tsx", "utf8");
    expect(panel).toContain('options={withCurrent(kind.locations, line.locationId)}');
    expect(panel).toMatch(/current && !options\.some\(\(option\) => option\.value === current\) \? \[\{ value: current, label: current \}, \.\.\.options\]/);
  });

  it("an unknown location names its row on both documents", () => {
    const fieldErrors = [{ path: "lines.1.location", code: "unknown_location" }];
    expect(mapPurchaseOrderError(gatewayError({ domainCode: "VALIDATION_ERROR", fieldErrors }))).toMatchObject({
      message: "Row 2: choose a location from Location Master.",
      fieldErrors: [{ name: "lines", message: "Check item row 2" }],
    });
    expect(mapPurchaseSaveError(gatewayError({ domainCode: "VALIDATION_ERROR", fieldErrors: [...fieldErrors, { path: "lines.3.location", code: "unknown_location" }] }))).toEqual({
      fieldErrors: [
        { name: "lines.1.locationId", message: PURCHASE_LOCATION_UNKNOWN },
        { name: "lines.3.locationId", message: PURCHASE_LOCATION_UNKNOWN },
      ],
      message: "Rows 2, 4: choose a location from Location Master.",
    });
  });
});
