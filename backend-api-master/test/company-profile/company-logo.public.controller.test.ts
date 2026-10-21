import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import type { CompanyProfileService } from "../../src/company-profile/company-profile.service";
import type { MasterTrpcHandler } from "../../src/master/trpc-handler";
import { CompanyLogoPublicController } from "../../src/company-profile/company-logo.public.controller";
import { PUBLIC_ROUTE } from "../../src/internal-auth/public.decorator";

function responseMock() {
  const response = { headers: new Map<string, string>(), statusCode: 0, data: undefined as Buffer | undefined,
    setHeader(name: string, value: string) { this.headers.set(name, value); return this; },
    status(code: number) { this.statusCode = code; return this; },
    end(data?: Buffer) { this.data = data; return this; },
  };
  return response as unknown as Response & { headers: Map<string, string>; statusCode: number; data?: Buffer };
}

const requestContext = (csrfVerified = true) => ({
  principal: { userId: "admin", sessionId: "session", isSuperAdmin: true, grants: [] },
  authorization: "CURRENT" as const, license: "ELIGIBLE" as const, csrfVerified,
});

describe("CompanyLogoPublicController", () => {
  it("uses its own JWT/grant boundary instead of the internal service-token guard", () => {
    expect(Reflect.getMetadata(PUBLIC_ROUTE, CompanyLogoPublicController)).toBe(true);
  });

  it("checks current VIEW authority and streams the stored versioned logo", async () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff]);
    const profile = { getLogo: vi.fn().mockResolvedValue({ data: bytes, contentType: "image/jpeg", version: "v1" }) };
    const auth = { createContext: vi.fn().mockResolvedValue(requestContext()) };
    const response = responseMock();
    await new CompanyLogoPublicController(profile as unknown as CompanyProfileService, auth as unknown as MasterTrpcHandler).get({ query: { v: "v1" } } as unknown as Request, response);
    expect(auth.createContext).toHaveBeenCalledOnce();
    expect(profile.getLogo).toHaveBeenCalledOnce();
    expect(response.data).toBe(bytes);
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(response.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
  });

  it("accepts a CSRF-verified JPEG/PNG only with the expected version precondition", async () => {
    const profile = { putLogo: vi.fn().mockResolvedValue({ profile: { version: 3 } }) };
    const auth = { createContext: vi.fn().mockResolvedValue(requestContext()) };
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const request = { method: "PUT", headers: { origin: "http://localhost:3000", "x-gms-csrf": "1", "content-type": "image/png" }, body: bytes } as unknown as Request;
    await expect(new CompanyLogoPublicController(profile as unknown as CompanyProfileService, auth as unknown as MasterTrpcHandler).put(request, { expectedVersion: "2" })).resolves.toEqual({ profile: { version: 3 } });
    expect(profile.putLogo).toHaveBeenCalledWith("admin", 2, "image/png", bytes);
    const deniedAuth = { createContext: vi.fn().mockResolvedValue(requestContext(false)) };
    await expect(new CompanyLogoPublicController(profile as unknown as CompanyProfileService, deniedAuth as unknown as MasterTrpcHandler).put(request, { expectedVersion: "2" })).rejects.toMatchObject({ code: "FORBIDDEN", message: "CSRF_INVALID" });
  });
});
