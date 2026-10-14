import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { createHash, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { partnerException } from "../common/errors";
import { loadServiceTokenDigest } from "../config";
import { PUBLIC_ROUTE } from "./public.decorator";

const BEARER = /^Bearer ([\x21-\x7E]{1,512})$/;

/**
 * Global guard: every non-public route requires `Authorization: Bearer <PARTNER_SERVICE_TOKEN>`.
 * Presented and configured tokens are hashed to equal-length SHA-256 digests and compared in
 * constant time (D-04). 401 carries no detail.
 */
@Injectable()
export class ServiceTokenGuard implements CanActivate {
  private readonly expected = loadServiceTokenDigest();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    const match = typeof header === "string" ? BEARER.exec(header) : null;
    const presented = createHash("sha256").update(match?.[1] ?? "", "utf8").digest();
    const equal = timingSafeEqual(presented, this.expected);
    if (!match || !equal) throw partnerException("UNAUTHORIZED", HttpStatus.UNAUTHORIZED);
    return true;
  }
}
