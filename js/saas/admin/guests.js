import { localizeInvitation } from '../../../server/lib/invitation-language.js';
import { getLanguage, t } from '../i18n.js';
import { api } from '../api.js';
import {
    avatar, checkinBadge, confirmAction, copyText, countLabel, debounce, emptyState, esc,
    fmtDate, fmtNumber, modal, parseCsv, setBusy, statusBadge, toast, toastError,
} from '../ui.js';

const CATEGORIES = ['Family', 'Friend', 'Colleague', 'VIP', 'Other'];

const importError = (message) => {
    const row = /^Row (\d+): (.+)$/.exec(message);
    return row ? t('Row {number}: {message}', { number: fmtNumber(row[1]), message: t(row[2]) }) : message;
};

const state = {
    search: '',
    status: 'all',
    category: 'all',
    checkin: 'all',
    page: 1,
    limit: 10,
    sort: 'recent',
    data: null,
};

let openImport = null;
let exportHref = () => '/api/admin/guests/export';


const queryParams = () => ({
    search: state.search,
    status: state.status,
    category: state.category,
    checkin: state.checkin,
    page: state.page,
    limit: state.limit,
    sort: state.sort,
});

const seatLabel = (guest) => {
    const confirmed = guest.rsvpStatus === 'attending' ? (guest.rsvpSeats || guest.seats) : 0;
    return confirmed ? `${confirmed}/${guest.seats}` : `${guest.seats}`;
};

const rowTemplate = (guest) => `
    <tr>
        <td>
            <div class="sas-person">
                ${avatar(guest.name)}
                <div>
                    <div class="sas-person-name">${esc(guest.name)}</div>
                    <div class="sas-person-meta">${esc(guest.phone || guest.email || t('No contact yet'))}</div>
                </div>
            </div>
        </td>
        <td><span class="sas-code">${esc(guest.code)}</span></td>
        <td>${esc(t(guest.category || 'Other'))}</td>
        <td>${esc(seatLabel(guest))}</td>
        <td>${statusBadge(guest.rsvpStatus)}</td>
        <td>
            <div class="d-flex align-items-center gap-2">
                ${checkinBadge(guest.checkedInAt)}
                <span class="sas-person-meta">${guest.checkedInAt ? esc(fmtDate(guest.checkedInAt)) : ''}</span>
            </div>
        </td>
        <td>
            <div class="sas-actions">
                <button type="button" class="sas-icon-btn" data-act="qr" data-id="${esc(guest.id)}" title="${esc(t('QR pass'))}" aria-label="${esc(t('Show QR pass'))}">
                    <i class="fa-solid fa-qrcode"></i>
                </button>
                <button type="button" class="sas-icon-btn" data-act="edit" data-id="${esc(guest.id)}" title="${esc(t('Edit guest'))}" aria-label="${esc(t('Edit guest'))}">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button type="button" class="sas-icon-btn" data-act="${guest.checkedInAt ? 'checkout' : 'checkin'}" data-id="${esc(guest.id)}" title="${guest.checkedInAt ? t('Undo check-in') : t('Check in')}" aria-label="${guest.checkedInAt ? t('Undo check-in') : t('Check in')}">
                    <i class="fa-solid ${guest.checkedInAt ? 'fa-rotate-left' : 'fa-right-to-bracket'}"></i>
                </button>
                <button type="button" class="sas-icon-btn is-danger" data-act="delete" data-id="${esc(guest.id)}" data-name="${esc(guest.name)}" title="${esc(t('Remove guest'))}" aria-label="${esc(t('Remove guest'))}">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        </td>
    </tr>`;

const field = (label, id, value, options = {}) => `
    <div class="sas-field ${options.full ? 'is-full' : ''}">
        <label class="sas-label" for="${id}">${esc(label)}</label>
        <input class="sas-input" id="${id}" type="${options.type || 'text'}" value="${esc(value)}"
            placeholder="${esc(options.placeholder || '')}" ${options.min !== undefined ? `min="${options.min}"` : ''} ${options.max !== undefined ? `max="${options.max}"` : ''}
            ${options.required ? 'required' : ''} ${options.disabled ? 'disabled' : ''}>
    </div>`;

