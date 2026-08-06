// Shared constants + file-storage helpers for supporting document uploads (Goal 3).
//
// Storage design: uploaded files live outside `public/` (so they're never reachable as a
// static asset — the only way to read one is GET /api/documents/[id]/file, which checks
// auth first) under STORAGE_DIR, named by the SHA-256 hash of their contents. That makes
// storage content-addressed: uploading the same bytes twice, or "reusing" a document you
// already uploaded on a second intake, never writes a duplicate file to disk — it just
// adds another Document row pointing at the same stored file.
//
// That's how "save once, reuse across intakes" works without touching the Document model:
// prisma/schema.prisma scopes Document to exactly one Intake, and the README says that
// model was already designed and isn't ours to redesign. A "document library" is just a
// query grouping a patient's Document rows by filePath — see src/app/documents/page.tsx.

import { createHash } from "crypto";
import { mkdir, writeFile, readFile, access } from "fs/promises";
import path from "path";

export const STORAGE_DIR = path.join(process.cwd(), "storage", "documents");

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB — generous for a scanned PDF or phone photo.

export const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const EXTENSION_BY_MIME: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif",
};

export function isAllowedFileType(mimeType: string): boolean {
  return ALLOWED_MIME_TYPES.has(mimeType);
}

// Content-addressed filename: identical bytes always resolve to the same path.
function storageFileName(bytes: Buffer, mimeType: string): string {
  const hash = createHash("sha256").update(bytes).digest("hex");
  const extension = EXTENSION_BY_MIME[mimeType] ?? "";
  return `${hash}${extension}`;
}

// Writes the file if (and only if) it isn't already on disk, and returns the name it's
// stored under — this is what gets saved as Document.filePath.
export async function saveDocumentFile(bytes: Buffer, mimeType: string): Promise<string> {
  const fileName = storageFileName(bytes, mimeType);
  const fullPath = path.join(STORAGE_DIR, fileName);

  const alreadyStored = await access(fullPath)
    .then(() => true)
    .catch(() => false);

  if (!alreadyStored) {
    await mkdir(STORAGE_DIR, { recursive: true });
    await writeFile(fullPath, bytes);
  }

  return fileName;
}

// Reads a previously-stored file back by its Document.filePath value.
export async function readDocumentFile(storedFileName: string): Promise<Buffer> {
  // filePath is always a bare content-addressed filename we generated ourselves (never
  // user input), but this guards against that invariant ever being violated and reading
  // outside STORAGE_DIR.
  if (
    storedFileName.includes("/") ||
    storedFileName.includes("\\") ||
    storedFileName.includes("..")
  ) {
    throw new Error("Invalid stored file name.");
  }
  return readFile(path.join(STORAGE_DIR, storedFileName));
}
