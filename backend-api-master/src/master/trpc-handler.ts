import { Injectable } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { CustomerService } from "../customer/customer.service";
import { VendorService } from "../vendor/vendor.service";
import { CompanyProfileService } from "../company-profile/company-profile.service";
import { StoneMasterService } from "../stone-master/stone-master.service";
import { DocumentSetupService } from "../document-setup/document-setup.service";
import { CurrencyService } from "../currency/currency.service";
import { MasterAuthContextAdapter, MasterJwksCache } from "./auth-context";
import { MasterAuthzDatabase } from "./authz-database";
import { MasterLicenseClient } from "./license-client";
import { QuotationService } from "../quotation/quotation.service";
import { MemoOutService } from "../trade-document/memo-out.service";
import { MemoOutReturnService } from "../trade-document/memo-out-return.service";
import { createMasterRouter } from "./router";

/** Express-compatible handler for parent-owned `/api/master/trpc` composition. */
@Injectable()
export class MasterTrpcHandler {
  private readonly handler: ReturnType<typeof createExpressMiddleware>;
  private readonly authContext: MasterAuthContextAdapter;

  constructor(customer: CustomerService, vendor: VendorService, companyProfile: CompanyProfileService, stoneMaster: StoneMasterService, authz: MasterAuthzDatabase, license: MasterLicenseClient, documentSetup: DocumentSetupService, currency: CurrencyService, quotation: QuotationService, memoOut: MemoOutService, memoOutReturn: MemoOutReturnService) {
    const issuer = process.env.AUTH_ACCESS_JWT_ISSUER;
    const trustedOrigin = process.env.FRONTEND_URL;
    const authService = process.env.AUTH_SERVICE_URL;
    if (!issuer || !trustedOrigin || !authService) throw new Error("Master auth configuration is incomplete");
    const jwks = new MasterJwksCache(new URL("api/auth/jwks", ensureBase(authService)));
    this.authContext = new MasterAuthContextAdapter({
      issuer,
      trustedOrigin,
      extraTrustedOrigins: originList(process.env.MASTER_TRUSTED_ORIGINS),
      jwks,
      authorizationReader: (userId, sessionId) => authz.read(userId, sessionId),
      checkLicense: (userId, sessionId) => license.check(userId, sessionId),
    });
    const router = createMasterRouter({ customer, vendor, companyProfile, stoneMaster, documentSetup, currency, quotation, memoOut, memoOutReturn });
    this.handler = createExpressMiddleware({ router, createContext: ({ req }) => this.authContext.create(req) });
  }

  handle(request: Request, response: Response, next: NextFunction) { return this.handler(request, response, next); }
  createContext(request: Request) { return this.authContext.create(request); }
}

/** `MASTER_TRUSTED_ORIGINS`: optional comma-separated extra origins (dev LAN preview, 2026-10-23). */
export function originList(raw: string | undefined): string[] {
  return (raw ?? "").split(",").map((value) => value.trim()).filter(Boolean);
}

function ensureBase(value: string) {
  const base = new URL(value);
  if (!/^https?:$/.test(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error("AUTH_SERVICE_URL is invalid");
  return base;
}
