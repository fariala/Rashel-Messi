'use strict';

const { HttpError } = require('../lib/http');
const qr = require('../lib/qr');
const { load, mutate } = require('../lib/store');
const { generateId } = require('../lib/security');
const { localizeInvitation } = require('../lib/invitation-language');
const {
    str, email, number, invitationLink, findGuestByCode, logActivity,
} = require('./helpers');

/**
 * Register public (guest facing) routes.
 *
 * @param {object} router
 */
const registerPublicRoutes = (router) => {
    router.get('/api/public/invitation', (ctx) => {
        const db = load();
        const settings = db.settings;
        const language = ctx.query.lang === 'fr' ? 'fr' : 'en';
        ctx.res.setHeader('Content-Language', language);

        if (!settings.published) {
            return {
                published: false,
                brandName: settings.brandName,
                now: new Date().toISOString(),
            };
        }

        const code = str(ctx.query.code, 40);
        const fallbackName = str(ctx.query.to, 80);
        const guest = code ? findGuestByCode(db.guests, code) : null;

        return {
            published: true,
            brandName: settings.brandName,
            slug: settings.slug,
            theme: settings.theme,
            content: localizeInvitation(db.content, language),
            now: new Date().toISOString(),
            guest: guest ? {
                name: guest.name,
                code: guest.code,
                seats: guest.seats,
                rsvpStatus: guest.rsvpStatus,
                rsvpSeats: guest.rsvpSeats,
                message: guest.message,
                checkedInAt: guest.checkedInAt,
            } : null,
            greeting: guest ? guest.name : fallbackName,
            invalidCode: Boolean(code) && !guest,
            passLink: guest ? `/api/public/pass/${encodeURIComponent(guest.code)}` : null,
            invitationLink: invitationLink(ctx, guest ? guest.code : undefined),
        };
    });

    router.post('/api/public/rsvp', (ctx) => {
        const db = load();
        const content = db.content || {};
        const rsvpConfig = content.rsvp || {};

        if (db.settings.published === false) {
            throw new HttpError(403, 'This invitation is not available yet.', 'unpublished');
        }
        if (rsvpConfig.enabled === false) {
            throw new HttpError(403, 'RSVP is currently closed for this invitation.', 'rsvp_disabled');
        }
        if (rsvpConfig.deadline && new Date(`${rsvpConfig.deadline}T23:59:59`) < new Date()) {
            throw new HttpError(422, 'The RSVP period has closed. Please contact the couple directly.', 'rsvp_closed');
        }

        const code = str(ctx.body.code, 40);
        const attendance = str(ctx.body.attendance, 20).toLowerCase();
        const maxSeats = number(rsvpConfig.maxSeats, 1, 12, 6);

        if (!['attending', 'declined'].includes(attendance)) {
            throw new HttpError(422, 'Please choose whether you will attend.', 'invalid_attendance');
        }

        const guest = code ? findGuestByCode(db.guests, code) : null;
        if (code && !guest) {
            throw new HttpError(404, 'We could not find that invitation code.', 'guest_not_found');
        }

        const name = guest ? guest.name : str(ctx.body.name, 80);
        if (name.length < 2) {
            throw new HttpError(422, 'Please tell us your name.', 'invalid_name');
        }

        const seats = attendance === 'attending' ? number(ctx.body.seats, 1, maxSeats, 1) : 0;
        const message = str(ctx.body.message, 500);
        const now = new Date().toISOString();

        const saved = mutate((database) => {
            let target = guest ? database.guests.find((item) => item.id === guest.id) : null;

            if (!target) {
                target = database.guests.find((item) => item.name.toLowerCase() === name.toLowerCase()) || null;
            }

            if (target) {
                target.rsvpStatus = attendance;
                target.rsvpSeats = seats;
                target.message = message;
                target.rsvpAt = now;
                target.updatedAt = now;
                target.email = target.email || email(ctx.body.email);
            }

            const existingRsvp = target
                ? database.rsvps.find((item) => item.guestId === target.id)
                : database.rsvps.find((item) => !item.guestId && item.name.toLowerCase() === name.toLowerCase());

            if (existingRsvp) {
                existingRsvp.attendance = attendance;
                existingRsvp.seats = seats;
                existingRsvp.message = message;
                existingRsvp.updatedAt = now;
            } else {
                database.rsvps.push({
                    id: generateId('rsv'),
                    guestId: target ? target.id : null,
                    name,
                    code: target ? target.code : null,
                    attendance,
                    seats,
                    message,
                    createdAt: now,
                    updatedAt: now,
                });
            }

            logActivity(database, attendance === 'attending' ? 'rsvp_attending' : 'rsvp_declined',
                `${name} ${attendance === 'attending' ? 'confirmed attendance' : 'declined the invitation'}`,
                { guestId: target ? target.id : null });

            return { name, code: target ? target.code : null };
        });

        return {
            ok: true,
            name: saved.name,
            code: saved.code,
            attendance,
            seats,
            message: attendance === 'attending'
                ? `Thank you, ${saved.name}! We cannot wait to celebrate with you.`
                : `Thank you for letting us know, ${saved.name}. You will be missed.`,
        };
    });

    router.get('/api/public/pass/:code', async (ctx) => {
        const db = load();
        const guest = findGuestByCode(db.guests, ctx.params.code);
        if (!guest) {
            throw new HttpError(404, 'Invitation pass not found.', 'not_found');
        }

        const link = invitationLink(ctx, guest.code);

        if (str(ctx.query.format, 10, 'json').toLowerCase() === 'png') {
            const buffer = await qr.toPng(link, 720);
            ctx.res.writeHead(200, {
                'Content-Type': 'image/png',
                'Content-Disposition': `inline; filename="${guest.code}.png"`,
                'Cache-Control': 'private, max-age=300',
            });
            ctx.res.end(buffer);
            return undefined;
        }

        return {
            name: guest.name,
            code: guest.code,
            checkedInAt: guest.checkedInAt,
            link,
            dataUrl: await qr.toDataUrl(link, 420),
        };
    });

    router.get('/api/public/health', () => ({ ok: true, time: new Date().toISOString() }));
};

module.exports = { registerPublicRoutes };

