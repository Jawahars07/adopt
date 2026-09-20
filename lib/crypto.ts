import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Credential encryption for vendor connections.
 *
 * Adopt asks customers for admin-scoped tokens: a Microsoft Graph client secret
 * with Reports.Read.All, a GitHub PAT with read:org, an Anthropic admin key.
 * Those are among the most sensitive things an IT department holds, and storing
 * them as plaintext columns would make a database dump equivalent to handing
 * over the tenant.
 *
 * AES-256-GCM, with the key held only in the environment. Ciphertext in the
 * database is useless without it. GCM is authenticated, so tampering with a
 * stored blob fails loudly rather than decrypting to garbage.
 *
 * Deliberately built on node:crypto with no dependency: a credential vault is
 * the last place to add supply-chain surface.
 *
 * KEY ROTATION: the format carries a version prefix so a future v2 can decrypt
 * v1 blobs during a rotation window. Not needed yet; the hook costs nothing now
 * and is painful to retrofit later.
 */

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12; // 96 bits, the value GCM is specified for.

export class CryptoConfigError extends Error {}

/**
 * Load the master key. Throws rather than falling back to a default — a silent
 * fallback here would mean credentials encrypted with a guessable key.
 */
function masterKey(): Buffer {
  const raw = process.env.ADOPT_ENCRYPTION_KEY;
  if (!raw) {
    throw new CryptoConfigError(
      "ADOPT_ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new CryptoConfigError(
      `ADOPT_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${key.length}. Generate one with: openssl rand -base64 32`,
    );
  }
  return key;
}

export function isEncryptionConfigured(): boolean {
  try {
    masterKey();
    return true;
  } catch {
    return false;
  }
}

/** Encrypt a credential. Output: v1.<iv>.<authTag>.<ciphertext>, base64url. */
export function encryptSecret(plaintext: string): string {
  const key = masterKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

/**
 * Decrypt a credential. Throws on tampering, wrong key, or malformed input —
 * all of which should stop a sync rather than degrade it quietly.
 */
export function decryptSecret(blob: string): string {
  const key = masterKey();
  const parts = blob.split(".");
  if (parts.length !== 4) throw new Error("Malformed credential blob.");
  const [version, ivB64, tagB64, dataB64] = parts;
  if (version !== VERSION) throw new Error(`Unsupported credential format: ${version}`);

  const iv = Buffer.from(ivB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  if (iv.length !== IV_BYTES) throw new Error("Malformed credential blob: bad IV.");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Constant-time comparison, for anything that compares a supplied token against
 * a stored one. A plain === leaks length and content through timing.
 */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Render a credential for display or logs. Never print a raw secret: sync
 * errors get written to the database and shown in the UI, and vendor SDK errors
 * have a habit of embedding the token that failed.
 */
export function maskSecret(secret: string): string {
  if (secret.length <= 8) return "*".repeat(secret.length);
  return `${secret.slice(0, 4)}${"*".repeat(Math.min(16, secret.length - 8))}${secret.slice(-4)}`;
}

/**
 * Strip anything that looks like a credential out of an error message before it
 * is persisted. Vendor errors echo tokens back more often than they should.
 */
export function scrubError(message: string): string {
  return message
    .replace(/\b(gh[pousr]_[A-Za-z0-9]{16,})\b/g, "[github-token]")
    .replace(/\b(sk-ant-[A-Za-z0-9_-]{16,})\b/g, "[anthropic-key]")
    .replace(/\b(sk-[A-Za-z0-9]{20,})\b/g, "[openai-key]")
    .replace(/\b(xox[abposr]-[A-Za-z0-9-]{10,})\b/g, "[slack-token]")
    .replace(/\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[jwt]")
    .replace(/(client_secret|password|api[_-]?key|access[_-]?token)=([^&\s]+)/gi, "$1=[redacted]")
    .slice(0, 500);
}
