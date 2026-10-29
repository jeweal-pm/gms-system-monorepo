import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { LoggerModule } from "nestjs-pino";
import { EnvelopeExceptionFilter } from "./common/exception.filter";
import { CompanyProfileController } from "./company-profile/company-profile.controller";
import { CompanyLogoPublicController } from "./company-profile/company-logo.public.controller";
import { CompanyProfileService } from "./company-profile/company-profile.service";
import { CustomerController } from "./customer/customer.controller";
import { CustomerService } from "./customer/customer.service";
import { DocumentSetupService } from "./document-setup/document-setup.service";
import { CurrencyService } from "./currency/currency.service";
import { PrismaLifecycleService } from "./database/prisma-lifecycle.service";
import { QuotationPhotoPublicController } from "./quotation/quotation-photo.public.controller";
import { MemoReceivePhotoPublicController } from "./trade-document/memo-receive-photo.public.controller";
import { QuotationService } from "./quotation/quotation.service";
import { MemoOutService } from "./trade-document/memo-out.service";
import { MemoOutReturnService } from "./trade-document/memo-out-return.service";
import { MemoReceiveService } from "./trade-document/memo-receive.service";
import { MemoStockService } from "./trade-document/memo-stock.service";
import { HealthController } from "./health/health.controller";
import { ServiceTokenGuard } from "./internal-auth/service-token.guard";
import { MasterAuthzDatabase } from "./master/authz-database";
import { MasterLicenseClient } from "./master/license-client";
import { MasterTrpcHandler } from "./master/trpc-handler";
import { StoneMasterController } from "./stone-master/stone-master.controller";
import { StoneMasterService } from "./stone-master/stone-master.service";
import { VendorController } from "./vendor/vendor.controller";
import { VendorService } from "./vendor/vendor.service";

type SerializedRequest = { id?: unknown; method?: unknown; url?: unknown };

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        // Request logs carry only id, method and path: no headers (service token), no query
        // string (search text) and never bodies (customer/vendor personal data).
        serializers: {
          req: (req: SerializedRequest) => ({ id: req.id, method: req.method, path: typeof req.url === "string" ? req.url.split("?")[0] : undefined }),
        },
        redact: {
          paths: ["req.headers.authorization", "req.headers.cookie", "*.connectionString", "*.databaseUrl", "*.PARTNER_DATABASE_URL", "*.PARTNER_SERVICE_TOKEN"],
          censor: "[REDACTED]",
        },
      },
    }),
  ],
  controllers: [HealthController, CustomerController, VendorController, CompanyProfileController, CompanyLogoPublicController, StoneMasterController, QuotationPhotoPublicController, MemoReceivePhotoPublicController],
  providers: [
    PrismaLifecycleService,
    CustomerService,
    VendorService,
    CompanyProfileService,
    StoneMasterService,
    DocumentSetupService,
    CurrencyService,
    QuotationService,
    MemoOutService,
    MemoOutReturnService,
    MemoReceiveService,
    MemoStockService,
    MasterAuthzDatabase,
    MasterLicenseClient,
    MasterTrpcHandler,
    { provide: APP_GUARD, useClass: ServiceTokenGuard },
    { provide: APP_FILTER, useClass: EnvelopeExceptionFilter },
  ],
})
export class AppModule {}
