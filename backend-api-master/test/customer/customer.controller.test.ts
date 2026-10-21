import "reflect-metadata";
import { RequestMethod } from "@nestjs/common";
import { HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import type { Request } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerController } from "../../src/customer/customer.controller";
import type { CustomerService } from "../../src/customer/customer.service";
import { customerBody, failure, withVersion } from "../partner-shared/fixtures";

/** UT-CUS-P70…P76: internal REST controller — route table/order, actor header, JSON body, path id, query parsing. */

vi.mock("../../src/database/prisma-client", async () => (await import("../partner-shared/prisma-fake")).prismaModule);

const ID = "0b9f3c4e-1d2a-4b3c-8d4e-5f6a7b8c9d0e";

const service = {
  list: vi.fn(), options: vi.fn(), nextCode: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(),
};
const controller = new CustomerController(service as unknown as CustomerService);

function request({ actor = "user-1", json = true }: { actor?: string | null; json?: boolean } = {}) {
  return {
    headers: actor === null ? {} : { "x-actor-user-id": actor },
    is: (type: string) => (json && type === "application/json" ? type : false),
  } as unknown as Request;
}

beforeEach(() => {
  for (const fn of Object.values(service)) fn.mockReset().mockResolvedValue({ ok: true });
});

describe("route table", () => {
  it("UT-CUS-P70 mounts under internal/v1/customers and declares options and next-code before :id", () => {
    expect(Reflect.getMetadata(PATH_METADATA, CustomerController)).toBe("internal/v1/customers");
    const routes = Object.getOwnPropertyNames(CustomerController.prototype)
      .filter((name) => name !== "constructor")
      .map((name) => {
        const handler = (CustomerController.prototype as unknown as Record<string, object>)[name];
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
});

describe("handlers", () => {
  it("UT-CUS-P71 list parses the query (limit as number) and rejects bad parameters", async () => {
    await controller.list({ q: " acme ", limit: "10" });
    expect(service.list).toHaveBeenCalledWith({ q: "acme", limit: 10 });
    expect(await failure(() => controller.list({ limit: "51" }))).toMatchObject({ status: 400, code: "VALIDATION_ERROR", fieldErrors: [{ path: "limit", code: "too_big" }] });
  });

  it("UT-CUS-P72 nextCode and options call the service without input", async () => {
    await controller.nextCode();
    await controller.options();
    expect(service.nextCode).toHaveBeenCalledWith();
    expect(service.options).toHaveBeenCalledWith();
  });

  it("UT-CUS-P73 get requires a UUID path id", async () => {
    await controller.get(ID);
    expect(service.get).toHaveBeenCalledWith(ID);
    expect(await failure(() => controller.get("next"))).toEqual({ status: 400, code: "VALIDATION_ERROR", fieldErrors: [{ path: "id", code: "invalid_format" }] });
  });

  it("UT-CUS-P74 create needs the actor header and a JSON body, then passes the parsed body", async () => {
    expect(await failure(() => controller.create(request({ actor: null }), customerBody()))).toMatchObject({ status: 400, fieldErrors: [{ path: "(header).x-actor-user-id", code: "invalid" }] });
    expect(await failure(() => controller.create(request({ actor: "bad actor!" }), customerBody()))).toMatchObject({ status: 400 });
    expect(await failure(() => controller.create(request({ json: false }), customerBody()))).toMatchObject({ status: 415, code: "UNSUPPORTED_MEDIA_TYPE" });
    expect(await failure(() => controller.create(request(), customerBody({ code: " " })))).toMatchObject({ status: 400, fieldErrors: [{ path: "code", code: "required" }] });
    expect(service.create).not.toHaveBeenCalled();
    await controller.create(request(), customerBody({ email: "A@B.CO" }));
    expect(service.create).toHaveBeenCalledWith("user-1", expect.objectContaining({ email: "a@b.co" }));
  });

  it("UT-CUS-P75 update checks actor, path id, JSON and body before the service", async () => {
    expect(await failure(() => controller.update(request(), "x", withVersion(customerBody())))).toMatchObject({ status: 400, fieldErrors: [{ path: "id", code: "invalid_format" }] });
    expect(await failure(() => controller.update(request(), ID, customerBody()))).toMatchObject({ status: 400, fieldErrors: [{ path: "expectedUpdatedAt", code: "invalid_type" }] });
    expect(service.update).not.toHaveBeenCalled();
    await controller.update(request(), ID, withVersion(customerBody()));
    expect(service.update).toHaveBeenCalledWith("user-1", ID, expect.objectContaining({ expectedUpdatedAt: "2026-10-16T00:00:00.000Z" }));
  });

  it("UT-CUS-P76 delete needs the actor header and a UUID", async () => {
    expect(await failure(() => controller.delete(request({ actor: null }), ID))).toMatchObject({ status: 400 });
    expect(await failure(() => controller.delete(request(), "1"))).toMatchObject({ status: 400 });
    await controller.delete(request(), ID);
    expect(service.delete).toHaveBeenCalledWith("user-1", ID);
  });
});
