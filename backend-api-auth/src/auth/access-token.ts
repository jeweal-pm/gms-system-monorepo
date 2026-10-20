import { createPrivateKey, createPublicKey, randomUUID, type KeyObject } from "node:crypto";
import { SignJWT, type JWK } from "jose";

export const ACCESS_TOKEN_AUDIENCE = "gms-domain-api";
export const ACCESS_TOKEN_LIFETIME_SECONDS = 15 * 60;
const MAX_PUBLISHED_KEYS = 2;

type SigningKeyInput = { kid: string; privateJwk: JWK };
type SigningKey = { kid: string; privateKey: KeyObject; publicJwk: JWK };

/** User access keys are independent of the license-server signing keys and Better Auth secret. */
export class AccessTokenIssuer {
  private readonly keys: SigningKey[];

  constructor(readonly issuer: string, inputs: SigningKeyInput[]) {
    if (!issuer || issuer.length > 256 || !URL.canParse(issuer) || !/^https?:$/.test(new URL(issuer).protocol)) {
      throw new Error("Invalid access-token issuer");
    }
    if (inputs.length < 1 || inputs.length > MAX_PUBLISHED_KEYS) throw new Error("Access-token key count must be 1 or 2");
    const seen = new Set<string>();
    this.keys = inputs.map(({ kid, privateJwk }) => {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(kid) || seen.has(kid)) throw new Error("Invalid access-token key ID");
      seen.add(kid);
      if (privateJwk.kty !== "OKP" || privateJwk.crv !== "Ed25519" || typeof privateJwk.d !== "string") {
        throw new Error("Access-token key must be a private Ed25519 JWK");
      }
      const privateKey = createPrivateKey({ key: privateJwk, format: "jwk" });
      const exported = createPublicKey(privateKey).export({ format: "jwk" }) as JWK;
      if (exported.kty !== "OKP" || exported.crv !== "Ed25519" || typeof exported.x !== "string") {
        throw new Error("Access-token public key is invalid");
      }
      return { kid, privateKey, publicJwk: { kty: "OKP", crv: "Ed25519", x: exported.x, kid, alg: "EdDSA", use: "sig" } };
    });
  }

  /** The first configured key signs; the second remains published for bounded rotation overlap. */
  async issue(userId: string, sessionId: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
    if (!userId || !sessionId || userId.length > 256 || sessionId.length > 256) throw new Error("Invalid access-token subject");
    if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0) throw new Error("Invalid access-token issue time");
    const active = this.keys[0];
    return new SignJWT({ sid: sessionId })
      .setProtectedHeader({ alg: "EdDSA", kid: active.kid, typ: "JWT" })
      .setIssuer(this.issuer)
      .setAudience(ACCESS_TOKEN_AUDIENCE)
      .setSubject(userId)
      .setJti(randomUUID())
      .setIssuedAt(nowSeconds)
      .setNotBefore(nowSeconds)
      .setExpirationTime(nowSeconds + ACCESS_TOKEN_LIFETIME_SECONDS)
      .sign(active.privateKey);
  }

  publicJwks(): { keys: JWK[] } {
    return { keys: this.keys.map(({ publicJwk }) => ({ ...publicJwk })) };
  }
}

/** Absent configuration leaves the staged JWT route unavailable without changing existing login. */
export function accessTokenIssuerFromEnvironment(env: NodeJS.ProcessEnv): AccessTokenIssuer | null {
  if (!env.AUTH_ACCESS_JWT_ISSUER && !env.AUTH_ACCESS_JWT_KEYS) return null;
  if (!env.AUTH_ACCESS_JWT_ISSUER || !env.AUTH_ACCESS_JWT_KEYS) throw new Error("Incomplete access-token configuration");
  let parsed: unknown;
  try { parsed = JSON.parse(env.AUTH_ACCESS_JWT_KEYS); } catch { throw new Error("Invalid access-token key configuration"); }
  if (!Array.isArray(parsed) || parsed.some((item) =>
    typeof item !== "object" || item === null ||
    typeof item.kid !== "string" ||
    typeof item.privateJwk !== "object" || item.privateJwk === null || Array.isArray(item.privateJwk)
  )) throw new Error("Invalid access-token key configuration");
  return new AccessTokenIssuer(env.AUTH_ACCESS_JWT_ISSUER, parsed as SigningKeyInput[]);
}
