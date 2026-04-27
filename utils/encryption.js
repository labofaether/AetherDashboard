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
 * Encrypt a JSON-serializable value. Returns a string "iv:authTag:ciphertext" (all hex).
 * If no ENCRYPTION_KEY is set, returns the value as-is (backwards compatible).
 */
function encrypt(value) {
    const key = getKey();
    if (!key) return value;

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    const plaintext = JSON.stringify(value);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return `enc:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt a value produced by encrypt(). If value is not an encrypted string, returns it as-is.
 */
function decrypt(value) {
    if (typeof value !== 'string' || !value.startsWith('enc:')) {
        return value;
    }

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
