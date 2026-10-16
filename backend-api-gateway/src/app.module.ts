import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { CompanyProfileLogoController } from "./company-profile-logo.controller";
import { LoggerModule } from "nestjs-pino";

@Module({
  imports: [LoggerModule.forRoot({ pinoHttp: { redact: { paths: ["req.headers.authorization", "req.headers.cookie", "req.headers.x-api-key", "req.body.password", "req.body.currentPassword", "req.body.newPassword", "req.body.confirmPassword"], censor: "[REDACTED]" } } })],
  controllers: [AppController, CompanyProfileLogoController],
})
export class AppModule {}