const resultsTemplate = (data) => {
    if (!data.items.length) {
        return emptyState('fa-user-group', t('No guests match those filters'), t('Try a different search, or add your first guest to get started.'));
    }

    const rows = data.items.map(rowTemplate).join('');
    const from = data.total === 0 ? 0 : (data.page - 1) * data.limit + 1;
    const to = Math.min(data.page * data.limit, data.total);

    const pageButtons = [];
    const start = Math.max(1, data.page - 2);
    const end = Math.min(data.pages, start + 4);
    for (let page = start; page <= end; page += 1) {
        pageButtons.push(`<button type="button" class="sas-page-btn ${page === data.page ? 'is-active' : ''}" data-page="${page}">${page}</button>`);
    }

    return `
        <div class="sas-table-wrap">
            <table class="sas-table">
                <thead>
                    <tr>
                        <th>${esc(t('Guest'))}</th>
                        <th>${esc(t('Invitation code'))}</th>
                        <th>${esc(t('Category'))}</th>
                        <th>${esc(t('Seats'))}</th>
                        <th>RSVP</th>
                        <th>${esc(t('Check-in'))}</th>
                        <th class="text-end">${esc(t('Actions'))}</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
        <div class="sas-pagination">
            <span>${esc(t('Showing {from}–{to} of {total} guests', {
                from: fmtNumber(from), to: fmtNumber(to), total: fmtNumber(data.total),
            }))}</span>
            <div class="sas-pagination-pages">
                <button type="button" class="sas-page-btn" data-page="${data.page - 1}" ${data.page <= 1 ? 'disabled' : ''} aria-label="${esc(t('Previous page'))}">
                    <i class="fa-solid fa-chevron-left"></i>
                </button>
                ${pageButtons.join('')}
                <button type="button" class="sas-page-btn" data-page="${data.page + 1}" ${data.page >= data.pages ? 'disabled' : ''} aria-label="${esc(t('Next page'))}">
                    <i class="fa-solid fa-chevron-right"></i>
                </button>
            </div>
        </div>`;
};

const chipsTemplate = (summary) => `
    <span class="sas-count-pill">${countLabel(summary.total, '{count} guest', '{count} guests', true)}</span>
    <span class="sas-count-pill">${countLabel(summary.seats, '{count} seat', '{count} seats', true)}</span>
    <span class="sas-count-pill" style="background:#e5f2e8;color:#3f7052">${countLabel(summary.attending, '{count} attending', '{count} attending guests', true)}</span>
    <span class="sas-count-pill" style="background:#f8efda;color:#8a6d33">${countLabel(summary.pending, '{count} awaiting', '{count} awaiting', true)}</span>
    <span class="sas-count-pill" style="background:#fbe8e9;color:#a44a52">${countLabel(summary.declined, '{count} declined', '{count} declined invitations', true)}</span>
    <span class="sas-count-pill" style="background:#eef1ee;color:#4d6155">${countLabel(summary.checkedIn, '{count} checked in', '{count} check-ins', true)}</span>`;

const filterBar = () => `
    <div class="sas-card" style="margin-bottom:1rem">
        <div class="sas-toolbar">
            <div class="sas-search">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input class="sas-input" id="guest-search" type="search" placeholder="${esc(t('Search name, code, phone or email'))}" value="${esc(state.search)}" aria-label="${esc(t('Search guests'))}">
            </div>
            <select class="sas-select" id="guest-status" aria-label="${esc(t('Filter by RSVP status'))}">
                <option value="all" ${state.status === 'all' ? 'selected' : ''}>${esc(t('All responses'))}</option>
                <option value="attending" ${state.status === 'attending' ? 'selected' : ''}>${esc(t('Attending'))}</option>
                <option value="pending" ${state.status === 'pending' ? 'selected' : ''}>${esc(t('Awaiting reply'))}</option>
                <option value="declined" ${state.status === 'declined' ? 'selected' : ''}>${esc(t('Declined'))}</option>
            </select>
            <select class="sas-select" id="guest-category" aria-label="${esc(t('Filter by category'))}">
                <option value="all" ${state.category === 'all' ? 'selected' : ''}>${esc(t('All categories'))}</option>
                ${CATEGORIES.map((category) => `<option value="${esc(category)}" ${state.category === category ? 'selected' : ''}>${esc(t(category))}</option>`).join('')}
            </select>
            <select class="sas-select" id="guest-checkin" aria-label="${esc(t('Filter by check-in'))}">
                <option value="all" ${state.checkin === 'all' ? 'selected' : ''}>${esc(t('Any check-in'))}</option>
                <option value="yes" ${state.checkin === 'yes' ? 'selected' : ''}>${esc(t('Checked in'))}</option>
                <option value="no" ${state.checkin === 'no' ? 'selected' : ''}>${esc(t('Not arrived'))}</option>
            </select>
            <select class="sas-select" id="guest-sort" aria-label="${esc(t('Sort guests'))}">
                <option value="recent" ${state.sort === 'recent' ? 'selected' : ''}>${esc(t('Newest first'))}</option>
                <option value="name" ${state.sort === 'name' ? 'selected' : ''}>${esc(t('Name A-Z'))}</option>
                <option value="rsvp" ${state.sort === 'rsvp' ? 'selected' : ''}>${esc(t('Latest RSVP'))}</option>
                <option value="checkin" ${state.sort === 'checkin' ? 'selected' : ''}>${esc(t('Latest check-in'))}</option>
            </select>
        </div>
        <div class="d-flex flex-wrap align-items-center gap-2" id="guest-chips"></div>
    </div>`;

