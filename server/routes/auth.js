'use strict';

const { HttpError } = require('../lib/http');
const { hashPassword, verifyPassword, createToken } = require('../lib/security');
const { safeUser, str, email } = require('./helpers');

const attempts = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;

const checkRateLimit = (key) => {
    const now = Date.now();
    const entry = attempts.get(key);
    if (!entry || now - entry.firstAt > WINDOW_MS) {
        attempts.set(key, { count: 1, firstAt: now });
        return;
    }
    entry.count += 1;
    if (entry.count > MAX_ATTEMPTS) {
        const wait = Math.ceil((WINDOW_MS - (now - entry.firstAt)) / 60000);
        throw new HttpError(429, `Too many login attempts. Please try again in ${wait} minute(s).`, 'rate_limited');
    }
};

const clearRateLimit = (key) => attempts.delete(key);

/**
 * Register authentication routes.
 *
 * @param {ReturnType<typeof import('../lib/router').createRouter>} router
 * @param {object} deps
 */
const registerAuthRoutes = (router, deps) => {
    const { load, mutate, setSessionCookie, clearSessionCookie } = deps;

    router.post('/api/auth/login', (ctx) => {
        const db = load();
        const emailInput = email(ctx.body.email);
        const password = str(ctx.body.password, 200);
        const remember = Boolean(ctx.body.remember);

        if (!emailInput || !password) {
            throw new HttpError(422, 'Email and password are required.', 'missing_credentials');
        }

        const rateKey = `${ctx.ip}:${emailInput}`;
        checkRateLimit(rateKey);

        const user = db.users.find((item) => item.email.toLowerCase() === emailInput);
        if (!user || !verifyPassword(password, user.passwordHash)) {
            throw new HttpError(401, 'Incorrect email or password.', 'invalid_credentials');
        }

        clearRateLimit(rateKey);

        const { token, expiresIn } = createToken(user.id, remember);
        mutate((database) => {
            const target = database.users.find((item) => item.id === user.id);
            target.lastLoginAt = new Date().toISOString();
        });

        setSessionCookie(ctx.res, token, expiresIn);

        return {
            token,
            expiresIn,
            user: safeUser({ ...user, lastLoginAt: new Date().toISOString() }),
        };
    });

    router.get('/api/auth/me', (ctx) => ({ user: safeUser(ctx.user) }), { auth: true });

    router.post('/api/auth/logout', (ctx) => {
        clearSessionCookie(ctx.res);
        return { ok: true };
    });

    router.patch('/api/auth/me', (ctx) => {
        const name = str(ctx.body.name, 80);
        const emailInput = email(ctx.body.email);

        if (name.length < 2) {
            throw new HttpError(422, 'Please provide your name.', 'invalid_name');
        }
        if (!emailInput) {
            throw new HttpError(422, 'Please provide a valid email address.', 'invalid_email');
        }

        const updated = mutate((db) => {
            if (db.users.some((item) => item.id !== ctx.user.id && item.email.toLowerCase() === emailInput)) {
                throw new HttpError(409, 'That email is already used by another account.', 'email_taken');
            }
            const user = db.users.find((item) => item.id === ctx.user.id);
            user.name = name;
            user.email = emailInput;
            return safeUser(user);
        });

        return { user: updated };
    }, { auth: true });

    router.post('/api/auth/password', (ctx) => {
        const current = str(ctx.body.currentPassword, 200);
        const next = str(ctx.body.newPassword, 200);

        if (next.length < 8) {
            throw new HttpError(422, 'Your new password must be at least 8 characters.', 'weak_password');
        }
        if (current === next) {
            throw new HttpError(422, 'Your new password must be different from the current one.', 'same_password');
        }

        const user = load().users.find((item) => item.id === ctx.user.id);
        if (!verifyPassword(current, user.passwordHash)) {
            throw new HttpError(401, 'Your current password is incorrect.', 'invalid_password');
        }

        mutate((db) => {
            const target = db.users.find((item) => item.id === ctx.user.id);
            target.passwordHash = hashPassword(next);
        });

        return { ok: true };
    }, { auth: true });
};

module.exports = { registerAuthRoutes };
