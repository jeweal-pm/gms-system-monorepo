import { afterEach, describe, expect, it, vi } from "vitest";
import { photoErrorMessage, photoFileError, photoUrl, PhotoUploadError, uploadUserPhoto } from "@/features/user-permission/photo";

/** UT-PH-F01…F05: user photo client rules (user-photo.md PH-04…09, FE-UP-013). */

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("photoFileError", () => {
  it("UT-PH-F01 accepts JPEG/PNG up to 5 MB; rejects other types, empty and oversized files", () => {
    expect(photoFileError({ type: "image/jpeg", size: 1000 })).toBeNull();
    expect(photoFileError({ type: "image/png", size: 5 * 1024 * 1024 })).toBeNull();
    expect(photoFileError({ type: "image/gif", size: 1000 })).toBe("Choose a JPEG or PNG image");
    expect(photoFileError({ type: "image/png", size: 5 * 1024 * 1024 + 1 })).toBe("The photo must be 5 MB or smaller");
    expect(photoFileError({ type: "image/png", size: 0 })).toBe("This file is empty");
  });
});

describe("photoUrl", () => {
  it("UT-PH-F02 versioned same-origin URL, or null without a photo", () => {
    expect(photoUrl("u-1", "abcdef0123456789")).toBe("/api/v1/user-admin/users/u-1/photo?v=abcdef0123456789");
    expect(photoUrl("u-1", null)).toBeNull();
  });
});

describe("uploadUserPhoto", () => {
  it("UT-PH-F03 PUTs the raw file with its type and returns the new version", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ photoVersion: "abcdef0123456789" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "me.jpg", { type: "image/jpeg" });
    await expect(uploadUserPhoto("u-1", file)).resolves.toEqual({ photoVersion: "abcdef0123456789" });
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/user-admin/users/u-1/photo", expect.objectContaining({ method: "PUT", headers: { "content-type": "image/jpeg", "x-gms-csrf": "1" }, body: file }));
  });

  it("UT-PH-F04 failures carry the gateway domain code (or NETWORK)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "PHOTO_TOO_LARGE" } }), { status: 413 })));
    const file = new File([new Uint8Array([1])], "x.png", { type: "image/png" });
    await expect(uploadUserPhoto("u-1", file)).rejects.toEqual(new PhotoUploadError("PHOTO_TOO_LARGE"));
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("offline");
    }));
    await expect(uploadUserPhoto("u-1", file)).rejects.toEqual(new PhotoUploadError("NETWORK"));
  });
});

describe("photoErrorMessage", () => {
  it("UT-PH-F05 explains the known codes", () => {
    expect(photoErrorMessage("PHOTO_TOO_LARGE")).toBe("the photo must be 5 MB or smaller");
    expect(photoErrorMessage("PHOTO_TYPE_NOT_ALLOWED")).toBe("choose a JPEG or PNG image");
    expect(photoErrorMessage("USER_NOT_MANAGEABLE")).toBe("you can't change this user's photo");
    expect(photoErrorMessage(null)).toBe("try again");
  });
});
