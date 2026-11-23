'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = process.env.SAS_DATA_DIR ? path.resolve(process.env.SAS_DATA_DIR) : path.join(__dirname, '..', '..', 'data');
const SECRET_FILE = path.join(DATA_DIR, '.secret');

/**
 * Resolve the HMAC signing secret.
 * Priority: SAS_SECRET env var -> persisted .secret file -> freshly generated.
 *
 * @returns {string}
 */
const resolveSecret = () => {
    const provided = process.env.SAS_SECRET || '';
    const looksLikePlaceholder = /replace-with|change[-_ ]?me|your[-_ ]?secret/i.test(provided);

    if (provided.length >= 16 && !looksLikePlaceholder) {
        return provided;
    }

    if (provided && looksLikePlaceholder) {
        console.warn('[security] SAS_SECRET looks like a placeholder - generating data/.secret instead.');
    } else if (provided) {
        console.warn('[security] SAS_SECRET is shorter than 16 characters - generating data/.secret instead.');
    }

    fs.mkdirSync(DATA_DIR, { recursive: true });

    if (fs.existsSync(SECRET_FILE)) {
        const saved = fs.readFileSync(SECRET_FILE, 'utf8').trim();
        if (saved.length >= 16) {
            return saved;
        }
    }

    const secret = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(SECRET_FILE, secret, 'utf8');
    return secret;
};

const SECRET = resolveSecret();
const TOKEN_TTL_SECONDS = 60 * 60 * 12;
const REMEMBER_TTL_SECONDS = 60 * 60 * 24 * 30;

const scryptHash = (password, salt) => crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 });

/**
 * Hash a plain password with scrypt.
 *
 * @param {string} password
 * @returns {string} `scrypt$salt$hash`
 */
const hashPassword = (password) => {
    const salt = crypto.randomBytes(16);
    const hash = scryptHash(password, salt);
    return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
};

/**
 * Verify a plain password against a stored scrypt hash.
 *
 * @param {string} password
 * @param {string} stored
 * @returns {boolean}
 */
const verifyPassword = (password, stored) => {
    if (typeof stored !== 'string') {
        return false;
    }

    const [scheme, saltB64, hashB64] = stored.split('$');
    if (scheme !== 'scrypt' || !saltB64 || !hashB64) {
        return false;
    }

    try {
        const salt = Buffer.from(saltB64, 'base64');
        const expected = Buffer.from(hashB64, 'base64');
        const actual = scryptHash(password, salt);
        return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
    } catch {
        return false;
    }
};

const base64url = (input) => Buffer.from(input).toString('base64url');
const sign = (value) => crypto.createHmac('sha256', SECRET).update(value).digest('base64url');

/**
 * Create a signed session token.
 *
 * @param {string} userId
 * @param {boolean} remember
 * @returns {{ token: string, expiresIn: number }}
 */
const createToken = (userId, remember) => {
    const expiresIn = remember ? REMEMBER_TTL_SECONDS : TOKEN_TTL_SECONDS;
    const payload = {
        sub: userId,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + expiresIn,
        jti: crypto.randomBytes(9).toString('hex'),
    };

    const body = base64url(JSON.stringify(payload));
    return { token: `${body}.${sign(body)}`, expiresIn };
};

/**
 * Verify a session token and return its payload.
 *
 * @param {string} token
 * @returns {{ sub: string, iat: number, exp: number, jti: string }|null}
 */
const verifyToken = (token) => {
    if (typeof token !== 'string' || !token.includes('.')) {
        return null;
    }

    const [body, signature] = token.split('.');
    if (!body || !signature) {
        return null;
    }

    const expected = sign(body);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return null;
    }

    try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
        if (!payload || typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) {
            return null;
        }
        return payload;
    } catch {
        return null;
    }
};

const CODE_ALPHABET = 'ACDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Generate a human friendly invitation code, e.g. SAS-7KQ4M.
 *
 * @param {string} [prefix]
 * @returns {string}
 */
const generateCode = (prefix = 'SAS') => {
    let body = '';
    for (let i = 0; i < 5; i += 1) {
        body += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
    }
    return `${prefix}-${body}`;
};

/**
 * Generate a unique id with a readable prefix.
 *
 * @param {string} [prefix]
 * @returns {string}
 */
const generateId = (prefix = 'id') => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;

module.exports = {
    hashPassword,
    verifyPassword,
    createToken,
    verifyToken,
    generateCode,
    generateId,
    TOKEN_TTL_SECONDS,
    REMEMBER_TTL_SECONDS,
};
