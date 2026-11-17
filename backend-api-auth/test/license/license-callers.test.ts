import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LICENSE_CALLER_TOKEN_FILES, presentedTokenMatches, readServiceTokenDigests } from "../../src/license/master-license.controller";

/** UT-LS-AUTH-01/02 (BE-LS-001, ADR-0052 D2): the license endpoint's caller token set. */
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tokenFile(content: string) {
  const dir = await mkdtemp(join(tmpdir(), "gms-license-callers-"));
  dirs.push(dir);
  const file = join(dir, "token");
  await writeFile(file, content, { mode: 0o600 });
  return file;
}

const digest = (token: string) => createHash("sha256").update(token).digest();

describe("license caller tokens", () => {
  it("UT-LS-AUTH-01 lists exactly the master and inventory token files", () => {
    expect([...LICENSE_CALLER_TOKEN_FILES]).toEqual(["MASTER_AUTH_SERVICE_TOKEN_FILE", "INVENTORY_AUTH_SERVICE_TOKEN_FILE"]);
  });

  it("UT-LS-AUTH-01 reads every well-formed token file and skips missing or malformed ones", async () => {
    const master = randomBytes(32).toString("base64url");
    const inventory = randomBytes(32).toString("base64url");
    const both = await readServiceTokenDigests({
      MASTER_AUTH_SERVICE_TOKEN_FILE: await tokenFile(`${master}\n`),
      INVENTORY_AUTH_SERVICE_TOKEN_FILE: await tokenFile(`${inventory}\r\n`),
    });
    expect(both).toEqual([digest(master), digest(inventory)]);
    const malformed = await readServiceTokenDigests({
      MASTER_AUTH_SERVICE_TOKEN_FILE: await tokenFile("short"),
      INVENTORY_AUTH_SERVICE_TOKEN_FILE: join(tmpdir(), "does-not-exist-gms"),
    });
    expect(malformed).toEqual([]);
    expect(await readServiceTokenDigests({})).toEqual([]);
  });

  it("UT-LS-AUTH-02 matches any configured token and nothing else; an empty set never matches", () => {
    const a = randomBytes(32).toString("base64url");
    const b = randomBytes(32).toString("base64url");
    expect(presentedTokenMatches(a, [digest(a), digest(b)])).toBe(true);
    expect(presentedTokenMatches(b, [digest(a), digest(b)])).toBe(true);
    expect(presentedTokenMatches(randomBytes(32).toString("base64url"), [digest(a), digest(b)])).toBe(false);
    expect(presentedTokenMatches(a, [])).toBe(false);
  });
});
