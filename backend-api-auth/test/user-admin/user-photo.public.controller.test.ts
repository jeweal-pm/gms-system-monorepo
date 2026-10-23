import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { UserPhotoPublicController } from "../../src/user-admin/user-photo.public.controller";
import type { UserAdminService } from "../../src/user-admin/user-admin.service";

function responseMock() {
  const response = { headers: new Map<string, string>(), statusCode: 0, data: undefined as Buffer | undefined,
    setHeader(name: string, value: string) { this.headers.set(name, value); return this; },
    status(code: number) { this.statusCode = code; return this; },
    end(data?: Buffer) { this.data = data; return this; },
  };
  return response as unknown as Response & { headers: Map<string, string>; statusCode: number; data?: Buffer };
}

describe("UserPhotoPublicController", () => {
  it("authorizes reads and returns versioned private image bytes with safe headers", async () => {
    const data = Buffer.from([0xff, 0xd8, 0xff]);
    const service = { requireAccess: vi.fn(), getPhoto: vi.fn().mockResolvedValue({ data, contentType: "image/jpeg", version: "0123456789abcdef" }) };
    const controller = new UserPhotoPublicController(service as unknown as UserAdminService);
    const response = responseMock();
    await controller.get({ query: { v: "0123456789abcdef" } } as Request, "user-1", response);
    expect(service.requireAccess).toHaveBeenCalledWith(expect.anything(), "VIEW");
    expect(response.statusCode).toBe(200);
    expect(response.data).toBe(data);
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("requires origin and CSRF marker before accepting upload bytes", async () => {
    const service = { requireAccess: vi.fn().mockResolvedValue({ id: "admin" }), putPhoto: vi.fn().mockResolvedValue({ photoVersion: "0123456789abcdef" }) };
    const controller = new UserPhotoPublicController(service as unknown as UserAdminService);
    const body = Buffer.from([0xff, 0xd8, 0xff]);
    const request = { method: "PUT", headers: { origin: "http://localhost:3000", "x-gms-csrf": "1", "content-type": "image/jpeg" }, body } as unknown as Request;
    await expect(controller.put(request, "user-2")).resolves.toEqual({ photoVersion: "0123456789abcdef" });
    expect(service.requireAccess).toHaveBeenCalledWith(request, "EDIT");
    expect(service.putPhoto).toHaveBeenCalledWith({ id: "admin" }, "user-2", "image/jpeg", body);
    const rejected = { ...request, headers: { "content-type": "image/jpeg" } } as unknown as Request;
    await expect(controller.put(rejected, "user-2")).rejects.toMatchObject({ status: 403 });
  });
});
