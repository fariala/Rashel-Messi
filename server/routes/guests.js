'use strict';

const { HttpError } = require('../lib/http');
const qr = require('../lib/qr');
const { generateId } = require('../lib/security');
const {
    CATEGORIES, str, number, invitationLink, findGuestByCode,
    logActivity, guestPayload, uniqueCode, toCsv,
} = require('./helpers');

const summarise = (guests) => {
    const summary = {
        total: guests.length,
        seats: 0,
        invited: 0,
        attending: 0,
        declined: 0,
        pending: 0,
        checkedIn: 0,
        attendingSeats: 0,
        checkedInSeats: 0,
        categories: {},
    };

    CATEGORIES.forEach((category) => {
        summary.categories[category] = 0;
    });

    guests.forEach((guest) => {
        summary.seats += guest.seats;
        summary.categories[guest.category] = (summary.categories[guest.category] || 0) + 1;

        if (guest.invitedAt) {
            summary.invited += 1;
        }
        if (guest.rsvpStatus === 'attending') {
            summary.attending += 1;
            summary.attendingSeats += guest.rsvpSeats || guest.seats;
        } else if (guest.rsvpStatus === 'declined') {
            summary.declined += 1;
        } else {
            summary.pending += 1;
        }
        if (guest.checkedInAt) {
            summary.checkedIn += 1;
            summary.checkedInSeats += guest.rsvpSeats || guest.seats;
        }
    });

    return summary;
};

const filterGuests = (guests, query) => {
    const search = str(query.search, 80).toLowerCase();
    const status = str(query.status, 20, 'all').toLowerCase();
    const category = str(query.category, 30, 'all');
    const checkin = str(query.checkin, 10, 'all').toLowerCase();

    return guests.filter((guest) => {
        if (search) {
            const haystack = `${guest.name} ${guest.code} ${guest.phone} ${guest.email}`.toLowerCase();
            if (!haystack.includes(search)) {
                return false;
            }
        }
        if (status !== 'all' && guest.rsvpStatus !== status) {
            return false;
        }
        if (category !== 'all' && guest.category !== category) {
            return false;
        }
        if (checkin === 'yes' && !guest.checkedInAt) {
            return false;
        }
        if (checkin === 'no' && guest.checkedInAt) {
            return false;
        }
        return true;
    });
};

const sortGuests = (guests, sort) => {
    const list = [...guests];
    switch (sort) {
        case 'name':
            return list.sort((a, b) => a.name.localeCompare(b.name));
        case 'checkin':
            return list.sort((a, b) => String(b.checkedInAt || '').localeCompare(String(a.checkedInAt || '')));
        case 'rsvp':
            return list.sort((a, b) => String(b.rsvpAt || '').localeCompare(String(a.rsvpAt || '')));
        default:
            return list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    }
};

/**
 * Register guest management routes.
 *
 * @param {object} router
 * @param {object} deps
 */
