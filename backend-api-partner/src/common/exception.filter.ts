import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Response } from "express";
import { errorBody } from "./errors";

const statusCodes: Partial<Record<number, string>> = {
  400: "VALIDATION_ERROR",
  401: "UNAUTHORIZED",
  404: "NOT_FOUND",
  413: "PAYLOAD_TOO_LARGE",
  415: "UNSUPPORTED_MEDIA_TYPE",
  503: "PARTNER_UNAVAILABLE",
};

function isEnvelope(value: unknown): boolean {
  if (typeof value !== "object" || value === null || !("error" in value)) return false;
  const error = (value as { error?: unknown }).error;
  return typeof error === "object" && error !== null && typeof (error as { code?: unknown }).code === "string";
}

/**
 * Converts every error to the partner envelope without stack traces, SQL, Prisma messages or
 * request data (error-handling.md "Partner implementation rules").
 */
@Catch()
export class EnvelopeExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("Partner");

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (isEnvelope(body)) {
        response.status(status).json(body);
        return;
      }
      const code = statusCodes[status] ?? (status >= 500 ? "INTERNAL_SERVER_ERROR" : "VALIDATION_ERROR");
      response.status(status).json(errorBody(code));
      return;
    }
    const prismaCode = typeof exception === "object" && exception !== null && typeof (exception as { code?: unknown }).code === "string"
      ? (exception as { code: string }).code
      : undefined;
    this.logger.error({ event: "partner.unhandled_error", errorName: exception instanceof Error ? exception.name : typeof exception, prismaCode });
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(errorBody("INTERNAL_SERVER_ERROR"));
  }
}
