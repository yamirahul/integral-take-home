// Client-safe display formatting shared across pages. Deliberately has zero Node
// dependencies (no `fs`, `crypto`, `path`) so it's safe to import from "use client"
// components — unlike src/lib/documents.ts, which pulls in Node built-ins that break a
// client bundle.

// Cosmetic short reference (e.g. "INT-006" in the design mockup) derived from a real
// cuid. The database's actual id is still what everything (audit log, review actions,
// document attachment) keys off — this is purely a friendlier label to show.
export function shortRef(id: string): string {
  return `INT-${id.slice(-6).toUpperCase()}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
