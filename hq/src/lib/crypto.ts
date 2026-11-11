import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for secrets we hold on people's behalf (calendar tokens, feed URLs).
 * The key comes from TOKEN_ENCRYPTION_KEY. Without one, Orbit derives a key from the
 * database URL so a leaked database dump alone can't read the tokens; set the variable
 * on Railway for real protection.
 */
let warned = false;
function key() {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    if (!warned && process.env.NODE_ENV === "production") {
      console.warn("TOKEN_ENCRYPTION_KEY is not set: calendar tokens are encrypted with a key derived from DATABASE_URL. Set a random 32+ character value.");
      warned = true;
    }
  }
  return createHash("sha256").update(raw || `orbit:${process.env.DATABASE_URL ?? "local"}`).digest();
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${body.toString("base64url")}`;
}

export function decrypt(blob: string | null | undefined): string | null {
  if (!blob) return null;
  if (!blob.startsWith("v1.")) return blob; // never-encrypted value (shouldn't happen, but don't lose it)
  const [, iv, tag, body] = blob.split(".");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(body, "base64url")), d.final()]).toString("utf8");
}
