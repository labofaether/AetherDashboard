const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey() {
    const secret = process.env.ENCRYPTION_KEY;
    if (!secret) return null;
    // Derive a 32-byte key from the secret
    return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypt a JSON-serializable value. Always returns a string so callers can hand
 * the result directly to better-sqlite3 (which rejects raw objects). Encrypted
 * form is "enc:iv:authTag:ciphertext"; without a key we fall back to plain
 * JSON, prefixed "json:" so decrypt() can tell the two apart.
 */
function encrypt(value) {
    const key = getKey();
    if (!key) return 'json:' + JSON.stringify(value);

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    const plaintext = JSON.stringify(value);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return `enc:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt a value produced by encrypt(). Handles both "enc:" (AES-GCM) and
 * "json:" (no-key fallback) prefixes. Anything else (raw, legacy) is returned
 * as-is.
 */
function decrypt(value) {
    if (typeof value !== 'string') return value;
    if (value.startsWith('json:')) {
        try { return JSON.parse(value.slice(5)); }
        catch { return null; }
    }
    if (!value.startsWith('enc:')) return value;

    const key = getKey();
    if (!key) return value;

    const parts = value.split(':');
    if (parts.length !== 4) return value;

    const [, ivHex, authTagHex, ciphertext] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    try {
        return JSON.parse(decrypted);
    } catch (err) {
        // Decryption succeeded but plaintext is not valid JSON — treat as corrupted.
        // Return null so callers (e.g. EmailModel.loadProvider) can handle missing tokens
        // instead of crashing the request.
        return null;
    }
}

module.exports = { encrypt, decrypt };
