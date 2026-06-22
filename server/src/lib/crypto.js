import crypto from 'node:crypto';

const PREFIX = 'enc:v1:';

/**
 * Validate that the key, if provided, decodes to exactly 32 bytes.
 * Called at server startup so a misconfigured key fails fast.
 *
 * @param {string|null|undefined} keyB64
 */
export function validateKey(keyB64) {
  if (!keyB64) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'MANUSCRIPT_ENCRYPTION_KEY is required in production. ' +
        'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64url\'))"'
      );
    }
    return;
  }
  const buf = Buffer.from(keyB64, 'base64url');
  if (buf.length !== 32) {
    throw new Error(
      `MANUSCRIPT_ENCRYPTION_KEY must decode to 32 bytes (got ${buf.length}). ` +
      `Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
    );
  }
}

/**
 * @param {string} value
 * @returns {boolean}
 */
export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Returns the plaintext unchanged if the key is absent or the value is null/empty.
 *
 * @param {string|null|undefined} plaintext
 * @param {string|null|undefined} keyB64  - base64url-encoded 32-byte key
 * @returns {string|null|undefined}
 */
export function encryptField(plaintext, keyB64) {
  if (plaintext == null || plaintext === '') return plaintext ?? null;
  if (!keyB64) return plaintext;

  const key = Buffer.from(keyB64, 'base64url');
  const iv  = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`;
}

/**
 * Decrypt a value that was encrypted by encryptField.
 * Returns the value unchanged if it is not in encrypted format.
 * Returns null if the key is absent but the value IS encrypted (unreadable without the key).
 * Returns null (and does not throw) if decryption fails (wrong key, tampered data).
 *
 * @param {string|null|undefined} ciphertext
 * @param {string|null|undefined} keyB64
 * @returns {string|null|undefined}
 */
export function decryptField(ciphertext, keyB64) {
  if (ciphertext == null || ciphertext === '') return ciphertext ?? null;
  if (!isEncrypted(ciphertext)) return ciphertext;
  if (!keyB64) return null;

  try {
    const parts = ciphertext.slice(PREFIX.length).split(':');
    if (parts.length !== 3) return null;
    const [ivHex, tagHex, ctHex] = parts;
    const key     = Buffer.from(keyB64, 'base64url');
    const iv      = Buffer.from(ivHex,  'hex');
    const tag     = Buffer.from(tagHex, 'hex');
    const ct      = Buffer.from(ctHex,  'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(ct, undefined, 'utf8') + decipher.final('utf8');
  } catch {
    return null;
  }
}