const load = async (ctx) => {
    const container = document.getElementById('guest-results');
    if (!container) {
        return;
    }

    container.innerHTML = `
        <div class="sas-card">
            <div class="sas-skeleton" style="height:0.9rem;width:100%;margin-bottom:0.7rem"></div>
            <div class="sas-skeleton" style="height:0.9rem;width:92%;margin-bottom:0.7rem"></div>
            <div class="sas-skeleton" style="height:0.9rem;width:80%"></div>
        </div>`;

    try {
        const data = await api.get('/api/admin/guests', queryParams());
        state.data = data;
        container.innerHTML = `<div class="sas-card">${resultsTemplate(data)}</div>`;

        const chips = document.getElementById('guest-chips');
        if (chips) {
            chips.innerHTML = chipsTemplate(data.summary);
        }

        const exportLink = document.getElementById('guest-export');
        if (exportLink) {
            exportLink.href = exportHref();
        }
    } catch (error) {
        container.innerHTML = `<div class="sas-card">${emptyState('fa-cloud-bolt', t('Could not load guests'), t(error.message))}</div>`;
        toastError(error);
    }

    if (ctx) {
        ctx.refreshChrome();
    }
};


const formField = field;

const passCardHtml = (ctx, guest, dataUrl) => {
    const content = localizeInvitation(ctx.content || {}, getLanguage());
    const hero = content.hero || {};
    const meta = content.meta || {};
    return `
        <div class="pass">
            <p class="brand">${esc((ctx.settings && ctx.settings.brandName) || 'SAS Wedding Studio')}</p>
            <p class="couple">${esc(hero.headline || t('Wedding invitation'))}</p>
            <p class="label">${esc(t('Guest invitation pass'))}</p>
            <h1>${esc(guest.name)}</h1>
            <img src="${esc(dataUrl)}" alt="${esc(t('QR invitation pass'))}">
            <p class="code">${esc(guest.code)}</p>
            <p class="meta">${esc(hero.dateLabel || '')}${hero.location ? ` &middot; ${esc(hero.location)}` : ''}</p>
            <p class="note">${meta.hashtag ? `${esc(meta.hashtag)} &middot; ` : ''}${esc(t('Please present this pass at the entrance.'))}</p>
        </div>`;
};

