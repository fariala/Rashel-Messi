import { localizeInvitation } from '../../../server/lib/invitation-language.js';
import { getLanguage, t } from '../i18n.js';
import { api } from '../api.js';
import {
    avatar, copyText, countLabel, esc, fmtDateTime, fmtNumber, fmtShortDate,
    statusBadge, timeAgo, toast, toastError,
} from '../ui.js';

const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) {
        return t('Good morning');
    }
    if (hour < 18) {
        return t('Good afternoon');
    }
    return t('Good evening');
};

const ACTIVITY_ICONS = {
    checkin: ['fa-qrcode', 'is-green'],
    rsvp_attending: ['fa-heart', 'is-green'],
    rsvp_declined: ['fa-heart-crack', 'is-gold'],
    guest_added: ['fa-user-plus', 'is-plum'],
    guest_import: ['fa-file-import', 'is-plum'],
    guest_removed: ['fa-user-minus', 'is-gold'],
    content_updated: ['fa-pen-nib', ''],
    publish: ['fa-bullhorn', 'is-plum'],
    invitation_sent: ['fa-paper-plane', 'is-plum'],
    checkout: ['fa-rotate-left', 'is-gold'],
};

const activityIcon = (type) => {
    const [icon, tone] = ACTIVITY_ICONS[type] || ['fa-circle-info', ''];
    return `<span class="sas-feed-icon ${tone}"><i class="fa-solid ${icon}"></i></span>`;
};

const ACTIVITY_MESSAGES = {
    checkin: ['{name} checked in at the venue'],
    rsvp_attending: ['{name} confirmed attendance', '{name} RSVP was updated by the host'],
    rsvp_declined: ['{name} declined the invitation', '{name} RSVP was updated by the host'],
    guest_added: ['{name} was added to the guest list'],
    guest_import: ['{count} guest(s) imported from CSV'],
    guest_removed: ['{name} was removed from the guest list'],
    invitation_sent: ['Invitation sent to {name}'],
    checkout: ["{name}'s check-in was undone"],
    rsvp_removed: ["{name}'s RSVP response was removed"],
};

const activityMessage = (item) => {
    // Existing activity records store the final English message.
    const message = item.message || '';
    for (const template of ACTIVITY_MESSAGES[item.type] || []) {
        const field = template.includes('{count}') ? 'count' : 'name';
        const [prefix, suffix] = template.split(`{${field}}`);
        if (message.startsWith(prefix) && message.endsWith(suffix)) {
            const value = message.slice(prefix.length, message.length - suffix.length);
            return t(template, { [field]: value });
        }
    }
    return t(message);
};

const percent = (value, total) => (total ? Math.round((value / total) * 100) : 0);

const sparkline = (series) => {
    const width = 560;
    const height = 170;
    const padding = { top: 18, right: 12, bottom: 26, left: 12 };
    const max = Math.max(...series.map((point) => point.rsvps), 1);
    const stepX = (width - padding.left - padding.right) / Math.max(series.length - 1, 1);

    const points = series.map((point, index) => {
        const x = padding.left + index * stepX;
        const y = height - padding.bottom - (point.rsvps / max) * (height - padding.top - padding.bottom);
        return { x, y, value: point.rsvps, label: point.date };
    });

    const line = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
    const area = `${padding.left},${height - padding.bottom} ${line} ${width - padding.right},${height - padding.bottom}`;
    const gridLines = [0.25, 0.5, 0.75].map((ratio) => (
        `<line x1="${padding.left}" y1="${(padding.top + ratio * (height - padding.top - padding.bottom)).toFixed(1)}" x2="${width - padding.right}" y2="${(padding.top + ratio * (height - padding.top - padding.bottom)).toFixed(1)}" stroke="rgba(44,37,48,0.08)" stroke-width="1" />`
    )).join('');

    const dots = points.map((point) => `<circle class="sas-chart-dot" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="2.6"><title>${esc(fmtShortDate(point.label))}: ${esc(countLabel(point.value, '{count} response', '{count} responses'))}</title></circle>`).join('');

    const labels = points
        .filter((point, index) => index % 3 === 0)
        .map((point) => `<text class="sas-chart-axis" x="${point.x.toFixed(1)}" y="${height - 8}" text-anchor="middle">${esc(fmtShortDate(point.label))}</text>`)
        .join('');

    return `
        <svg class="sas-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${esc(t('RSVPs received over the last 14 days'))}">
            <defs>
                <linearGradient id="sasArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#b76e79" stop-opacity="0.32" />
                    <stop offset="100%" stop-color="#b76e79" stop-opacity="0" />
                </linearGradient>
            </defs>
            ${gridLines}
            <polygon class="sas-chart-area" points="${area}" />
            <polyline class="sas-chart-line" points="${line}" />
            ${dots}
            ${labels}
        </svg>`;
};

