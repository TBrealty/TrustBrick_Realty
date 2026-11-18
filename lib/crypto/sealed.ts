import "server-only";
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

/**
 * Sealing for the few secrets Trustbrick must keep readable: a landlord's bank account number, UPI
 * ID and PAN (the back office pays rent to them; receipts show the PAN). AES-256-GCM, a fresh IV
 * each time, stored as "v1.<iv>.<tag>.<ciphertext>" in base64url.
 *
 * The key is DATA_ENCRYPTION_KEY: 32 random bytes, base64 (`openssl rand -base64 32`). It lives
 * only in the server's environment, never in the database or its backups. On a development
 * machine and in tests, without it, a key is derived from BETTER_AUTH_SECRET instead. On the
 * live site there is no fallback: without the key, these details can't be saved or read.
 */

let cached: Buffer | null = null;

function key(): Buffer {
  if (cached) return cached;
  const given = process.env.DATA_ENCRYPTION_KEY?.trim();
  if (given) {
    const bytes = Buffer.from(given, "base64");
    if (bytes.length !== 32) throw new Error("DATA_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32).");
    cached = bytes;
  } else if (env.NODE_ENV !== "production") {
    cached = Buffer.from(hkdfSync("sha256", env.BETTER_AUTH_SECRET, "trustbrick", "sealed-data-v1", 32));
  } else {
    throw new AppError("CONFLICT", "Bank details can't be stored on this server yet: its encryption key (DATA_ENCRYPTION_KEY) isn't set.");
  }
  return cached;
}

/** Whether secrets can be sealed here. */
export function sealingAvailable(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

export function seal(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function unseal(sealed: string): string {
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || body === undefined) throw new Error("Unreadable sealed value.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}

/** A short fingerprint of a secret, for telling whether it changed without reading it. Not stored. */
export const fingerprint = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 12);
