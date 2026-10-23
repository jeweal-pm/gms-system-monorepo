import "reflect-metadata";
import { APP_FILTER, APP_GUARD, NestFactory } from "@nestjs/core";
import { Module } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompanyLogoPublicController } from "../../src/company-profile/company-logo.public.controller";
import { CompanyProfileService } from "../../src/company-profile/company-profile.service";
import { createPublicLogoAccessCheck, publicLogoMethodCheck } from "../../src/company-profile/company-logo.http";
import { EnvelopeExceptionFilter } from "../../src/common/exception.filter";
import { ServiceTokenGuard } from "../../src/internal-auth/service-token.guard";
import { MasterTrpcHandler } from "../../src/master/trpc-handler";

const previousServiceToken = process.env.PARTNER_SERVICE_TOKEN;
const servers: Array<{ close(): Promise<void> }> = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  if (previousServiceToken === undefined) delete process.env.PARTNER_SERVICE_TOKEN;
  else process.env.PARTNER_SERVICE_TOKEN = previousServiceToken;
});

describe("company logo controller with actual Nest global guard", () => {
  it("IT-MASTER-LOGO-GUARD-01 denies anonymous users but accepts current user grants without service token", async () => {
    process.env.PARTNER_SERVICE_TOKEN = "guard-test-service-token-long-enough";
    const profile = { getLogo: vi.fn(async () => ({ data: Buffer.from("logo"), contentType: "image/png", version: "v1" })) };
    const authContext = { current: { principal: null, authorization: "UNAVAILABLE", license: "UNAVAILABLE", csrfVerified: false } as object | null };
    const masterTrpc = { createContext: vi.fn(async () => authContext.current) };

    @Module({
      controllers: [CompanyLogoPublicController],
      providers: [
        { provide: CompanyProfileService, useValue: profile },
        { provide: MasterTrpcHandler, useValue: masterTrpc },
        { provide: APP_GUARD, useClass: ServiceTokenGuard },
        { provide: APP_FILTER, useClass: EnvelopeExceptionFilter },
      ],
    })
    class CompanyLogoGuardTestModule {}

    const app = await NestFactory.create(CompanyLogoGuardTestModule, { logger: false });
    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.use("/api/v1/company-profile/logo", publicLogoMethodCheck, createPublicLogoAccessCheck(masterTrpc as unknown as MasterTrpcHandler));
    const server = await app.listen(0);
    servers.push(app);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No test server address");
    const baseUrl = `http://127.0.0.1:${address.port}/api/v1/company-profile/logo`;

    const anonymous = await fetch(baseUrl);
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
    expect(profile.getLogo).not.toHaveBeenCalled();

    authContext.current = {
      principal: { userId: "viewer", sessionId: "session-1", isSuperAdmin: false, grants: ["company-profile:VIEW"] },
      authorization: "CURRENT", license: "ELIGIBLE", csrfVerified: false,
    };
    const authorizedWithoutServiceToken = await fetch(baseUrl);
    expect(authorizedWithoutServiceToken.status).toBe(200);
    expect(authorizedWithoutServiceToken.headers.get("content-type")).toBe("image/png");
    expect(authorizedWithoutServiceToken.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
    expect(profile.getLogo).toHaveBeenCalledOnce();
    expect(masterTrpc.createContext).toHaveBeenCalledTimes(3); // route middleware plus controller recheck on the authorized request
  });
});
