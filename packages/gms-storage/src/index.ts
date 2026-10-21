import { createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { lstat, link, mkdir, open, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export type BucketName = "files" | "public" | "documents" | "exports";

export interface ObjectInfo {
  bucket: BucketName;
  key: string;
  size: number;
  contentType: string;
  lastModified: Date;
  etag: string;
}

export interface PutOptions {
  contentType: string;
  contentLength?: number;
  sha256?: string;
}

export interface StoredObject extends ObjectInfo {
  sha256: string;
}

export interface StorageDriver {
  put(bucket: BucketName, key: string, body: Uint8Array, options: PutOptions): Promise<StoredObject>;
  putStream(bucket: BucketName, key: string, body: Readable, options: PutOptions): Promise<StoredObject>;
  get(bucket: BucketName, key: string): Promise<Readable>;
  head(bucket: BucketName, key: string, contentType?: string): Promise<ObjectInfo | null>;
  /** User uploads in `files` and `public` are permanent; physical deletion is rejected. */
  delete(bucket: BucketName, key: string): Promise<void>;
  list(bucket: BucketName, prefix: string, limit?: number): Promise<ObjectInfo[]>;
}

export type KeyParts = { module: string } & (
  | { filename: string; ext?: never }
  | { filename?: never; ext: string }
);

export interface StorageScope {
  /** New objects may be written only beneath assigned module folders. */
  writePrefixes: readonly string[];
  /** Historical service folders are read-only compatibility paths. */
  readPrefixes: readonly string[];
}

const KEY_PART = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const EXTENSION = /^[a-z0-9]{1,12}$/;
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const BUCKETS = new Set<BucketName>(["files", "public", "documents", "exports"]);

function assertBucket(bucket: string): asserts bucket is BucketName {
  if (!BUCKETS.has(bucket as BucketName)) throw new Error("Invalid storage bucket");
}

export function assertSafeKey(key: string): void {
  if (
    typeof key !== "string" ||
    key.length === 0 ||
    key.length > 512 ||
    key.startsWith("/") ||
    key.includes("\\") ||
    key.split("/").some((part) => !part || part === "." || part === ".." || !/^[a-z0-9/_.-]+$/.test(part))
  ) {
    throw new Error("Unsafe storage key");
  }
}

export function buildKey(parts: KeyParts): string {
  if (!KEY_PART.test(parts.module)) {
    throw new Error("Invalid storage key part");
  }
  if ("ext" in parts && parts.ext !== undefined && !EXTENSION.test(parts.ext)) throw new Error("Invalid storage key part");
  const filename = "filename" in parts && parts.filename !== undefined
    ? parts.filename
    : `${uuidV7()}.${parts.ext}`;
  if (!FILE_NAME.test(filename) || filename.endsWith(".")) throw new Error("Invalid storage filename");
  const key = `${parts.module}/${filename}`;
  assertSafeKey(key);
  return key;
}

/** RFC 9562 UUIDv7, generated without adding a runtime dependency. */
export function uuidV7(now = Date.now()): string {
  if (!Number.isSafeInteger(now) || now < 0 || now > 0xffffffffffff) throw new Error("Invalid UUIDv7 timestamp");
  const bytes = randomBytes(16);
  let timestamp = now;
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = timestamp & 0xff;
    timestamp = Math.floor(timestamp / 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function objectPath(root: string, bucket: BucketName, key: string): string {
  assertBucket(bucket);
  assertSafeKey(key);
  const resolved = path.resolve(root, bucket, ...key.split("/"));
  const expectedRoot = path.resolve(root, bucket) + path.sep;
  if (!resolved.startsWith(expectedRoot)) throw new Error("Storage key escapes bucket root");
  return resolved;
}

async function rejectSymlinkPath(root: string, target: string): Promise<void> {
  const relative = path.relative(root, target);
  let current = root;
  const segments = relative.split(path.sep);
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) throw new Error("Symbolic links are not allowed in storage paths");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }
}

export function createStorage(
  root: string,
  scope: StorageScope,
): StorageDriver {
  const allPrefixes = [...scope.writePrefixes, ...scope.readPrefixes];
  const isValidPrefix = (prefix: string) => prefix.split("/").every((part) => KEY_PART.test(part));
  if (scope.writePrefixes.length === 0 || allPrefixes.some((prefix) => !isValidPrefix(prefix))) {
    throw new Error("GMS_STORAGE_MODULES must list valid read and write prefixes");
  }
  const absoluteRoot = path.resolve(root);
  const assertAllowedKey = (key: string, mode: "read" | "write") => {
    assertSafeKey(key);
    const prefixes = mode === "write" ? scope.writePrefixes : allPrefixes;
    if (!prefixes.some((prefix) => key === prefix || key.startsWith(`${prefix}/`))) {
      throw new Error(`Storage key is outside the allowed ${mode} prefixes`);
    }
  };

  const putStream = async (bucket: BucketName, key: string, body: Readable, options: PutOptions): Promise<StoredObject> => {
    assertAllowedKey(key, "write");
    const target = objectPath(absoluteRoot, bucket, key);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o750 });
    await rejectSymlinkPath(absoluteRoot, target);
    const temp = path.join(path.dirname(target), `.upload-${uuidV7()}.tmp`);
    const hash = createHash("sha256");
    let size = 0;
    const digest = new Transform({
      transform(chunk: Buffer | string, _encoding, callback) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length;
        hash.update(bytes);
        callback(null, bytes);
      },
    });
    try {
      await pipeline(body, digest, createWriteStream(temp, { flags: "wx", mode: 0o640 }));
      if (options.contentLength !== undefined && options.contentLength !== size) {
        throw new Error("Storage content length mismatch");
      }
      const sha256 = hash.digest("hex");
      if (options.sha256 && (!SHA256.test(options.sha256) || options.sha256 !== sha256)) {
        throw new Error("Storage SHA-256 mismatch");
      }
      const handle = await open(temp, "r+");
      await handle.sync();
      await handle.close();
      // Hard-link publication is atomic and fails if the immutable key already exists.
      await link(temp, target);
      await unlink(temp);
      const info = await stat(target);
      return {
        bucket,
        key,
        size,
        contentType: options.contentType,
        lastModified: info.mtime,
        etag: sha256,
        sha256,
      };
    } catch (error) {
      // Remove only the uncommitted temporary upload created by this call.
      await unlink(temp).catch(() => undefined);
      throw error;
    }
  };

  return {
    async put(bucket, key, body, options) {
      return putStream(bucket, key, Readable.from([body]), options);
    },

    putStream,

    async get(bucket, key) {
      assertAllowedKey(key, "read");
      const target = objectPath(absoluteRoot, bucket, key);
      await rejectSymlinkPath(absoluteRoot, target);
      const info = await lstat(target);
      if (!info.isFile()) throw new Error("Stored object is not a regular file");
      return createReadStream(target);
    },

    async head(bucket, key, contentType = "application/octet-stream") {
      assertAllowedKey(key, "read");
      const target = objectPath(absoluteRoot, bucket, key);
      await rejectSymlinkPath(absoluteRoot, target);
      try {
        const info = await lstat(target);
        if (!info.isFile()) return null;
        return { bucket, key, size: info.size, contentType, lastModified: info.mtime, etag: "" };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },

    async delete(bucket, key) {
      assertAllowedKey(key, "write");
      if (bucket === "files" || bucket === "public") {
        throw new Error("User-uploaded objects are permanently retained");
      }
      const target = objectPath(absoluteRoot, bucket, key);
      await rejectSymlinkPath(absoluteRoot, target);
      await unlink(target).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    },

    async list(bucket, prefix, limit = 100) {
      assertAllowedKey(prefix, "read");
      assertSafeKey(prefix);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error("Invalid list limit");
      const target = objectPath(absoluteRoot, bucket, prefix);
      await rejectSymlinkPath(absoluteRoot, target);
      const results: ObjectInfo[] = [];
      const visit = async (directory: string, relative: string): Promise<void> => {
        if (results.length >= limit) return;
        let entries;
        try {
          entries = await readdir(directory, { withFileTypes: true });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
          throw error;
        }
        for (const entry of entries) {
          if (results.length >= limit) break;
          if (entry.isSymbolicLink()) continue;
          const child = path.join(directory, entry.name);
          const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
          if (entry.isDirectory()) await visit(child, childRelative);
          else if (entry.isFile()) {
            const info = await stat(child);
            results.push({ bucket, key: childRelative, size: info.size, contentType: "application/octet-stream", lastModified: info.mtime, etag: "" });
          }
        }
      };
      await visit(target, prefix);
      return results;
    },
  };
}
