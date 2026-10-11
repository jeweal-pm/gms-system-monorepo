export type LicenseState =
  | "VALID"
  | "EXPIRING"
  | "EXPIRED"
  | "REVOKED"
  | "REQUIRED"
  | "GRACE"
  | "UNVERIFIABLE";

export type LicensePublicStatus = {
  state: LicenseState;
  type?: "trial" | "paid";
  expiresAt?: string;
  daysRemaining?: number;
  checkedAt?: string;
  retryAfter?: number;
};

export type LicenseClaims = {
  sub: string;
  iss: string;
  aud: string | string[];
  instance: string;
  type: "trial" | "paid";
  status: "active" | "suspended" | "revoked";
  license_expires_at: string;
  iat: number;
  exp: number;
};

export type LicenseLookup =
  | { state: "none" }
  | { state: "pending" }
  | { state: "active"; token: string };

export type LicenseClient = {
  lookup(email: string): Promise<LicenseLookup>;
  activate(email: string, key: string): Promise<string>;
  refresh(email: string): Promise<string>;
};

export class LicenseClientError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: number,
    readonly transient: boolean,
  ) {
    super("License service request failed");
    this.name = "LicenseClientError";
  }
}

export class InvalidLicenseTokenError extends Error {
  constructor() {
    super("License token is invalid");
    this.name = "InvalidLicenseTokenError";
  }
}