const donut = (categories) => {
    const palette = ['#b76e79', '#c2a26b', '#7f9179', '#6b4a63', '#c9b7a3'];
    const entries = Object.entries(categories).filter(([, count]) => count > 0);
    const total = entries.reduce((sum, [, count]) => sum + count, 0);
    const colors = {};

    if (!total) {
        return {
            style: 'conic-gradient(#eee 0turn 1turn)',
            legend: `<p class="sas-small sas-muted">${esc(t('No guests yet.'))}</p>`,
        };
    }

    let cursor = 0;
    const stops = entries.map(([name, count], index) => {
        const start = cursor;
        const end = cursor + (count / total);
        cursor = end;
        colors[name] = palette[index % palette.length];
        return `${palette[index % palette.length]} ${start.toFixed(4)}turn ${end.toFixed(4)}turn`;
    }).join(', ');

    const legend = entries.map(([name, count]) => (
        `<span class="sas-legend-item"><span class="sas-legend-dot" style="--dot:${colors[name]}"></span>${esc(t(name))} <strong>${fmtNumber(count)}</strong></span>`
    )).join('');

    return { style: `conic-gradient(${stops})`, legend };
};

const stat = ({ tone, icon, label, value, meta }) => `
    <article class="sas-stat ${tone || ''}">
        <span class="sas-stat-icon"><i class="fa-solid ${icon}"></i></span>
        <p class="sas-stat-label">${esc(label)}</p>
        <p class="sas-stat-value">${esc(fmtNumber(value))}</p>
        <p class="sas-stat-meta">${meta}</p>
    </article>`;

