import { uploadLinePhoto } from "@/features/quotation/api";
import type { LinePhotoTarget } from "@/features/quotation/options-context";
import type { PhotoRef } from "@/features/quotation/schema";

/**
 * ADR-0048 (owner 2026-11-11): line photos on Reserve, Memo Return, Memo Out, Memo Out Return and Purchase, each with
 * its own route (upload needs the document's ADD or EDIT, reading its VIEW), exactly as Purchase Order.
 */
export type DocumentPhotos = {
  route: string;
  /** Read link of one photo. */
  url: (id: string) => string;
  /** The row panel's upload / read target. */
  target: LinePhotoTarget;
  /** Uploads one JPEG/PNG ≤ 5 MB and returns it as a form photo. */
  uploadPhoto: (file: File) => Promise<PhotoRef>;
};

function documentPhotos(route: string): DocumentPhotos {
  const url = (id: string) => `${route}/${encodeURIComponent(id)}`;
  const upload = (file: File) => uploadLinePhoto(route, file);
  return {
    route,
    url,
    target: { upload, url },
    uploadPhoto: async (file) => {
      const id = await upload(file);
      return { id, name: file.name, url: url(id) };
    },
  };
}

export const DOCUMENT_PHOTOS = {
  reserve: documentPhotos("/api/v1/reserve/photos"),
  memoReturn: documentPhotos("/api/v1/memo-return/photos"),
  memoOut: documentPhotos("/api/v1/memo-out/photos"),
  memoOutReturn: documentPhotos("/api/v1/memo-out-return/photos"),
  purchase: documentPhotos("/api/v1/purchase/photos"),
} as const;
