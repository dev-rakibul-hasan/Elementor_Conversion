import crypto from 'crypto';
import { env } from '../../config/index.js';
import { AppError } from '../../lib/errors.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Resolves a 32-byte Buffer key from the configured encryption key string.
 * Handles 64-char hex strings, 32-byte strings, or derives a 32-byte key via SHA-256.
 */
function resolveKey(customKey?: string): Buffer {
  const rawKey = customKey || env.SITE_CREDENTIAL_ENCRYPTION_KEY;
  if (!rawKey) {
    throw new AppError('Encryption key is not configured', 500, 'SECURITY_CONFIG_ERROR');
  }

  // If 64-char hex string, decode directly
  if (rawKey.length === 64 && /^[0-9a-fA-F]+$/.test(rawKey)) {
    return Buffer.from(rawKey, 'hex');
  }

  // If exactly 32 bytes in UTF-8
  const utf8Buf = Buffer.from(rawKey, 'utf8');
  if (utf8Buf.length === 32) {
    return utf8Buf;
  }

  // Otherwise, deterministically hash to 32 bytes using SHA-256
  return crypto.createHash('sha256').update(rawKey).digest();
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a base64-encoded string combining IV, Auth Tag, and Ciphertext.
 * 
 * Format: base64(IV [12 bytes] + AuthTag [16 bytes] + Ciphertext)
 */
export function encrypt(plaintext: string, key?: string): string {
  if (plaintext === undefined || plaintext === null) {
    throw new AppError('Plaintext cannot be null or undefined for encryption', 400, 'ENCRYPTION_ERROR');
  }

  const keyBuffer = resolveKey(key);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Combine IV (12) + Tag (16) + Encrypted
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString('base64');
}

/**
 * Decrypts a base64-encoded AES-256-GCM ciphertext created by encrypt().
 * Also supports colon-separated format (iv:tag:ciphertext) for backward compatibility.
 */
export function decrypt(ciphertext: string, key?: string): string {
  if (!ciphertext) {
    throw new AppError('Ciphertext cannot be empty for decryption', 400, 'DECRYPTION_ERROR');
  }

  const keyBuffer = resolveKey(key);

  try {
    // Check if colon-separated hex format (iv:tag:ciphertext)
    if (ciphertext.includes(':')) {
      const parts = ciphertext.split(':');
      if (parts.length === 3) {
        const iv = Buffer.from(parts[0], 'hex');
        const authTag = Buffer.from(parts[1], 'hex');
        const encrypted = Buffer.from(parts[2], 'hex');

        const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv, {
          authTagLength: AUTH_TAG_LENGTH,
        });
        decipher.setAuthTag(authTag);

        const decrypted = Buffer.concat([
          decipher.update(encrypted),
          decipher.final(),
        ]);
        return decrypted.toString('utf8');
      }
    }

    // Default: Combined Base64 format
    const buffer = Buffer.from(ciphertext, 'base64');
    if (buffer.length < IV_LENGTH + AUTH_TAG_LENGTH) {
      throw new Error('Ciphertext buffer is too short');
    }

    const iv = buffer.subarray(0, IV_LENGTH);
    const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch (err: unknown) {
    throw new AppError(
      'Failed to decrypt ciphertext. Invalid key or corrupted data.',
      400,
      'DECRYPTION_FAILED',
      err instanceof Error ? err.message : undefined
    );
  }
}
