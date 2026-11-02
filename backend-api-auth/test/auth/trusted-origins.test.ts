import { describe, expect, it } from "vitest";
import { trustedOriginsFor } from "../../src/auth/trusted-origins";

describe("trusted origins", () => {
  it("UT-AUTH-ORIGIN-01 trusts the frontend origin and its 127.0.0.1 twin for localhost", () => {
    expect(trustedOriginsFor("http://localhost:8080/")).toEqual(["http://localhost:8080", "http://127.0.0.1:8080"]);
    expect(trustedOriginsFor("https://gms.example.test/app")).toEqual(["https://gms.example.test"]);
  });

  it("UT-AUTH-ORIGIN-02 adds valid extra http(s) origins and ignores malformed or other-scheme entries", () => {
    expect(trustedOriginsFor("http://localhost:8080", " http://192.168.0.106 , not a url,ftp://192.168.0.106,http://192.168.0.106/path,")).toEqual([
      "http://localhost:8080",
      "http://127.0.0.1:8080",
      "http://192.168.0.106",
    ]);
  });
});
