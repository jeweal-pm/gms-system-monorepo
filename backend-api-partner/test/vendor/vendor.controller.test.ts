import "reflect-metadata";
import { RequestMethod } from "@nestjs/common";
import { HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import type { Request } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VendorController } from "../../src/vendor/vendor.controller";
import type { VendorService } from "../../src/vendor/vendor.service";
import { address, failure, vendorBody, withVersion } from "../partner-shared/fixtures";

/** UT-VEN-P60…P65: vendor internal REST controller — route table/order, actor header, JSON body, path id, query. */

vi.mock("../../src/database/prisma-client", async () => (await import("../partner-shared/prisma-fake")).prismaModule);

const ID = "0b9f3c4e-1d2a-4b3c-8d4e-5f6a7b8c9d0e";
const service = { list: vi.fn(), options: vi.fn(), nextCode: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() };
const controller = new VendorController(service as unknown as VendorService);

function request({ actor = "user-1", json = true }: { actor?: string | null; json?: boolean } = {}) {
  return {
    headers: actor === null ? {} : { "x-actor-user-id": actor },
    is: (type: string) => (json && type === "application/json" ? type : false),
  } as unknown as Request;
}

beforeEach(() => {
  for (const fn of Object.values(service)) fn.mockReset().mockResolvedValue({ ok: true });
});

it("UT-VEN-P60 mounts under internal/v1/vendors and declares options and next-code before :id", () => {
  expect(Reflect.getMetadata(PATH_METADATA, VendorController)).toBe("internal/v1/vendors");
  const routes = Object.getOwnPropertyNames(VendorController.prototype)
    .filter((name) => name !== "constructor")
    .map((name) => {
      const handler = (VendorController.prototype as unknown as Record<string, object>)[name];
      return [RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as number], Reflect.getMetadata(PATH_METADATA, handler), Reflect.getMetadata(HTTP_CODE_METADATA, handler)];
    });
  expect(routes).toEqual([
    ["GET", "/", undefined],
    ["GET", "options", undefined],
    ["GET", "next-code", undefined],
    ["GET", ":id", undefined],
    ["POST", "/", 201],
    ["PUT", ":id", 200],
    ["DELETE", ":id", 200],
  ]);
});

describe("handlers", () => {
  it("UT-VEN-P61 list parses query strings and rejects arrays", async () => {
    await controller.list({ active: "true", limit: "5" });
    expect(service.list).toHaveBeenCalledWith({ active: "true", limit: 5 });
    expect(await failure(() => controller.list({ active: ["true", "false"] }))).toMatchObject({ status: 400, fieldErrors: [{ path: "active" }] });
  });

  it("UT-VEN-P62 get rejects a non-UUID id (next-code is never parsed as :id)", async () => {
    expect(await failure(() => controller.get("next-code"))).toEqual({ status: 400, code: "VALIDATION_ERROR", fieldErrors: [{ path: "id", code: "invalid_format" }] });
    await controller.get(ID);
    expect(service.get).toHaveBeenCalledWith(ID);
  });

  it("UT-VEN-P63 create checks actor, JSON and body (shippingAddresses rejected) before the service", async () => {
    expect(await failure(() => controller.create(request({ actor: null }), vendorBody()))).toMatchObject({ status: 400 });
    expect(await failure(() => controller.create(request({ json: false }), vendorBody()))).toMatchObject({ status: 415, code: "UNSUPPORTED_MEDIA_TYPE" });
    expect(await failure(() => controller.create(request(), vendorBody({ shippingAddresses: [address()] })))).toMatchObject({ status: 400, fieldErrors: [{ path: "(root)", code: "unrecognized_keys" }] });
    expect(service.create).not.toHaveBeenCalled();
    await controller.create(request(), vendorBody());
    expect(service.create).toHaveBeenCalledWith("user-1", expect.objectContaining({ code: "V001" }));
  });

  it("UT-VEN-P64 update passes the actor, id and parsed body", async () => {
    expect(await failure(() => controller.update(request({ json: false }), ID, withVersion(vendorBody())))).toMatchObject({ status: 415 });
    await controller.update(request(), ID, withVersion(vendorBody()));
    expect(service.update).toHaveBeenCalledWith("user-1", ID, expect.objectContaining({ expectedUpdatedAt: "2026-10-16T00:00:00.000Z" }));
  });

  it("UT-VEN-P65 delete and nextCode", async () => {
    await controller.delete(request(), ID);
    expect(service.delete).toHaveBeenCalledWith("user-1", ID);
    await controller.nextCode();
    expect(service.nextCode).toHaveBeenCalledWith();
  });
});