const render = async (ctx) => {
    const data = await api.get('/api/admin/dashboard');
    const summary = data.summary;
    const chart = donut(summary.categories);
    const firstName = ctx.user && ctx.user.name ? ctx.user.name.split(' ')[0] : t('there');
    const cover = data.wedding.coverImage || '/assets/images/sas/cover.svg';
    const wedding = localizeInvitation(ctx.content || {}, getLanguage()).hero || data.wedding;

    const attendingPct = percent(summary.attending, summary.total);
    const pendingPct = percent(summary.pending, summary.total);
    const declinedPct = percent(summary.declined, summary.total);

    const recentRsvpRows = data.recentRsvps.length
        ? data.recentRsvps.map((rsvp) => `
            <tr>
                <td>
                    <div class="sas-person">
                        ${avatar(rsvp.name)}
                        <div>
                            <div class="sas-person-name">${esc(rsvp.name)}</div>
                            <div class="sas-person-meta">${esc(t(rsvp.category || 'Other'))} &middot; ${esc(fmtDateTime(rsvp.createdAt))}</div>
                        </div>
                    </div>
                </td>
                <td>${statusBadge(rsvp.attendance)}</td>
                <td class="text-end">${rsvp.seats ? esc(countLabel(rsvp.seats, '{count} seat', '{count} seats')) : '&mdash;'}</td>
            </tr>`).join('')
        : `<tr><td colspan="3"><div class="sas-empty"><i class="fa-solid fa-envelope-open"></i><h4>${esc(t('No RSVPs yet'))}</h4><p>${esc(t('Responses will appear here as guests reply.'))}</p></div></td></tr>`;

    const feed = data.activity.length
        ? data.activity.map((item) => `
            <li class="sas-feed-item">
                ${activityIcon(item.type)}
                <div>
                    <p class="sas-feed-text">${esc(activityMessage(item))}</p>
                    <span class="sas-feed-time">${esc(timeAgo(item.at))}</span>
                </div>
            </li>`).join('')
        : `<li class="sas-feed-item"><div><p class="sas-feed-text">${esc(t('Activity will show up here.'))}</p></div></li>`;

    return `
        <section class="sas-hero" style="--sas-hero-image:url('${esc(cover)}')">
            <div class="sas-hero-content">
                <p class="sas-eyebrow">${esc(greeting())}, ${esc(firstName)}</p>
                <h2>${esc(wedding.headline || t('Your wedding invitation'))}</h2>
                <p>${esc(wedding.dateLabel || '')}${wedding.location ? ` &middot; ${esc(wedding.location)}` : ''}</p>
                <div class="sas-countdown" id="overview-countdown" data-event="${esc(data.wedding.eventDate || '')}">
                    <div><strong data-unit="days">--</strong><span>${esc(t('Days'))}</span></div>
                    <div><strong data-unit="hours">--</strong><span>${esc(t('Hours'))}</span></div>
                    <div><strong data-unit="minutes">--</strong><span>${esc(t('Minutes'))}</span></div>
                    <div><strong data-unit="seconds">--</strong><span>${esc(t('Seconds'))}</span></div>
                </div>
            </div>
            <div class="sas-hero-actions">
                <button type="button" class="sas-btn sas-btn-primary" data-action="copy-link">
                    <i class="fa-solid fa-link"></i> ${esc(t('Copy invitation link'))}
                </button>
                <button type="button" class="sas-btn sas-btn-outline" data-go="cms">
                    <i class="fa-solid fa-pen-nib"></i> ${esc(t('Edit invitation'))}
                </button>
            </div>
        </section>

        <section class="sas-stats">
            ${stat({
                icon: 'fa-user-group',
                label: t('Total guests'),
                value: summary.total,
                meta: countLabel(summary.seats, '{count} seat invited', '{count} seats invited', true),
            })}
            ${stat({
                tone: 'sas-stat-green',
                icon: 'fa-heart',
                label: t('Attending'),
                value: summary.attending,
                meta: countLabel(summary.attendingSeats, '{count} seat confirmed', '{count} seats confirmed', true),
            })}
            ${stat({
                tone: 'sas-stat-gold',
                icon: 'fa-hourglass-half',
                label: t('Awaiting reply'),
                value: summary.pending,
                meta: esc(countLabel(summary.invited, '{count} invitation sent', '{count} invitations sent')),
            })}
            ${stat({
                tone: 'sas-stat-plum',
                icon: 'fa-qrcode',
                label: t('Checked in'),
                value: summary.checkedIn,
                meta: countLabel(summary.checkedInSeats, '{count} seat arrived', '{count} seats arrived', true),
            })}
        </section>

        <div class="sas-grid-2">
            <section class="sas-card">
                <div class="sas-card-head">
                    <div>
                        <h3 class="sas-card-title">${esc(t('RSVP overview'))}</h3>
                        <p class="sas-card-subtitle">${esc(t('{replied} of {total} guests have replied', {
                            replied: fmtNumber(summary.attending + summary.declined), total: fmtNumber(summary.total),
                        }))}</p>
                    </div>
                    <span class="sas-badge sas-badge-neutral sas-badge-no-dot">${esc(t('{change}% vs last week', {
                        change: `${data.trend.delta >= 0 ? '+' : ''}${fmtNumber(data.trend.delta)}`,
                    }))}</span>
                </div>

                <div class="sas-split-bar" role="img" aria-label="${esc(t('Attending {attending} percent, awaiting {pending} percent, declined {declined} percent', {
                    attending: attendingPct, pending: pendingPct, declined: declinedPct,
                }))}">
                    <span class="sas-split-attending" style="width:${attendingPct}%"></span>
                    <span class="sas-split-pending" style="width:${pendingPct}%"></span>
                    <span class="sas-split-declined" style="width:${declinedPct}%"></span>
                </div>
                <div class="sas-legend">
                    <span class="sas-legend-item"><span class="sas-legend-dot" style="--dot:#4f8a64"></span>${esc(t('Attending'))} <strong>${fmtNumber(summary.attending)}</strong></span>
                    <span class="sas-legend-item"><span class="sas-legend-dot" style="--dot:#cbb078"></span>${esc(t('Awaiting'))} <strong>${fmtNumber(summary.pending)}</strong></span>
                    <span class="sas-legend-item"><span class="sas-legend-dot" style="--dot:#c97d84"></span>${esc(t('Declined'))} <strong>${fmtNumber(summary.declined)}</strong></span>
                </div>

                <div class="sas-divider"></div>

                <h4 class="sas-card-title" style="font-size:0.95rem">${esc(t('Responses · last 14 days'))}</h4>
                ${sparkline(data.series)}
            </section>

            <section class="sas-card">
                <div class="sas-card-head">
                    <div>
                        <h3 class="sas-card-title">${esc(t('Guest composition'))}</h3>
                        <p class="sas-card-subtitle">${esc(t('Who is on your list'))}</p>
                    </div>
                </div>
                <div class="sas-donut-wrap">
                    <div class="sas-donut" style="background:${chart.style}">
                        <div class="sas-donut-center">
                            <strong>${fmtNumber(summary.total)}</strong>
                            <span>${esc(t('Guests'))}</span>
                        </div>
                    </div>
                    <div class="sas-legend" style="flex-direction:column;gap:0.55rem;margin:0">
                        ${chart.legend}
                    </div>
                </div>

                <div class="sas-divider"></div>

                <h4 class="sas-card-title" style="font-size:0.95rem;margin-bottom:0.75rem">${esc(t('Invitation status'))}</h4>
                <div class="sas-seat-row">
                    <span>${esc(t('Website'))}</span>
                    <span class="sas-badge ${data.invitation.published ? 'sas-badge-attending' : 'sas-badge-pending'}">${data.invitation.published ? t('Live') : t('Draft')}</span>
                </div>
                <div class="sas-seat-row">
                    <span>${esc(t('Slug'))}</span>
                    <code class="sas-code">/${esc(data.invitation.slug)}</code>
                </div>
                <div class="sas-seat-row">
                    <span>${esc(t('Last updated'))}</span>
                    <span class="sas-small sas-muted">${esc(timeAgo(data.updatedAt))}</span>
                </div>
                <div class="sas-seat-row">
                    <span>${esc(t('Check-in progress'))}</span>
                    <span class="sas-small">${esc(t('{percent}% of attending', { percent: percent(summary.checkedIn, summary.attending) }))}</span>
                </div>
                <div class="sas-progress" style="margin-top:0.6rem"><span style="width:${percent(summary.checkedIn, summary.attending)}%"></span></div>
            </section>
        </div>

        <div class="sas-grid-2">
            <section class="sas-card">
                <div class="sas-card-head">
                    <div>
                        <h3 class="sas-card-title">${esc(t('Latest RSVPs'))}</h3>
                        <p class="sas-card-subtitle">${esc(t('The most recent guest responses'))}</p>
                    </div>
                    <button type="button" class="sas-btn sas-btn-ghost sas-btn-sm" data-go="rsvp">${esc(t('View all'))} <i class="fa-solid fa-arrow-right"></i></button>
                </div>
                <div class="sas-table-wrap">
                    <table class="sas-table">
                        <thead>
                            <tr><th>${esc(t('Guest'))}</th><th>${esc(t('Response'))}</th><th class="text-end">${esc(t('Seats'))}</th></tr>
                        </thead>
                        <tbody>${recentRsvpRows}</tbody>
                    </table>
                </div>
            </section>

            <section class="sas-card">
                <div class="sas-card-head">
                    <div>
                        <h3 class="sas-card-title">${esc(t('Quick actions'))}</h3>
                        <p class="sas-card-subtitle">${esc(t('Everything you need today'))}</p>
                    </div>
                </div>
                <div class="sas-quick">
                    <button type="button" data-go="guests"><i class="fa-solid fa-user-plus"></i> ${esc(t('Manage guests'))}</button>
                    <button type="button" data-go="checkin"><i class="fa-solid fa-qrcode"></i> ${esc(t('Scan QR pass'))}</button>
                    <button type="button" data-go="cms"><i class="fa-solid fa-pen-nib"></i> ${esc(t('Edit content'))}</button>
                    <button type="button" data-go="settings"><i class="fa-solid fa-gear"></i> ${esc(t('Studio settings'))}</button>
                </div>

                <div class="sas-divider"></div>

                <h4 class="sas-card-title" style="font-size:0.95rem;margin-bottom:0.9rem">${esc(t('Recent activity'))}</h4>
                <ul class="sas-feed">${feed}</ul>
            </section>
        </div>
    `;
};

