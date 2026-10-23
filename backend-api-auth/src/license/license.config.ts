import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";

const DEFAULT_AUDIENCE = "f1-system-customer-backend";
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export type LicenseConfiguration = {
  mode: "mock" | "remote";
  apiUrl?: URL;
  instanceId: string;
  instanceApiKey?: string;
  issuer: string;
  audience: string;
  publicKeys: Record<string, string>;
  offlineGraceDays: 0 | 1 | 2;
  mockKid?: string;
  mockPrivateKeyPkcs8Base64?: string;
};

export function validateLicenseConfiguration(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  parseLicenseConfiguration(env);
  return env;
}

export function parseLicenseConfiguration(env: NodeJS.ProcessEnv): LicenseConfiguration {
  const mode = env.LICENSE_MODE;
  if (mode !== "mock" && mode !== "remote") throw new Error("LICENSE_MODE must be mock or remote");
  if (mode === "mock" && env.NODE_ENV === "production") throw new Error("LICENSE_MODE=mock is forbidden in production");

  const instanceId = required(env, "LICENSE_INSTANCE_ID");
  const issuer = required(env, "LICENSE_JWT_ISSUER");
  const audience = env.LICENSE_JWT_AUDIENCE ?? DEFAULT_AUDIENCE;
  if (audience !== DEFAULT_AUDIENCE) throw new Error("LICENSE_JWT_AUDIENCE must match the approved audience");
  const graceInput = env.LICENSE_OFFLINE_GRACE_DAYS ?? "2";
  if (!/^[012]$/.test(graceInput)) throw new Error("LICENSE_OFFLINE_GRACE_DAYS must be 0, 1 or 2");
  const offlineGraceDays = Number(graceInput) as 0 | 1 | 2;

  const publicKeysRaw = required(env, "LICENSE_PUBLIC_KEYS_JSON");
  let publicKeys: unknown;
  try { publicKeys = JSON.parse(publicKeysRaw); } catch { throw new Error("LICENSE_PUBLIC_KEYS_JSON must be valid JSON"); }
  if (!isRecord(publicKeys) || Object.keys(publicKeys).length < 1 || Object.keys(publicKeys).length > 8) {
    throw new Error("LICENSE_PUBLIC_KEYS_JSON must contain between 1 and 8 keys");
  }
  for (const [kid, encoded] of Object.entries(publicKeys)) {
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(kid) || typeof encoded !== "string" || !BASE64.test(encoded)) {
      throw new Error("LICENSE_PUBLIC_KEYS_JSON contains an invalid key entry");
    }
    const der = Buffer.from(encoded, "base64");
    if (der.length < 32 || der.length > 1024 || der.toString("base64") !== encoded) {
      throw new Error("LICENSE_PUBLIC_KEYS_JSON contains an invalid key encoding");
    }
    try {
      const publicKey = createPublicKey({ key: der, format: "der", type: "spki" });
      if (publicKey.asymmetricKeyType !== "ed25519") throw new Error();
    } catch {
      throw new Error("LICENSE_PUBLIC_KEYS_JSON must contain Ed25519 SPKI public keys");
    }
  }

  if (mode === "remote") {
    const rawUrl = required(env, "LICENSE_API_URL");
    let apiUrl: URL;
    try { apiUrl = new URL(rawUrl); } catch { throw new Error("LICENSE_API_URL must be an absolute URL"); }
    if (apiUrl.protocol !== "https:" && !(env.NODE_ENV !== "production" && apiUrl.protocol === "http:" && ["localhost", "127.0.0.1"].includes(apiUrl.hostname))) {
      throw new Error("LICENSE_API_URL must use HTTPS outside local development");
    }
    return {
      mode,
      apiUrl,
      instanceId,
      instanceApiKey: required(env, "LICENSE_INSTANCE_API_KEY"),
      issuer,
      audience,
      publicKeys,
      offlineGraceDays,
    };
  }

  const mockKid = required(env, "LICENSE_MOCK_KID");
  const mockPrivateKeyPkcs8Base64 = required(env, "LICENSE_MOCK_PRIVATE_KEY_PKCS8_BASE64");
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(mockKid) || !(mockKid in publicKeys)) {
    throw new Error("LICENSE_MOCK_KID must identify a configured public key");
  }
  const privateDer = Buffer.from(mockPrivateKeyPkcs8Base64, "base64");
  if (!BASE64.test(mockPrivateKeyPkcs8Base64) || privateDer.length < 32 || privateDer.length > 2048 || privateDer.toString("base64") !== mockPrivateKeyPkcs8Base64) {
    throw new Error("LICENSE_MOCK_PRIVATE_KEY_PKCS8_BASE64 must be a base64 PKCS8 key");
  }
  try {
    const privateKey = createPrivateKey({ key: privateDer, format: "der", type: "pkcs8" });
    const publicKey = createPublicKey({ key: Buffer.from(publicKeys[mockKid], "base64"), format: "der", type: "spki" });
    const challenge = Buffer.from("f1-system-license-mock-key-check");
    if (privateKey.asymmetricKeyType !== "ed25519" || !verify(null, challenge, publicKey, sign(null, challenge, privateKey))) throw new Error();
  } catch {
    throw new Error("Mock signing key must match the configured Ed25519 public key");
  }
  return { mode, instanceId, issuer, audience, publicKeys, offlineGraceDays, mockKid, mockPrivateKeyPkcs8Base64 };
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, string> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
