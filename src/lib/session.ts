// Signed session cookie: how we remember "who is logged in" without a Session table.
//
// The cookie value is `${userId}:${role}.${signatureHex}`. Signing with HMAC-SHA256 (keyed
// by AUTH_SECRET) means a client can read/see the cookie but can't edit the userId or role
// without invalidating the signature — so it's tamper-proof without needing a DB lookup to
// confirm it. Embedding the role (not just the userId) lets middleware make patient-vs-reviewer
// routing decisions on the raw cookie alone, no database round trip required.
//
// Uses the Web Crypto API (`crypto.subtle`) rather than Node's `crypto` module because this
// file is imported from both middleware (Edge runtime) and route handlers (Node.js runtime),
// and Web Crypto is the subset that works in both.
//
// Trade-off vs. a DB-backed Session table: logout only works locally (clearing the cookie) —
// there's no server-side revocation list. Acceptable for this project's scope; see the
// "Full session table" option we discussed if that's ever needed.

import type { Role } from "@prisma/client";

export const SESSION_COOKIE_NAME = "session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface SessionPayload {
  userId: string;
  role: Role;
}

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not set. Did you run `cp .env.example .env`?");
  }
  return secret;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getAuthSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function encodePayload(payload: SessionPayload): string {
  return `${payload.userId}:${payload.role}`;
}

function decodePayload(raw: string): SessionPayload | null {
  const [userId, role] = raw.split(":");
  if (!userId || (role !== "PATIENT" && role !== "REVIEWER")) return null;
  return { userId, role };
}

// Produce a signed cookie value for a freshly-authenticated user. Call this from
// POST /api/auth/login after verifyPassword succeeds.
export async function signSession(payload: SessionPayload): Promise<string> {
  const raw = encodePayload(payload);
  const key = await hmacKey();
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  return `${raw}.${toHex(signature)}`;
}

// Verify a cookie value produced by signSession. Returns the payload if the signature
// checks out, otherwise null (missing cookie, tampered value, wrong/rotated secret, etc.)
// Recomputes the expected signature and compares byte-by-byte over equal-length strings —
// an acceptable constant-time-ish comparison for a take-home; Web Crypto has no built-in
// timingSafeEqual the way Node's `crypto` module does.
export async function verifySession(value: string | undefined | null): Promise<SessionPayload | null> {
  if (!value) return null;

  const dotIndex = value.lastIndexOf(".");
  if (dotIndex === -1) return null;

  const raw = value.slice(0, dotIndex);
  const signatureHex = value.slice(dotIndex + 1);

  const key = await hmacKey();
  const expectedHex = toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));

  if (signatureHex.length !== expectedHex.length) return null;

  let mismatch = 0;
  for (let i = 0; i < expectedHex.length; i++) {
    mismatch |= signatureHex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  }
  if (mismatch !== 0) return null;

  return decodePayload(raw);
}

// Shared cookie attributes for both setting (login route) and clearing (logout route).
// httpOnly stops client-side JS (and XSS payloads) from reading the session; sameSite=lax
// stops it being sent on cross-site requests.
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}
