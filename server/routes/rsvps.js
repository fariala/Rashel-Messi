'use strict';

const { HttpError } = require('../lib/http');
const { str, number, logActivity, invitationLink } = require('./helpers');

/**
 * Register admin RSVP management routes.
 *
 * @param {object} router
 * @param {object} deps
 */
const registerRsvpRoutes = (router, deps) => {
    const { load, mutate } = deps;

    router.get('/api/admin/rsvps', (ctx) => {
        const db = load();
        const status = str(ctx.query.status, 20, 'all').toLowerCase();
        const search = str(ctx.query.search, 80).toLowerCase();

        const items = db.rsvps
            .map((rsvp) => {
                const guest = db.guests.find((item) => item.id === rsvp.guestId) || null;
                return {
                    ...rsvp,
                    category: guest ? guest.category : 'Other',
                    checkedInAt: guest ? guest.checkedInAt : null,
                    guestName: guest ? guest.name : rsvp.name,
                };
            })
            .filter((rsvp) => {
                if (status !== 'all' && rsvp.attendance !== status) {
                    return false;
                }
                if (search && !`${rsvp.name} ${rsvp.code} ${rsvp.message}`.toLowerCase().includes(search)) {
                    return false;
                }
                return true;
            })
            .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

        const attending = db.rsvps.filter((rsvp) => rsvp.attendance === 'attending');
        const declined = db.rsvps.filter((rsvp) => rsvp.attendance === 'declined');

        return {
            items,
            summary: {
                total: db.rsvps.length,
                attending: attending.length,
                declined: declined.length,
                seats: attending.reduce((sum, rsvp) => sum + (rsvp.seats || 0), 0),
            },
        };
    }, { auth: true });

    router.patch('/api/admin/rsvps/:id', (ctx) => {
        const updated = mutate((db) => {
            const rsvp = db.rsvps.find((item) => item.id === ctx.params.id);
            if (!rsvp) {
                throw new HttpError(404, 'RSVP not found.', 'not_found');
            }

            const attendance = str(ctx.body.attendance, 20, rsvp.attendance).toLowerCase();
            if (!['attending', 'declined'].includes(attendance)) {
                throw new HttpError(422, 'Attendance must be attending or declined.', 'invalid_attendance');
            }

            rsvp.attendance = attendance;
            rsvp.seats = attendance === 'attending' ? number(ctx.body.seats, 0, 12, rsvp.seats || 1) : 0;
            rsvp.message = str(ctx.body.message, 500, rsvp.message || '');
            rsvp.updatedAt = new Date().toISOString();

            const guest = db.guests.find((item) => item.id === rsvp.guestId);
            if (guest) {
                guest.rsvpStatus = attendance;
                guest.rsvpSeats = rsvp.seats;
                guest.message = rsvp.message;
                guest.rsvpAt = rsvp.updatedAt;
                guest.updatedAt = rsvp.updatedAt;
            }

            logActivity(db, attendance === 'attending' ? 'rsvp_attending' : 'rsvp_declined',
                `${rsvp.name} RSVP was updated by the host`, { guestId: rsvp.guestId });

            return rsvp;
        });

        return { rsvp: updated };
    }, { auth: true });

    router.delete('/api/admin/rsvps/:id', (ctx) => {
        mutate((db) => {
            const index = db.rsvps.findIndex((item) => item.id === ctx.params.id);
            if (index === -1) {
                throw new HttpError(404, 'RSVP not found.', 'not_found');
            }
            const [rsvp] = db.rsvps.splice(index, 1);
            const guest = db.guests.find((item) => item.id === rsvp.guestId);
            if (guest) {
                guest.rsvpStatus = 'pending';
                guest.rsvpSeats = 0;
                guest.rsvpAt = null;
                guest.updatedAt = new Date().toISOString();
            }
            logActivity(db, 'rsvp_removed', `${rsvp.name}'s RSVP response was removed`, { guestId: rsvp.guestId });
            return rsvp;
        });

        return { ok: true };
    }, { auth: true });

    router.get('/api/admin/rsvps/export', (ctx) => {
        const db = load();
        const { toCsv } = require('./helpers');
        const rows = db.rsvps.map((rsvp) => ({
            ...rsvp,
            guest: db.guests.find((item) => item.id === rsvp.guestId),
        }));

        const csv = toCsv([
            { key: 'name', label: 'Name' },
            { key: 'code', label: 'Code' },
            { key: 'attendance', label: 'Attendance' },
            { key: 'seats', label: 'Seats' },
            { key: 'message', label: 'Message' },
            { key: 'createdAt', label: 'Responded at' },
        ], rows);

        const link = invitationLink(ctx);
        ctx.res.writeHead(200, {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="sas-rsvps.csv"',
            'Cache-Control': 'no-store',
            'X-Invitation-Link': link,
        });
        ctx.res.end(`\uFEFF${csv}`);
        return undefined;
    }, { auth: true });
};

module.exports = { registerRsvpRoutes };