const openPrintWindow = (title, passes) => {
    const win = window.open('', '_blank', 'width=980,height=760');
    if (!win) {
        toast(t('Please allow pop-ups to print invitation passes.'), 'warning');
        return;
    }

    win.document.write(`<!doctype html>
        <html lang="${getLanguage()}">
        <head>
            <meta charset="utf-8">
            <title>${esc(title)}</title>
            <style>
                @page { size: A4 portrait; margin: 12mm; }
                * { box-sizing: border-box; }
                body { margin: 0; padding: 16px; font-family: 'Josefin Sans', 'Segoe UI', sans-serif; color: #2c2530; background: #fff; }
                .sheet { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
                .pass { position: relative; padding: 22px 20px; text-align: center; border: 1px solid #e2d8cf; border-radius: 14px; break-inside: avoid; }
                .brand { margin: 0; font-size: 9px; letter-spacing: 0.32em; text-transform: uppercase; color: #c2a26b; }
                .couple { margin: 4px 0 12px; font-family: Georgia, serif; font-size: 22px; }
                .label { margin: 0; font-size: 8px; letter-spacing: 0.26em; text-transform: uppercase; color: #8b7f89; }
                h1 { margin: 6px 0 12px; font-family: Georgia, serif; font-size: 26px; font-weight: 500; }
                img { width: 150px; height: 150px; padding: 6px; border: 1px solid #eee5db; border-radius: 10px; }
                .code { margin: 10px 0 4px; font-family: 'Courier New', monospace; font-size: 11px; letter-spacing: 0.16em; font-weight: 700; }
                .meta { margin: 0; font-size: 9px; color: #8b7f89; }
                .note { margin: 8px 0 0; font-size: 8px; letter-spacing: 0.06em; color: #b0a6ad; }
                @media print { body { padding: 0; } }
            </style>
        </head>
        <body><div class="sheet">${passes.join('')}</div></body>
        </html>`);
    win.document.close();
    win.focus();
    window.setTimeout(() => win.print(), 500);
};


const openGuestForm = (ctx, guest) => {
    const isEdit = Boolean(guest);
    const value = guest || { name: '', phone: '', email: '', category: 'Friend', seats: 2, rsvpStatus: 'pending', note: '', invitedAt: null };

    const body = `
        <form id="guest-form" class="sas-form-grid" novalidate>
            ${formField(t('Full name'), 'gf-name', value.name, { placeholder: t('e.g. Alya Putri'), required: true })}
            ${formField(t('Phone number'), 'gf-phone', value.phone, { placeholder: '+62 812 0000 0000' })}
            ${formField(t('Email address'), 'gf-email', value.email, { type: 'email', placeholder: 'guest@example.com' })}
            <div class="sas-field">
                <label class="sas-label" for="gf-category">${esc(t('Category'))}</label>
                <select class="sas-select" id="gf-category">
                    ${CATEGORIES.map((category) => `<option value="${esc(category)}" ${value.category === category ? 'selected' : ''}>${esc(t(category))}</option>`).join('')}
                </select>
            </div>
            ${formField(t('Seats reserved'), 'gf-seats', value.seats, { type: 'number', min: 1, max: 12 })}
            <div class="sas-field">
                <label class="sas-label" for="gf-status">${esc(t('RSVP status'))}</label>
                <select class="sas-select" id="gf-status">
                    <option value="pending" ${value.rsvpStatus === 'pending' ? 'selected' : ''}>${esc(t('Awaiting reply'))}</option>
                    <option value="attending" ${value.rsvpStatus === 'attending' ? 'selected' : ''}>${esc(t('Attending'))}</option>
                    <option value="declined" ${value.rsvpStatus === 'declined' ? 'selected' : ''}>${esc(t('Declined'))}</option>
                </select>
            </div>
            <div class="sas-field is-full">
                <label class="sas-label" for="gf-note">${esc(t('Private note'))}</label>
                <textarea class="sas-textarea" id="gf-note" rows="2" placeholder="${esc(t('Dietary needs, seating notes, how you know them...'))}">${esc(value.note)}</textarea>
            </div>
            <div class="sas-field is-full">
                <label class="form-check d-flex align-items-center gap-2" style="font-size:0.82rem">
                    <input class="form-check-input" type="checkbox" id="gf-invited" ${value.invitedAt ? 'checked' : ''}>
                    <span>${esc(t('Mark as invitation sent'))}</span>
                </label>
            </div>
        </form>`;

    const footer = `
        <button type="button" class="sas-btn sas-btn-outline" data-bs-dismiss="modal">${esc(t('Cancel'))}</button>
        <button type="button" class="sas-btn sas-btn-primary" id="gf-save">
            <i class="fa-solid ${isEdit ? 'fa-floppy-disk' : 'fa-user-plus'}"></i> ${isEdit ? t('Save changes') : t('Add guest')}
        </button>`;

    modal({
        title: isEdit ? t('Edit guest') : t('Add a guest'),
        subtitle: isEdit ? t('Update contact details, seats and RSVP status.') : t('We will generate a unique QR invitation pass for this guest.'),
        body,
        footer,
        size: 'lg',
        onMount: (element, close) => {
            const save = element.querySelector('#gf-save');

            const submit = async () => {
                const name = element.querySelector('#gf-name').value.trim();
                if (name.length < 2) {
                    toast(t('Please enter the guest name.'), 'warning');
                    element.querySelector('#gf-name').focus();
                    return;
                }

                const payload = {
                    name,
                    phone: element.querySelector('#gf-phone').value.trim(),
                    email: element.querySelector('#gf-email').value.trim(),
                    category: element.querySelector('#gf-category').value,
                    seats: Number(element.querySelector('#gf-seats').value) || 1,
                    rsvpStatus: element.querySelector('#gf-status').value,
                    note: element.querySelector('#gf-note').value.trim(),
                    markInvited: element.querySelector('#gf-invited').checked,
                };

                setBusy(save, true);
                try {
                    if (isEdit) {
                        await api.patch(`/api/admin/guests/${guest.id}`, payload);
                        toast(t('Guest updated.'), 'success');
                    } else {
                        const created = await api.post('/api/admin/guests', payload);
                        toast(t('Guest added. Invitation code {code}.', { code: created.guest.code }), 'success');
                    }
                    close();
                    await load(ctx);
                    ctx.refreshChrome();
                } catch (error) {
                    toastError(error);
                } finally {
                    setBusy(save, false);
                }
            };

            save.addEventListener('click', submit);
            element.querySelector('#guest-form').addEventListener('submit', (event) => {
                event.preventDefault();
                submit();
            });
        },
    });
};

