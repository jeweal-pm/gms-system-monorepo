import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthController } from "./auth/auth.controller";
import { AuthService } from "./auth/auth.service";
import { PrismaLifecycleService } from "./database/prisma-lifecycle.service";
import { LoggerModule } from "nestjs-pino";
import { LicenseService } from "./license/license.service";
import { validateLicenseConfiguration } from "./license/license.config";
import { UserAdminController } from "./user-admin/user-admin.controller";
import { UserAdminService } from "./user-admin/user-admin.service";
import { UserProvisioningService } from "./user-admin/user-provisioning.service";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateLicenseConfiguration }),
    LoggerModule.forRoot({ pinoHttp: { redact: { paths: ["req.headers.authorization", "req.headers.cookie", "req.headers.x-api-key", "req.body.password", "req.body.newPassword", "req.body.currentPassword", "req.body.confirmPassword", "req.body.licenseKey", "req.body.key"], censor: "[REDACTED]" } } }),
  ],
  controllers: [AuthController, UserAdminController],
  providers: [AuthService, PrismaLifecycleService, LicenseService, UserProvisioningService, UserAdminService],
})
export class AppModule {}
