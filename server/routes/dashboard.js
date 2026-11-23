'use strict';

const { load } = require('../lib/store');
const { summarise } = require('./guests');
const { invitationLink } = require('./helpers');

const DAY_MS = 24 * 60 * 60 * 1000;
const dayKey = (date) => new Date(date).toISOString().slice(0, 10);

const buildSeries = (db) => {
    const series = [];
    const today = Date.now();

    for (let offset = 13; offset >= 0; offset -= 1) {
        const date = new Date(today - offset * DAY_MS);
        const key = dayKey(date);
        series.push({
            date: key,
            rsvps: db.rsvps.filter((rsvp) => rsvp.createdAt && dayKey(rsvp.createdAt) === key).length,
            checkins: db.guests.filter((guest) => guest.checkedInAt && dayKey(guest.checkedInAt) === key).length,
        });
    }

    return series;
};

const eventDate = (content) => {
    const events = Array.isArray(content.events) ? content.events : [];
    const dated = events
        .filter((event) => event.date)
        .map((event) => new Date(`${event.date}T${event.startTime || '09:00'}:00`))
        .filter((date) => !Number.isNaN(date.getTime()))
        .sort((a, b) => a - b);
    return dated.length ? dated[0].toISOString() : null;
};

const weekDelta = (current, previous) => {
    if (previous === 0) {
        return current > 0 ? 100 : 0;
    }
    return Math.round(((current - previous) / previous) * 100);
};

/**
 * Register dashboard/analytics routes.
 *
 * @param {object} router
 * @param {object} deps
 */
const registerDashboardRoutes = (router) => {
    router.get('/api/admin/dashboard', (ctx) => {
        const db = load();
        const summary = summarise(db.guests);
        const series = buildSeries(db);
        const date = eventDate(db.content);

        const recentRsvps = db.rsvps
            .slice()
            .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
            .slice(0, 6)
            .map((rsvp) => ({
                ...rsvp,
                category: (db.guests.find((guest) => guest.id === rsvp.guestId) || {}).category || 'Other',
            }));

        const recentCheckins = db.guests
            .filter((guest) => guest.checkedInAt)
            .sort((a, b) => String(b.checkedInAt).localeCompare(String(a.checkedInAt)))
            .slice(0, 6)
            .map((guest) => ({
                id: guest.id,
                name: guest.name,
                code: guest.code,
                seats: guest.rsvpSeats || guest.seats,
                checkedInAt: guest.checkedInAt,
            }));

        const rsvpsThisWeek = db.rsvps.filter((rsvp) => Date.now() - new Date(rsvp.createdAt).getTime() < 7 * DAY_MS).length;
        const rsvpsLastWeek = db.rsvps.filter((rsvp) => {
            const age = Date.now() - new Date(rsvp.createdAt).getTime();
            return age >= 7 * DAY_MS && age < 14 * DAY_MS;
        }).length;

        return {
            summary,
            series,
            recentRsvps,
            recentCheckins,
            activity: db.activity.slice(0, 10),
            invitation: {
                link: invitationLink(ctx),
                slug: db.settings.slug,
                published: db.settings.published,
                brandName: db.settings.brandName,
            },
            wedding: {
                headline: (db.content.hero && db.content.hero.headline) || '',
                dateLabel: (db.content.hero && db.content.hero.dateLabel) || '',
                location: (db.content.hero && db.content.hero.location) || '',
                coverImage: (db.content.meta && db.content.meta.coverImage) || '',
                eventDate: date,
            },
            trend: {
                rsvpsThisWeek,
                rsvpsLastWeek,
                delta: weekDelta(rsvpsThisWeek, rsvpsLastWeek),
            },
            updatedAt: db.settings.updatedAt,
        };
    }, { auth: true });

    router.get('/api/admin/activity', (ctx) => {
        const db = load();
        const limit = Math.min(Math.max(Number.parseInt(ctx.query.limit, 10) || 20, 1), 100);
        return { items: db.activity.slice(0, limit) };
    }, { auth: true });
};

module.exports = { registerDashboardRoutes, eventDate };