const printPasses = async (ctx, guests) => {
    if (!guests.length) {
        toast(t('There are no guests on this page to print.'), 'warning');
        return;
    }

    toast(t('Preparing QR passes...'), 'info');
    try {
        const passes = await Promise.all(guests.map(async (guest) => {
            const qr = await api.get(`/api/admin/guests/${guest.id}/qr`, { format: 'json', width: 420 });
            return passCardHtml(ctx, guest, qr.dataUrl);
        }));
        openPrintWindow(t('Invitation passes'), passes);
    } catch (error) {
        toastError(error);
    }
};

const openQr = async (ctx, guest) => {
    let qr;
    try {
        qr = await api.get(`/api/admin/guests/${guest.id}/qr`, { format: 'json', width: 480 });
    } catch (error) {
        toastError(error);
        return;
    }

    const status = guest.checkedInAt
        ? `<span class="sas-badge sas-badge-checked">${esc(t('Checked in {date}', { date: fmtDate(guest.checkedInAt) }))}</span>`
        : `<span class="sas-badge sas-badge-neutral sas-badge-no-dot">${esc(t('Not checked in yet'))}</span>`;

    modal({
        title: t('QR invitation pass'),
        subtitle: t('{code} - scan this at the entrance to check the guest in.', { code: guest.code }),
        size: 'sm',
        body: `
            <div class="sas-qr-card">
                <img src="${esc(qr.dataUrl)}" alt="${esc(t('QR invitation pass for {name}', { name: guest.name }))}">
                <p class="sas-qr-name">${esc(guest.name)}</p>
                <p class="sas-qr-code">${esc(guest.code)}</p>
                <div class="mt-2">${status}</div>
                <div class="sas-qr-link">
                    <input class="sas-input" id="qr-link" value="${esc(qr.link)}" readonly aria-label="${esc(t('Invitation link'))}">
                    <button type="button" class="sas-btn sas-btn-soft sas-btn-sm" id="qr-copy" aria-label="${esc(t('Copy invitation link'))}">
                        <i class="fa-solid fa-copy"></i>
                    </button>
                </div>
                <p class="sas-hint" style="margin:0.6rem 0 0">${esc(t('The QR opens the guest\'s personalised invitation.'))}</p>
            </div>`,
        footer: `
            <button type="button" class="sas-btn sas-btn-outline" data-bs-dismiss="modal">${esc(t('Close'))}</button>
            <button type="button" class="sas-btn sas-btn-outline" id="qr-print"><i class="fa-solid fa-print"></i> ${esc(t('Print card'))}</button>
            <a class="sas-btn sas-btn-dark" href="/api/admin/guests/${encodeURIComponent(guest.id)}/qr?format=png&width=900" download="${esc(guest.code)}.png">
                <i class="fa-solid fa-download"></i> PNG
            </a>`,
        onMount: (element) => {
            element.querySelector('#qr-copy').addEventListener('click', async () => {
                const ok = await copyText(qr.link);
                toast(ok ? t('Invitation link copied.') : qr.link, ok ? 'success' : 'info');
            });

            element.querySelector('#qr-print').addEventListener('click', () => {
                openPrintWindow(t('{name} - invitation pass', { name: guest.name }), [passCardHtml(ctx, guest, qr.dataUrl)]);
            });
        },
    });
};