const startCountdown = (root) => {
    const countdown = root.querySelector('#overview-countdown');
    if (!countdown) {
        return;
    }

    const target = countdown.dataset.event ? new Date(countdown.dataset.event) : null;
    if (!target || Number.isNaN(target.getTime())) {
        countdown.style.display = 'none';
        return;
    }

    const units = {
        days: countdown.querySelector('[data-unit="days"]'),
        hours: countdown.querySelector('[data-unit="hours"]'),
        minutes: countdown.querySelector('[data-unit="minutes"]'),
        seconds: countdown.querySelector('[data-unit="seconds"]'),
    };

    let timer = 0;

    const tick = () => {
        if (!document.body.contains(countdown)) {
            window.clearInterval(timer);
            return;
        }
        const diff = target.getTime() - Date.now();
        if (diff <= 0) {
            [units.days, units.hours, units.minutes, units.seconds].forEach((unit) => {
                if (unit) {
                    unit.textContent = '00';
                }
            });
            window.clearInterval(timer);
            return;
        }
        const days = Math.floor(diff / 86400000);
        const hours = Math.floor((diff % 86400000) / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        if (units.days) {
            units.days.textContent = String(days).padStart(2, '0');
        }
        if (units.hours) {
            units.hours.textContent = String(hours).padStart(2, '0');
        }
        if (units.minutes) {
            units.minutes.textContent = String(minutes).padStart(2, '0');
        }
        if (units.seconds) {
            units.seconds.textContent = String(seconds).padStart(2, '0');
        }
    };

    timer = window.setInterval(tick, 1000);
    tick();
};

const mount = (ctx, root) => {
    startCountdown(root);

    root.addEventListener('click', async (event) => {
        const go = event.target.closest('[data-go]');
        if (go) {
            ctx.go(go.dataset.go);
            return;
        }

        const action = event.target.closest('[data-action]');
        if (!action) {
            return;
        }

        if (action.dataset.action === 'copy-link') {
            try {
                const link = `${window.location.origin}/invite.html`;
                const ok = await copyText(link);
                toast(ok ? t('Invitation link copied to your clipboard.') : link, ok ? 'success' : 'info');
            } catch (error) {
                toastError(error);
            }
        }
    });
};

export default {
    title: 'Dashboard',
    subtitle: 'A calm overview of your wedding invitation',
    render,
    mount,
};


