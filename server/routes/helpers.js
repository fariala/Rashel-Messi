'use strict';

const { HttpError } = require('../lib/http');
const { generateId, generateCode } = require('../lib/security');

const CATEGORIES = ['Family', 'Friend', 'Colleague', 'VIP', 'Other'];
const RSVP_STATUSES = ['pending', 'attending', 'declined'];

const str = (value, max = 500, fallback = '') => {
    if (value === null || value === undefined) {
        return fallback;
    }
    return String(value).split(String.fromCharCode(0)).join('').trim().slice(0, max);
};

const email = (value) => {
    const clean = str(value, 160).toLowerCase();
    if (!clean) {
        return '';
    }
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) ? clean : '';
};

const phone = (value) => str(value, 32).replace(/[^\d+\-()\s]/g, '');

const number = (value, min, max, fallback) => {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) {
        return fallback;
    }
    return Math.min(Math.max(parsed, min), max);
};

const origin = (ctx) => {
    if (ctx.origin) {
        return ctx.origin;
    }
    const proto = (ctx.req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
    const host = ctx.req.headers['x-forwarded-host'] || ctx.req.headers.host || `localhost:${process.env.PORT || 3000}`;
    return `${proto}://${host}`;
};

/**
 * Resolve the canonical public invitation link for a guest code.
 *
 * @param {object} ctx
 * @param {string} [code]
 * @returns {string}
 */
const invitationLink = (ctx, code) => {
    const base = ctx.settings && ctx.settings.publicUrl ? ctx.settings.publicUrl.replace(/\/+$/, '') : origin(ctx);
    const url = new URL(`${base}/invite.html`);
    if (code) {
        url.searchParams.set('code', code);
    }
    return url.toString();
};

/**
 * Extract a guest code from a raw code or a scanned invitation URL.
 *
 * @param {string} raw
 * @returns {string}
 */
const normalizeCode = (raw) => {
    const value = str(raw, 400).toUpperCase();
    if (!value) {
        return '';
    }

    const match = value.match(/[?&]CODE=([^&#\s]+)/);
    if (match) {
        return decodeURIComponent(match[1]);
    }

    return value.replace(/\s+/g, '');
};

const findGuestByCode = (guests, raw) => {
    const code = normalizeCode(raw);
    if (!code) {
        return null;
    }
    return guests.find((guest) => guest.code.toUpperCase() === code)
        || guests.find((guest) => guest.code.toUpperCase().replace(/^SAS-/, '') === code.replace(/^SAS-/, ''))
        || null;
};

/**
 * Append an entry to the activity log (newest first, capped at 200).
 *
 * @param {object} db
 * @param {string} type
 * @param {string} message
 * @param {object} [meta]
 */
const logActivity = (db, type, message, meta = {}) => {
    db.activity.unshift({
        id: generateId('act'),
        type,
        message: str(message, 240),
        at: new Date().toISOString(),
        ...meta,
    });
    db.activity = db.activity.slice(0, 200);
};

const safeUser = (user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
});

const guestPayload = (body, existing = {}) => {
    const name = str(body.name, 80);
    if (name.length < 2) {
        throw new HttpError(422, 'Guest name must be at least 2 characters.', 'invalid_name');
    }

    const categoryInput = str(body.category, 30, existing.category || 'Friend');
    const category = CATEGORIES.find((item) => item.toLowerCase() === categoryInput.toLowerCase()) || 'Other';
    const statusInput = str(body.rsvpStatus, 20, existing.rsvpStatus || 'pending').toLowerCase();
    const rsvpStatus = RSVP_STATUSES.includes(statusInput) ? statusInput : 'pending';

    return {
        name,
        category,
        seats: number(body.seats, 1, 12, existing.seats || 1),
        phone: phone(body.phone !== undefined ? body.phone : existing.phone),
        email: email(body.email !== undefined ? body.email : existing.email),
        note: str(body.note !== undefined ? body.note : existing.note, 300),
        rsvpStatus,
    };
};

const uniqueCode = (guests) => {
    for (let i = 0; i < 50; i += 1) {
        const code = generateCode('SAS');
        if (!guests.some((guest) => guest.code === code)) {
            return code;
        }
    }
    return `SAS-${Date.now().toString(36).toUpperCase()}`;
};

/**
 * Escape a value for CSV output.
 *
 * @param {any} value
 * @returns {string}
 */
const csvCell = (value) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const toCsv = (headers, rows) => [
    headers.map((header) => csvCell(header.label)).join(','),
    ...rows.map((row) => headers.map((header) => csvCell(row[header.key])).join(',')),
].join('\r\n');

/**
 * Deep-sanitize CMS content: trim strings, cap lengths and array sizes.
 *
 * @param {any} value
 * @param {number} [depth]
 * @returns {any}
 */
const sanitize = (value, depth = 0) => {
    if (depth > 6) {
        return null;
    }
    if (typeof value === 'string') {
        return value.split(String.fromCharCode(0)).join('').slice(0, 4000);
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    if (Array.isArray(value)) {
        return value.slice(0, 120).map((item) => sanitize(item, depth + 1));
    }
    if (value && typeof value === 'object') {
        const out = {};
        Object.keys(value).slice(0, 80).forEach((key) => {
            if (['__proto__', 'constructor', 'prototype'].includes(key)) {
                return;
            }
            out[key] = sanitize(value[key], depth + 1);
        });
        return out;
    }
    return null;
};

module.exports = {
    CATEGORIES,
    RSVP_STATUSES,
    str,
    email,
    phone,
    number,
    origin,
    invitationLink,
    normalizeCode,
    findGuestByCode,
    logActivity,
    safeUser,
    guestPayload,
    uniqueCode,
    toCsv,
    sanitize,
};
