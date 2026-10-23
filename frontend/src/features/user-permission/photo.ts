/**
 * User photo (user-photo.md PH-04…09, FE-UP-013): JPEG/PNG up to 5 MB, uploaded as raw bytes to the
 * auth service REST route after the user's details are saved (PH-08); removal is `userAdmin.removePhoto`.
 */

export const PHOTO_TYPES = ["image/jpeg", "image/png"] as const;
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** Tile state between Save clicks: keep the saved photo, a new picked file, or remove it. */
export type PhotoChange = { kind: "unchanged" } | { kind: "new"; file: File; previewUrl: string } | { kind: "removed" };

export const UNCHANGED_PHOTO: PhotoChange = { kind: "unchanged" };

/** Client check when a file is picked; the server checks type, signature and size again. */
export function photoFileError(file: Pick<File, "type" | "size">): string | null {
  if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) return "Choose a JPEG or PNG image";
  if (file.size > PHOTO_MAX_BYTES) return "The photo must be 5 MB or smaller";
  if (file.size === 0) return "This file is empty";
  return null;
}

const photoPath = (userId: string) => `/api/v1/user-admin/users/${encodeURIComponent(userId)}/photo`;

/** Versioned URL of the saved photo (PH-07: `?v=` makes it cacheable), or null when there is none. */
export function photoUrl(userId: string, photoVersion: string | null): string | null {
  return photoVersion ? `${photoPath(userId)}?v=${encodeURIComponent(photoVersion)}` : null;
}

export class PhotoUploadError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export async function uploadUserPhoto(userId: string, file: File): Promise<{ photoVersion: string }> {
  let response: Response;
  try {
    response = await fetch(photoPath(userId), { method: "PUT", headers: { "content-type": file.type, "x-gms-csrf": "1" }, body: file, credentials: "same-origin" });
  } catch {
    throw new PhotoUploadError("NETWORK");
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code = (payload as { error?: { code?: unknown } } | null)?.error?.code;
    throw new PhotoUploadError(typeof code === "string" ? code : "UNKNOWN");
  }
  return payload as { photoVersion: string };
}

/** Domain code of a failed upload or removal → the reason shown after "the photo couldn't be updated". */
export function photoErrorMessage(code: string | null): string {
  switch (code) {
    case "PHOTO_TOO_LARGE":
      return "the photo must be 5 MB or smaller";
    case "PHOTO_TYPE_NOT_ALLOWED":
      return "choose a JPEG or PNG image";
    case "USER_NOT_MANAGEABLE":
      return "you can't change this user's photo";
    case "PERMISSION_DENIED":
      return "you don't have permission to change photos";
    case "USER_NOT_FOUND":
      return "this user no longer exists";
    default:
      return "try again";
  }
}
