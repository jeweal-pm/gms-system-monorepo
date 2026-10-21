import { z } from "zod";
import { validationException } from "./errors";

/** Opaque keyset cursor (api-contract.md "Cursor"): base64url JSON `{n: name_key, i: id, v: 1}`. */
export type ListCursor = { nameKey: string; id: string };

export const MAX_CURSOR_LENGTH = 200;

const cursorSchema = z.object({
  n: z.string().max(200),
  i: z.uuid(),
  v: z.literal(1),
}).strict();

export function encodeCursor(cursor: ListCursor): string {
  return Buffer.from(JSON.stringify({ n: cursor.nameKey, i: cursor.id, v: 1 }), "utf8").toString("base64url");
}

/** Invalid cursors become `400 VALIDATION_ERROR` `{path:"cursor", code:"invalid"}`. */
export function decodeCursor(value: string): ListCursor {
  const invalid = () => validationException([{ path: "cursor", code: "invalid" }]);
  if (value.length > MAX_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(value)) throw invalid();
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw invalid();
  }
  const parsed = cursorSchema.safeParse(json);
  if (!parsed.success) throw invalid();
  return { nameKey: parsed.data.n, id: parsed.data.i };
}
