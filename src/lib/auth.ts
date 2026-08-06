// Password hashing helpers.
//
// Uses Node's built-in `crypto.scrypt` instead of a library like bcrypt so we don't need
// a new dependency. Scrypt is a memory-hard KDF, which is what you want for password
// storage (plain SHA-256 is deliberately NOT used here — it's fast, which makes brute
// forcing a leaked hash cheap).
//
// Stored format is "saltHex:hashHex" so each password gets its own random salt (prevents
// two users with the same password from having identical hashes, and defeats rainbow tables).

import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const SALT_BYTES = 16;
const KEY_LENGTH = 64;

// Hash a plaintext password for storage. Call this in prisma/seed.ts and anywhere else
// a user's password is set (e.g. a future "sign up" or "change password" flow).
export function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_BYTES).toString("hex");
  const hash = scryptSync(plain, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

// Check a plaintext password attempt against a stored "saltHex:hashHex" value.
// Uses timingSafeEqual so response time doesn't leak how many bytes matched.
export function verifyPassword(plain: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;

  const hashBuffer = Buffer.from(hash, "hex");
  const attemptBuffer = scryptSync(plain, salt, KEY_LENGTH);

  // timingSafeEqual throws if lengths differ, so guard that first.
  if (hashBuffer.length !== attemptBuffer.length) return false;

  return timingSafeEqual(hashBuffer, attemptBuffer);
}