exportHref = () => {
    const params = new URLSearchParams();
    if (state.search) {
        params.set('search', state.search);
    }
    if (state.status !== 'all') {
        params.set('status', state.status);
    }
    if (state.category !== 'all') {
        params.set('category', state.category);
    }
    if (state.checkin !== 'all') {
        params.set('checkin', state.checkin);
    }
    const text = params.toString();
    return `/api/admin/guests/export${text ? `?${text}` : ''}`;
};

const render = () => `
    <div class="sas-page-head">
        <div>
            <h2>${esc(t('Guest list'))}</h2>
            <p>${esc(t('Everything you need to invite, track and welcome your guests.'))}</p>
        </div>
        <div class="sas-page-actions">
            <button type="button" class="sas-btn sas-btn-outline sas-btn-sm" data-act="import">
                <i class="fa-solid fa-file-import"></i> ${esc(t('Import CSV'))}
            </button>
            <a class="sas-btn sas-btn-outline sas-btn-sm" href="${exportHref()}" download="sas-guests.csv" id="guest-export">
                <i class="fa-solid fa-file-arrow-down"></i> ${esc(t('Export'))}
            </a>
            <button type="button" class="sas-btn sas-btn-outline sas-btn-sm" data-act="print">
                <i class="fa-solid fa-print"></i> ${esc(t('Print QR passes'))}
            </button>
            <button type="button" class="sas-btn sas-btn-primary sas-btn-sm" data-act="add">
                <i class="fa-solid fa-user-plus"></i> ${esc(t('Add guest'))}
            </button>
        </div>
    </div>

    ${filterBar()}

    <div id="guest-results">
        <div class="sas-card">
            <div class="sas-skeleton" style="height:0.9rem;width:100%"></div>
        </div>
    </div>

    <p class="sas-hint" style="margin-top:1rem">
        <i class="fa-solid fa-shield-halved"></i>
        ${esc(t('Each guest receives a unique code. Codes are checked at the door - never share a guest pass publicly.'))}
    </p>`;

const mount = (ctx, root) => {
    const search = root.querySelector('#guest-search');
    if (search) {
        const run = debounce(() => {
            state.page = 1;
            load(ctx);
        }, 320);
        search.addEventListener('input', () => {
            state.search = search.value;
            run();
        });
    }

    const bindSelect = (selector, key) => {
        const element = root.querySelector(selector);
        if (!element) {
            return;
        }
        element.addEventListener('change', () => {
            state[key] = element.value;
            state.page = 1;
            load(ctx);
        });
    };

    bindSelect('#guest-status', 'status');
    bindSelect('#guest-category', 'category');
    bindSelect('#guest-checkin', 'checkin');
    bindSelect('#guest-sort', 'sort');

    root.addEventListener('click', async (event) => {
        const pageButton = event.target.closest('[data-page]');
        if (pageButton && !pageButton.disabled) {
            state.page = Number(pageButton.dataset.page);
            await load(ctx);
            return;
        }

        const trigger = event.target.closest('[data-act]');
        if (!trigger) {
            return;
        }

        const action = trigger.dataset.act;
        const guest = state.data ? state.data.items.find((item) => item.id === trigger.dataset.id) : null;

        if (action === 'add') {
            openGuestForm(ctx);
            return;
        }

        if (action === 'import') {
            openImport(ctx);
            return;
        }

        if (action === 'print') {
            await printPasses(ctx, state.data ? state.data.items : []);
            return;
        }

        if (!guest) {
            return;
        }

        if (action === 'qr') {
            openQr(ctx, guest);
            return;
        }

        if (action === 'edit') {
            openGuestForm(ctx, guest);
            return;
        }

        if (action === 'delete') {
            const confirmed = await confirmAction({
                title: t('Remove guest'),
                message: t('Remove {name} from the guest list? Their RSVP and QR pass will stop working.', { name: guest.name }),
                confirmLabel: t('Remove guest'),
                tone: 'danger',
            });
            if (!confirmed) {
                return;
            }
            try {
                await api.delete(`/api/admin/guests/${guest.id}`);
                toast(t('{name} removed.', { name: guest.name }), 'success');
                await load(ctx);
            } catch (error) {
                toastError(error);
            }
            return;
        }

        if (action === 'checkin' || action === 'checkout') {
            setBusy(trigger, true);
            try {
                await api.post(`/api/admin/guests/${guest.id}/${action}`, {});
                toast(t(action === 'checkin' ? '{name} checked in.' : "{name}'s check-in was undone.", { name: guest.name }), 'success');
                await load(ctx);
            } catch (error) {
                toastError(error);
            } finally {
                setBusy(trigger, false);
            }
        }
    });

    load(ctx);
};

