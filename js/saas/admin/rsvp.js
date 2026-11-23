import { t } from '../i18n.js';
import { api } from '../api.js';
import {
    avatar, confirmAction, countLabel, debounce, emptyState, esc, fmtDateTime,
    modal, setBusy, statusBadge, toast, toastError,
} from '../ui.js';

const state = {
    status: 'all',
    search: '',
    data: null,
};

const chipsTemplate = (summary) => `
    <span class="sas-count-pill">${countLabel(summary.total, '{count} response', '{count} responses', true)}</span>
    <span class="sas-count-pill" style="background:#e5f2e8;color:#3f7052">${countLabel(summary.attending, '{count} attending', '{count} attending guests', true)}</span>
    <span class="sas-count-pill" style="background:#fbe8e9;color:#a44a52">${countLabel(summary.declined, '{count} declined', '{count} declined invitations', true)}</span>
    <span class="sas-count-pill">${countLabel(summary.seats, '{count} seat confirmed', '{count} seats confirmed', true)}</span>`;

const tableTemplate = (data) => {
    if (!data.items.length) {
        return emptyState('fa-envelope-open-text', t('No RSVP responses yet'), t('Share the invitation link and replies will appear here.'));
    }

    const rows = data.items.map((rsvp) => `
        <tr>
            <td>
                <div class="sas-person">
                    ${avatar(rsvp.name)}
                    <div>
                        <div class="sas-person-name">${esc(rsvp.name)}</div>
                        <div class="sas-person-meta">${esc(rsvp.code || t('No invitation code'))} &middot; ${esc(t(rsvp.category || 'Other'))}</div>
                    </div>
                </div>
            </td>
            <td>${statusBadge(rsvp.attendance)}</td>
            <td>${rsvp.seats ? esc(countLabel(rsvp.seats, '{count} seat', '{count} seats')) : '&mdash;'}</td>
            <td style="max-width:16rem">
                <span class="sas-small ${rsvp.message ? '' : 'sas-muted'}">${rsvp.message ? `&ldquo;${esc(rsvp.message)}&rdquo;` : t('No message')}</span>
            </td>
            <td class="sas-small sas-muted">${esc(fmtDateTime(rsvp.createdAt))}</td>
            <td>
                <div class="sas-actions">
                    <button type="button" class="sas-icon-btn" data-act="edit" data-id="${esc(rsvp.id)}" title="${esc(t('Edit response'))}" aria-label="${esc(t('Edit response'))}">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button type="button" class="sas-icon-btn is-danger" data-act="remove" data-id="${esc(rsvp.id)}" title="${esc(t('Delete response'))}" aria-label="${esc(t('Delete response'))}">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>`).join('');

    return `
        <div class="sas-table-wrap">
            <table class="sas-table">
                <thead>
                    <tr>
                        <th>${esc(t('Guest'))}</th>
                        <th>${esc(t('Response'))}</th>
                        <th>${esc(t('Seats'))}</th>
                        <th>${esc(t('Message'))}</th>
                        <th>${esc(t('Replied'))}</th>
                        <th class="text-end">${esc(t('Actions'))}</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
};

const load = async (ctx) => {
    const container = document.getElementById('rsvp-results');
    if (!container) {
        return;
    }

    container.innerHTML = '<div class="sas-card"><div class="sas-skeleton" style="height:0.9rem;width:100%"></div></div>';

    try {
        state.data = await api.get('/api/admin/rsvps', { status: state.status, search: state.search });
        container.innerHTML = `<div class="sas-card">${tableTemplate(state.data)}</div>`;
        const chips = document.getElementById('rsvp-chips');
        if (chips) {
            chips.innerHTML = chipsTemplate(state.data.summary);
        }
    } catch (error) {
        container.innerHTML = `<div class="sas-card">${emptyState('fa-cloud-bolt', t('Could not load RSVPs'), t(error.message))}</div>`;
        toastError(error);
    }

    if (ctx) {
        ctx.refreshChrome();
    }
};

const openEdit = (ctx, rsvp) => {
    modal({
        title: t('Update RSVP'),
        subtitle: rsvp.name,
        body: `
            <form id="rsvp-form" class="sas-form-grid">
                <div class="sas-field">
                    <label class="sas-label" for="rs-attendance">${esc(t('Response'))}</label>
                    <select class="sas-select" id="rs-attendance">
                        <option value="attending" ${rsvp.attendance === 'attending' ? 'selected' : ''}>${esc(t('Attending'))}</option>
                        <option value="declined" ${rsvp.attendance === 'declined' ? 'selected' : ''}>${esc(t('Declined'))}</option>
                    </select>
                </div>
                <div class="sas-field">
                    <label class="sas-label" for="rs-seats">${esc(t('Seats'))}</label>
                    <input class="sas-input" id="rs-seats" type="number" min="0" max="12" value="${esc(rsvp.seats || 0)}">
                </div>
                <div class="sas-field is-full">
                    <label class="sas-label" for="rs-message">${esc(t('Message'))}</label>
                    <textarea class="sas-textarea" id="rs-message" rows="3">${esc(rsvp.message)}</textarea>
                </div>
            </form>`,
        footer: `
            <button type="button" class="sas-btn sas-btn-outline" data-bs-dismiss="modal">${esc(t('Cancel'))}</button>
            <button type="button" class="sas-btn sas-btn-primary" id="rs-save"><i class="fa-solid fa-floppy-disk"></i> ${esc(t('Save response'))}</button>`,
        onMount: (element, close) => {
            const save = element.querySelector('#rs-save');
            save.addEventListener('click', async () => {
                setBusy(save, true);
                try {
                    await api.patch(`/api/admin/rsvps/${rsvp.id}`, {
                        attendance: element.querySelector('#rs-attendance').value,
                        seats: Number(element.querySelector('#rs-seats').value) || 0,
                        message: element.querySelector('#rs-message').value.trim(),
                    });
                    toast(t('RSVP updated.'), 'success');
                    close();
                    await load(ctx);
                } catch (error) {
                    toastError(error);
                } finally {
                    setBusy(save, false);
                }
            });
        },
    });
};

const render = async () => {
    const data = await api.get('/api/admin/rsvps', { status: state.status, search: state.search });
    state.data = data;

    return `
        <div class="sas-page-head">
            <div>
                <h2>${esc(t('RSVP responses'))}</h2>
                <p>${esc(t('Every reply, message and confirmed seat in one place.'))}</p>
            </div>
            <div class="sas-page-actions">
                <a class="sas-btn sas-btn-outline sas-btn-sm" href="/api/admin/rsvps/export" download="sas-rsvps.csv">
                    <i class="fa-solid fa-file-arrow-down"></i> ${esc(t('Export CSV'))}
                </a>
                <a class="sas-btn sas-btn-primary sas-btn-sm" href="/invite.html" target="_blank" rel="noopener">
                    <i class="fa-solid fa-link"></i> ${esc(t('Open invitation'))}
                </a>
            </div>
        </div>

        <div class="sas-card" style="margin-bottom:1rem">
            <div class="sas-toolbar">
                <div class="sas-search">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input class="sas-input" id="rsvp-search" type="search" placeholder="${esc(t('Search guest or message'))}" value="${esc(state.search)}" aria-label="${esc(t('Search RSVPs'))}">
                </div>
                <select class="sas-select" id="rsvp-status" aria-label="${esc(t('Filter responses'))}">
                    <option value="all" ${state.status === 'all' ? 'selected' : ''}>${esc(t('All responses'))}</option>
                    <option value="attending" ${state.status === 'attending' ? 'selected' : ''}>${esc(t('Attending'))}</option>
                    <option value="declined" ${state.status === 'declined' ? 'selected' : ''}>${esc(t('Declined'))}</option>
                </select>
            </div>
            <div class="d-flex flex-wrap align-items-center gap-2" id="rsvp-chips"></div>
        </div>

        <div id="rsvp-results"><div class="sas-card">${tableTemplate(data)}</div></div>

        <p class="sas-hint" style="margin-top:1rem">
            <i class="fa-solid fa-circle-info"></i>
            ${esc(t('Updating a response updates the guest\'s RSVP status and seat count everywhere.'))}
        </p>`;
};

const mount = (ctx, root) => {
    const search = root.querySelector('#rsvp-search');
    const run = debounce(() => load(ctx), 320);

    if (search) {
        search.addEventListener('input', () => {
            state.search = search.value;
            run();
        });
    }

    const status = root.querySelector('#rsvp-status');
    if (status) {
        status.addEventListener('change', () => {
            state.status = status.value;
            load(ctx);
        });
    }

    root.addEventListener('click', async (event) => {
        const trigger = event.target.closest('[data-act]');
        if (!trigger || !state.data) {
            return;
        }

        const rsvp = state.data.items.find((item) => item.id === trigger.dataset.id);
        if (!rsvp) {
            return;
        }

        if (trigger.dataset.act === 'edit') {
            openEdit(ctx, rsvp);
            return;
        }

        if (trigger.dataset.act === 'remove') {
            const confirmed = await confirmAction({
                title: t('Delete response'),
                message: t("Delete {name}'s RSVP? Their guest record will return to awaiting reply.", { name: rsvp.name }),
                confirmLabel: t('Delete response'),
                tone: 'danger',
            });
            if (!confirmed) {
                return;
            }
            try {
                await api.delete(`/api/admin/rsvps/${rsvp.id}`);
                toast(t('Response deleted.'), 'success');
                await load(ctx);
            } catch (error) {
                toastError(error);
            }
        }
    });

    load(ctx);
};

export default {
    title: 'RSVPs',
    subtitle: 'Attendance, seats and messages from your guests',
    render,
    mount,
};


