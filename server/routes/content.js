'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { HttpError } = require('../lib/http');
const { sanitize, str, number, logActivity } = require('./helpers');
const { UPLOAD_DIR } = require('../lib/store');

const HEX = /^#[0-9a-f]{6}$/i;

const mediaDataUrl = (dataUrl, name) => {
    const match = /^data:(image\/(png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(str(dataUrl, 9000000));
    if (!match) {
        throw new HttpError(422, 'Please upload a PNG, JPG, WEBP or GIF image.', 'invalid_image');
    }

    const mime = match[1] === 'image/jpg' ? 'image/jpeg' : match[1];
    const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[mime];
    const buffer = Buffer.from(match[3], 'base64');

    if (buffer.length > 4 * 1024 * 1024) {
        throw new HttpError(413, 'Images must be smaller than 4 MB.', 'image_too_large');
    }

    const base = str(name, 60).replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'image';
    const filename = `${base.slice(0, 40)}-${Date.now().toString(36)}.${ext}`;
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);

    return { url: `/uploads/${filename}`, size: buffer.length, type: mime };
};

/**
 * Register CMS, settings, media and RSVP routes.
 *
 * @param {object} router
 * @param {object} deps
 */
const registerContentRoutes = (router, deps) => {
    const { load, mutate } = deps;

    router.get('/api/admin/content', () => {
        const db = load();
        return { content: db.content, settings: db.settings };
    }, { auth: true });

    router.put('/api/admin/content', (ctx) => {
        const incoming = ctx.body && ctx.body.content;
        if (!incoming || typeof incoming !== 'object') {
            throw new HttpError(422, 'Invitation content is required.', 'invalid_content');
        }

        const content = sanitize(incoming);
        const db = mutate((database) => {
            database.content = content;
            logActivity(database, 'content_updated', 'Invitation content was updated');
            return database;
        });

        return { content: db.content };
    }, { auth: true });

    router.put('/api/admin/settings', (ctx) => {
        const body = ctx.body || {};
        const brandName = str(body.brandName, 80);
        const slug = str(body.slug, 60).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        const theme = body.theme && typeof body.theme === 'object' ? body.theme : {};

        if (brandName.length < 2) {
            throw new HttpError(422, 'Your studio name must be at least 2 characters.', 'invalid_brand');
        }
        if (slug.length < 2) {
            throw new HttpError(422, 'Please provide a valid invitation slug.', 'invalid_slug');
        }

        const updated = mutate((database) => {
            database.settings = {
                ...database.settings,
                brandName,
                slug,
                published: Boolean(body.published),
                defaultSeats: number(body.defaultSeats, 1, 12, database.settings.defaultSeats || 2),
                timezone: str(body.timezone, 60, database.settings.timezone || 'Asia/Makassar'),
                publicUrl: str(body.publicUrl, 200, database.settings.publicUrl || ''),
                theme: {
                    primary: HEX.test(theme.primary) ? theme.primary : database.settings.theme.primary,
                    accent: HEX.test(theme.accent) ? theme.accent : database.settings.theme.accent,
                    ink: HEX.test(theme.ink) ? theme.ink : database.settings.theme.ink,
                    surface: HEX.test(theme.surface) ? theme.surface : database.settings.theme.surface,
                },
                updatedAt: new Date().toISOString(),
            };

            if (Boolean(body.published) !== Boolean(database.settings.published)) {
                logActivity(database, 'publish', database.settings.published ? 'Invitation published' : 'Invitation unpublished');
            }

            return database.settings;
        });

        return { settings: updated };
    }, { auth: true });

    router.post('/api/admin/media', (ctx) => {
        const file = mediaDataUrl(ctx.body.dataUrl, ctx.body.name);
        return { file };
    }, { auth: true });

    router.get('/api/admin/backup', (ctx) => {
        const db = load();
        const payload = {
            exportedAt: new Date().toISOString(),
            settings: db.settings,
            content: db.content,
            guests: db.guests,
            rsvps: db.rsvps,
            activity: db.activity,
        };

        ctx.res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Disposition': `attachment; filename="sas-backup-${new Date().toISOString().slice(0, 10)}.json"`,
            'Cache-Control': 'no-store',
        });
        ctx.res.end(JSON.stringify(payload, null, 2));
        return undefined;
    }, { auth: true });
};

module.exports = { registerContentRoutes };
