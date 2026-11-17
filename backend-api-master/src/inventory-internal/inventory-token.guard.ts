import { CanActivate, ExecutionContext, HttpStatus, Injectable, Logger, SetMetadata } from "@nestjs/common";
import { createHash, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Request } from "express";
import { partnerException } from "../common/errors";
import { loadServiceTokenDigest } from "../config";

/**
 * load-to-stock SA rev 1 / ADR-0052 D2 (BE-LS-004): `/internal/v1/inventory/*` is reachable only with
 * `Authorization: Bearer <INVENTORY_MASTER_SERVICE_TOKEN>` (file secret `INVENTORY_MASTER_SERVICE_TOKEN_FILE`, ≥ 32
 * random bytes). It is a different credential from `PARTNER_SERVICE_TOKEN`: the global ServiceTokenGuard skips these
 * routes (so the partner token is refused here), and every other route keeps requiring the partner token (so this token
 * is refused there). Compared as SHA-256 digests in constant time.
 */
export const INVENTORY_INTERNAL_ROUTE = "partner:inventory-internal-route";
export const InventoryInternalRoute = () => SetMetadata(INVENTORY_INTERNAL_ROUTE, true);

/** A file secret: printable ASCII without spaces, 43–512 characters (32 random bytes base64url = 43). */
const TOKEN = /^[\x21-\x7E]{43,512}$/;
const BEARER = /^Bearer ([\x21-\x7E]{1,512})$/;

/** Reads and validates the token file; null when unset, unreadable or malformed (the routes then refuse every call). */
export function readInventoryTokenDigest(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const path = env.INVENTORY_MASTER_SERVICE_TOKEN_FILE;
  if (!path || path.length > 512) return null;
  try {
    let token = readFileSync(path, "utf8");
    if (token.endsWith("\r\n")) token = token.slice(0, -2);
    else if (token.endsWith("\n")) token = token.slice(0, -1);
    return TOKEN.test(token) ? createHash("sha256").update(token, "utf8").digest() : null;
  } catch {
    return null;
  }
}

/** Constant-time comparison; a missing expected digest never matches. */
export function inventoryTokenMatches(header: string | undefined, expected: Buffer | null): boolean {
  const match = typeof header === "string" ? BEARER.exec(header) : null;
  const presented = createHash("sha256").update(match?.[1] ?? "", "utf8").digest();
  const reference = expected ?? createHash("sha256").update("\0no-inventory-token\0", "utf8").digest();
  return timingSafeEqual(presented, reference) && match !== null && expected !== null;
}

@Injectable()
export class InventoryServiceTokenGuard implements CanActivate {
  private readonly logger = new Logger("InventoryInternal");
  private readonly expected: Buffer | null;

  constructor() {
    const digest = readInventoryTokenDigest();
    let partnerDigest: Buffer | null = null;
    try { partnerDigest = loadServiceTokenDigest(); } catch { partnerDigest = null; }
    // The two credentials must differ, or the separation above would be void.
    if (digest && partnerDigest && timingSafeEqual(digest, partnerDigest)) {
      this.logger.error({ event: "inventory_internal.token_reused" });
      this.expected = null;
    } else {
      this.expected = digest;
    }
    if (!this.expected) this.logger.warn({ event: "inventory_internal.token_missing" });
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!inventoryTokenMatches(request.headers.authorization, this.expected)) throw partnerException("UNAUTHORIZED", HttpStatus.UNAUTHORIZED);
    return true;
  }
}