const registerGuestRoutes = (router, deps) => {
    const { load, mutate } = deps;

    router.get('/api/admin/guests', (ctx) => {
        const db = load();
        const page = number(ctx.query.page, 1, 100000, 1);
        const limit = number(ctx.query.limit, 5, 100, 10);
        const filtered = sortGuests(filterGuests(db.guests, ctx.query), str(ctx.query.sort, 20, 'recent'));
        const pages = Math.max(Math.ceil(filtered.length / limit), 1);
        const safePage = Math.min(page, pages);
        const offset = (safePage - 1) * limit;

        return {
            items: filtered.slice(offset, offset + limit),
            total: filtered.length,
            page: safePage,
            pages,
            limit,
            summary: summarise(db.guests),
            filteredSummary: summarise(filtered),
            categories: CATEGORIES,
        };
    }, { auth: true });

    router.post('/api/admin/guests', (ctx) => {
        const created = mutate((db) => {
            const payload = guestPayload(ctx.body);
            if (payload.email && db.guests.some((guest) => guest.email && guest.email.toLowerCase() === payload.email)) {
                throw new HttpError(409, 'A guest with that email already exists.', 'duplicate_guest');
            }

            const now = new Date().toISOString();
            const guest = {
                id: generateId('gst'),
                code: uniqueCode(db.guests),
                ...payload,
                rsvpSeats: payload.rsvpStatus === 'attending' ? payload.seats : 0,
                message: '',
                invitedAt: ctx.body.markInvited ? now : null,
                rsvpAt: null,
                checkedInAt: null,
                createdAt: now,
                updatedAt: now,
            };

            db.guests.push(guest);
            logActivity(db, 'guest_added', `${guest.name} was added to the guest list`, { guestId: guest.id });
            return guest;
        });

        return { guest: created, link: invitationLink(ctx, created.code) };
    }, { auth: true });

    router.get('/api/admin/guests/export', (ctx) => {
        const db = load();
        const guests = sortGuests(filterGuests(db.guests, ctx.query), 'name');
        const csv = toCsv([
            { key: 'name', label: 'Name' },
            { key: 'code', label: 'Invitation code' },
            { key: 'phone', label: 'Phone' },
            { key: 'email', label: 'Email' },
            { key: 'category', label: 'Category' },
            { key: 'seats', label: 'Seats' },
            { key: 'rsvpStatus', label: 'RSVP status' },
            { key: 'rsvpSeats', label: 'Confirmed seats' },
            { key: 'invitedAt', label: 'Invited at' },
            { key: 'checkedInAt', label: 'Checked in at' },
            { key: 'note', label: 'Notes' },
        ], guests);

        ctx.res.writeHead(200, {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="sas-guests.csv"',
            'Cache-Control': 'no-store',
        });
        ctx.res.end(`\uFEFF${csv}`);
        return undefined;
    }, { auth: true });

    router.post('/api/admin/guests/import', (ctx) => {
        const rows = Array.isArray(ctx.body.rows) ? ctx.body.rows.slice(0, 500) : [];
        if (!rows.length) {
            throw new HttpError(422, 'No guest rows were provided.', 'empty_import');
        }

        return mutate((db) => {
            const added = [];
            const skipped = [];
            const errors = [];

            rows.forEach((row, index) => {
                try {
                    const payload = guestPayload(row);
                    const duplicate = db.guests.find((guest) => (
                        guest.name.toLowerCase() === payload.name.toLowerCase()
                        || (payload.phone && guest.phone === payload.phone)
                        || (payload.email && guest.email === payload.email)
                    ));

                    if (duplicate) {
                        skipped.push(`${payload.name} is already on the list`);
                        return;
                    }

                    const now = new Date().toISOString();
                    const guest = {
                        id: generateId('gst'),
                        code: uniqueCode(db.guests),
                        ...payload,
                        rsvpSeats: 0,
                        message: '',
                        invitedAt: ctx.body.markInvited === false ? null : now,
                        rsvpAt: null,
                        checkedInAt: null,
                        createdAt: now,
                        updatedAt: now,
                    };
                    db.guests.push(guest);
                    added.push(guest);
                } catch (err) {
                    errors.push(`Row ${index + 1}: ${err.message}`);
                }
            });

            if (added.length) {
                logActivity(db, 'guest_import', `${added.length} guest(s) imported from CSV`);
            }

            return {
                added: added.length,
                skipped: skipped.length,
                failed: errors.length,
                skippedDetails: skipped,
                errors,
                items: added,
            };
        });
    }, { auth: true });

    router.patch('/api/admin/guests/:id', (ctx) => {
        const updated = mutate((db) => {
            const guest = db.guests.find((item) => item.id === ctx.params.id);
            if (!guest) {
                throw new HttpError(404, 'Guest not found.', 'not_found');
            }

            const payload = guestPayload({ ...guest, ...ctx.body }, guest);
            if (payload.email && db.guests.some((item) => item.id !== guest.id && item.email.toLowerCase() === payload.email)) {
                throw new HttpError(409, 'Another guest already uses that email.', 'duplicate_guest');
            }

            Object.assign(guest, payload, { updatedAt: new Date().toISOString() });

            if (guest.rsvpStatus === 'attending') {
                guest.rsvpSeats = Math.min(payload.seats, Math.max(guest.rsvpSeats || payload.seats, 1));
                guest.rsvpAt = guest.rsvpAt || new Date().toISOString();
            } else if (guest.rsvpStatus === 'declined') {
                guest.rsvpSeats = 0;
                guest.rsvpAt = guest.rsvpAt || new Date().toISOString();
            } else {
                guest.rsvpSeats = 0;
            }

            if (ctx.body.markInvited === true && !guest.invitedAt) {
                guest.invitedAt = new Date().toISOString();
                logActivity(db, 'invitation_sent', `Invitation sent to ${guest.name}`, { guestId: guest.id });
            }
            if (ctx.body.markInvited === false) {
                guest.invitedAt = null;
            }

            return guest;
        });

        return { guest: updated, link: invitationLink(ctx, updated.code) };
    }, { auth: true });

    router.delete('/api/admin/guests/:id', (ctx) => {
        mutate((db) => {
            const index = db.guests.findIndex((item) => item.id === ctx.params.id);
            if (index === -1) {
                throw new HttpError(404, 'Guest not found.', 'not_found');
            }
            const [guest] = db.guests.splice(index, 1);
            db.rsvps = db.rsvps.filter((item) => item.guestId !== guest.id);
            logActivity(db, 'guest_removed', `${guest.name} was removed from the guest list`);
            return guest;
        });

        return { ok: true };
    }, { auth: true });

    router.get('/api/admin/guests/:id/qr', async (ctx) => {
        const db = load();
        const guest = db.guests.find((item) => item.id === ctx.params.id);
        if (!guest) {
            throw new HttpError(404, 'Guest not found.', 'not_found');
        }

        const link = invitationLink(ctx, guest.code);
        const format = str(ctx.query.format, 10, 'json').toLowerCase();
        const width = number(ctx.query.width, 160, 1400, 640);

        if (format === 'png') {
            ctx.res.writeHead(200, {
                'Content-Type': 'image/png',
                'Content-Disposition': `inline; filename="${guest.code}.png"`,
                'Cache-Control': 'private, max-age=300',
            });
            ctx.res.end(await qr.toPng(link, width));
            return undefined;
        }

        if (format === 'svg') {
            const svg = await qr.toSvg(link);
            ctx.res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'private, max-age=300' });
            ctx.res.end(svg);
            return undefined;
        }

        return {
            code: guest.code,
            name: guest.name,
            link,
            dataUrl: await qr.toDataUrl(link, width),
        };
    }, { auth: true });

    const checkIn = (ctx, guest) => {
        const now = new Date().toISOString();

        if (guest.checkedInAt) {
            return { guest, already: true, link: invitationLink(ctx, guest.code) };
        }

        const updated = mutate((database) => {
            const target = database.guests.find((item) => item.id === guest.id);
            target.checkedInAt = now;
            target.updatedAt = now;
            if (target.rsvpStatus === 'pending') {
                target.rsvpStatus = 'attending';
                target.rsvpSeats = target.rsvpSeats || target.seats;
                target.rsvpAt = now;
            }
            logActivity(database, 'checkin', `${target.name} checked in at the venue`, { guestId: target.id });
            return target;
        });

        return { guest: updated, already: false, link: invitationLink(ctx, updated.code) };
    };

    const checkOut = (guest) => mutate((db) => {
        const target = db.guests.find((item) => item.id === guest.id);
        target.checkedInAt = null;
        target.updatedAt = new Date().toISOString();
        logActivity(db, 'checkout', `${target.name}'s check-in was undone`, { guestId: target.id });
        return target;
    });

    router.post('/api/admin/guests/:id/checkin', (ctx) => {
        const guest = load().guests.find((item) => item.id === ctx.params.id);
        if (!guest) {
            throw new HttpError(404, 'Guest not found.', 'not_found');
        }
        return checkIn(ctx, guest);
    }, { auth: true });

    router.post('/api/admin/guests/:id/checkout', (ctx) => {
        const guest = load().guests.find((item) => item.id === ctx.params.id);
        if (!guest) {
            throw new HttpError(404, 'Guest not found.', 'not_found');
        }
        return { guest: checkOut(guest) };
    }, { auth: true });

    router.post('/api/admin/checkin', (ctx) => {
        const db = load();
        const guest = findGuestByCode(db.guests, ctx.body.code);
        if (!guest) {
            throw new HttpError(404, 'That QR code is not linked to any guest.', 'guest_not_found');
        }

        if (guest.rsvpStatus === 'declined') {
            return { ...checkIn(ctx, guest), warning: `${guest.name} previously declined the invitation.` };
        }

        return checkIn(ctx, guest);
    }, { auth: true });


};

module.exports = { registerGuestRoutes, summarise, filterGuests, sortGuests };