openImport = (ctx) => {
    const body = `
        <div class="sas-field">
            <label class="sas-label" for="imp-text">${esc(t('CSV data'))}</label>
            <textarea class="sas-textarea" id="imp-text" rows="7" placeholder="name,phone,email,category,seats&#10;Alya Putri,+62 812 1111 2222,alya@example.com,Family,4"></textarea>
            <span class="sas-hint">${esc(t('Required column: name. Optional: phone, email, category, seats.'))}</span>
        </div>
        <div class="sas-field">
            <label class="sas-label" for="imp-file">${esc(t('Or choose a CSV file'))}</label>
            <input class="sas-input" type="file" id="imp-file" accept=".csv,text/csv">
        </div>
        <div id="imp-result"></div>`;

    const footer = `
        <button type="button" class="sas-btn sas-btn-outline" data-bs-dismiss="modal">${esc(t('Close'))}</button>
        <button type="button" class="sas-btn sas-btn-primary" id="imp-run">
            <i class="fa-solid fa-file-import"></i> ${esc(t('Import guests'))}
        </button>`;

    modal({
        title: t('Import guests'),
        subtitle: t('Duplicates are detected automatically and skipped.'),
        body,
        footer,
        size: 'lg',
        onMount: (element) => {
            const textarea = element.querySelector('#imp-text');
            const fileInput = element.querySelector('#imp-file');
            const runButton = element.querySelector('#imp-run');
            const resultBox = element.querySelector('#imp-result');

            fileInput.addEventListener('change', async () => {
                const file = fileInput.files && fileInput.files[0];
                if (!file) {
                    return;
                }
                try {
                    textarea.value = await file.text();
                } catch (error) {
                    toastError(error);
                }
            });

            runButton.addEventListener('click', async () => {
                const rows = parseCsv(textarea.value);
                if (!rows.length) {
                    toast(t('Add a header row and at least one guest.'), 'warning');
                    return;
                }

                setBusy(runButton, true);
                try {
                    const summary = await api.post('/api/admin/guests/import', { rows, markInvited: true });
                    resultBox.innerHTML = `
                        <div class="sas-scan-result ${summary.added ? 'is-ok' : 'is-warn'}" style="margin-top:0.5rem">
                            <div>
                                <h5>${esc(countLabel(summary.added, '{count} guest added', '{count} guests added'))}</h5>
                                <p>${esc(t('{skipped} skipped · {failed} failed', {
                                    skipped: fmtNumber(summary.skipped), failed: fmtNumber(summary.failed),
                                }))}</p>
                            </div>
                        </div>
                        ${summary.errors && summary.errors.length ? `<p class="sas-hint" style="margin-top:0.5rem">${summary.errors.map((item) => esc(importError(item))).join('<br>')}</p>` : ''}`;
                    toast(countLabel(summary.added, '{count} guest imported.', '{count} guests imported.'), 'success');
                    textarea.value = '';
                    fileInput.value = '';
                    await load(ctx);
                } catch (error) {
                    toastError(error);
                } finally {
                    setBusy(runButton, false);
                }
            });
        },
    });
};

export default {
    title: 'Guests',
    subtitle: 'Guest list, seats, RSVPs and QR passes',
    render,
    mount,
};





