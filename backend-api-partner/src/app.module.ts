import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { LoggerModule } from "nestjs-pino";
import { EnvelopeExceptionFilter } from "./common/exception.filter";
import { CompanyProfileController } from "./company-profile/company-profile.controller";
import { CompanyProfileService } from "./company-profile/company-profile.service";
import { CustomerController } from "./customer/customer.controller";
import { CustomerService } from "./customer/customer.service";
import { PrismaLifecycleService } from "./database/prisma-lifecycle.service";
import { HealthController } from "./health/health.controller";
import { ServiceTokenGuard } from "./internal-auth/service-token.guard";
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
  controllers: [HealthController, CustomerController, VendorController, CompanyProfileController],
  providers: [
    PrismaLifecycleService,
    CustomerService,
    VendorService,
    CompanyProfileService,
    { provide: APP_GUARD, useClass: ServiceTokenGuard },
    { provide: APP_FILTER, useClass: EnvelopeExceptionFilter },
  ],
})
export class AppModule {}
