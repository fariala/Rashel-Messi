import { initLanguage, t } from '../i18n.js';
import { api, redirectToLogin, session } from '../api.js';
import { esc, fmtNumber, initials, toastError } from '../ui.js';
import './translations.js';
import overview from './overview.js';
import guests from './guests.js';
import cms from './cms.js';
import rsvp from './rsvp.js';
import checkin from './checkin.js';
import settings from './settings.js';

const VIEWS = { overview, guests, cms, rsvp, checkin, settings };
const DEFAULT_VIEW = 'overview';

let root = document.getElementById('view-root');
const shell = document.getElementById('sas-shell');
const titleElement = document.getElementById('page-title');
const subtitleElement = document.getElementById('page-subtitle');
const publishBadge = document.getElementById('publish-badge');
const publishState = document.getElementById('sidebar-publish-state');
const inviteLink = document.getElementById('sidebar-invite-link');
const guestCount = document.getElementById('nav-guest-count');
const rsvpCount = document.getElementById('nav-rsvp-count');

let renderToken = 0;
let mountedView = null;
const bootstrapState = {
    user: null,
    content: null,
    settings: null,
};

const skeleton = () => `
    <div class="sas-card">
        <div class="sas-skeleton" style="height:1.2rem;width:38%;margin-bottom:1rem"></div>
        <div class="sas-skeleton" style="height:0.8rem;width:72%;margin-bottom:0.6rem"></div>
        <div class="sas-skeleton" style="height:0.8rem;width:56%"></div>
    </div>`;

const apiErrorCard = (error) => `
    <div class="sas-empty">
        <i class="fa-solid fa-cloud-bolt"></i>
        <h4>${esc(t('We could not load this view'))}</h4>
        <p>${esc(t(error?.message || 'Please try again in a moment.'))}</p>
    </div>`;

const setTitle = (title, subtitle) => {
    if (titleElement) {
        titleElement.textContent = t(title);
    }
    if (subtitleElement) {
        subtitleElement.textContent = t(subtitle || '');
    }
    document.title = `${t(title)} | SAS Wedding Studio`;
};

const setActiveNav = (viewId) => {
    document.querySelectorAll('[data-view]').forEach((button) => {
        button.classList.toggle('is-active', button.dataset.view === viewId);
    });
};

const paintChrome = (dashboard) => {
    const published = dashboard
        ? dashboard.invitation.published
        : Boolean(bootstrapState.settings && bootstrapState.settings.published);

    if (publishBadge) {
        const icon = published ? 'fa-circle-check' : 'fa-circle-pause';
        const text = t(published ? 'Published' : 'Draft mode');
        publishBadge.innerHTML = `<i class="fa-solid ${icon}"></i> ${esc(text)}`;
        publishBadge.classList.toggle('is-offline', !published);
    }
    if (publishState) {
        publishState.textContent = published ? t('published') : t('in draft');
    }

    if (dashboard) {
        const summary = dashboard.summary;
        if (guestCount) {
            guestCount.textContent = fmtNumber(summary.total);
        }
        if (rsvpCount) {
            rsvpCount.textContent = fmtNumber(summary.attending + summary.declined);
        }
    }
};

const refreshChrome = async () => {
    try {
        const dashboard = await api.get('/api/admin/dashboard');
        paintChrome(dashboard);
        return dashboard;
    } catch {
        return null;
    }
};

const paintUser = () => {
    const name = bootstrapState.user ? bootstrapState.user.name : 'Studio';
    const email = bootstrapState.user ? bootstrapState.user.email : '';

    const nameElement = document.getElementById('sidebar-name');
    const emailElement = document.getElementById('sidebar-email');
    const topbarName = document.getElementById('topbar-name');

    if (nameElement) {
        nameElement.textContent = name;
    }
    if (emailElement) {
        emailElement.textContent = email;
    }
    if (topbarName) {
        topbarName.textContent = name.split(' ')[0];
    }

    const sidebarAvatar = document.getElementById('sidebar-avatar');
    const topbarAvatar = document.getElementById('topbar-avatar');
    if (sidebarAvatar) {
        sidebarAvatar.textContent = initials(name);
    }
    if (topbarAvatar) {
        topbarAvatar.textContent = initials(name);
        topbarAvatar.style.background = '#b76e79';
    }
};

const paintBrand = () => {
    const brand = bootstrapState.settings ? bootstrapState.settings.brandName : 'SAS Wedding Studio';
    const brandElement = document.getElementById('brand-name');
    if (brandElement) {
        brandElement.textContent = brand;
    }
    if (inviteLink) {
        inviteLink.href = '/invite.html';
    }
    paintChrome();
};

let render = null;

const ctx = {
    get user() {
        return bootstrapState.user;
    },
    get settings() {
        return bootstrapState.settings;
    },
    get content() {
        return bootstrapState.content;
    },
    api,
    session,
    /**
     * Update cached CMS data after a save.
     *
     * @param {{ content?: object, settings?: object }} payload
     * @returns {void}
     */
    update(payload) {
        if (payload.content) {
            bootstrapState.content = payload.content;
        }
        if (payload.settings) {
            bootstrapState.settings = payload.settings;
        }
        if (payload.user) {
            bootstrapState.user = payload.user;
        }
        paintBrand();
        paintUser();
    },
    refreshChrome,
    /**
     * Navigate to a dashboard view.
     *
     * @param {string} viewId
     * @returns {void}
     */
    go(viewId) {
        window.location.hash = `#/${viewId}`;
    },
    /**
     * Re-render the active view.
     *
     * @returns {Promise<void>}
     */
    async reload() {
        await render();
    },
};

render = async ({ preserveDraft = false } = {}) => {
    const hash = window.location.hash.replace(/^#\/?/, '');
    const viewId = VIEWS[hash] ? hash : DEFAULT_VIEW;
    const view = VIEWS[viewId];
    const scroll = window.scrollY;
    const preserveInputs = preserveDraft && mountedView === view && (view === settings || view === checkin);
    const previous = root;

    renderToken += 1;
    const token = renderToken;

    setActiveNav(viewId);
    setTitle(view.title, view.subtitle);
    if (shell) {
        shell.classList.remove('is-drawer-open');
    }

    if (!preserveDraft || !mountedView) {
        mountedView?.unmount?.();
        mountedView = null;
        root.innerHTML = skeleton();
    }

    try {
        const markup = await view.render(ctx, { preserveDraft });
        if (token !== renderToken) {
            return;
        }
        mountedView?.unmount?.();
        root = previous.cloneNode(false);
        root.innerHTML = markup;
        if (preserveInputs) {
            previous.querySelectorAll('form input[id], form select[id]').forEach((input) => {
                const field = root.querySelector(`#${input.id}`);
                if (field) {
                    field.value = input.value;
                    if (input.type === 'checkbox') {
                        field.checked = input.checked;
                    }
                }
            });
        }
        previous.replaceWith(root);
        if (typeof view.mount === 'function') {
            view.mount(ctx, root);
        }
        mountedView = view;
        window.scrollTo(preserveDraft ? { top: scroll } : { top: 0, behavior: 'smooth' });
        refreshChrome();
    } catch (error) {
        if (token !== renderToken) {
            return;
        }
        if (preserveDraft && mountedView === view) {
            toastError(error);
            return;
        }
        root.innerHTML = `<div class="sas-card">${apiErrorCard(error)}</div>`;
        toastError(error);
    }
};

const bindShell = () => {
    document.querySelectorAll('[data-view]').forEach((button) => {
        button.addEventListener('click', () => ctx.go(button.dataset.view));
    });

    const menuToggle = document.getElementById('menu-toggle');
    if (menuToggle) {
        menuToggle.addEventListener('click', () => shell.classList.toggle('is-drawer-open'));
    }

    document.querySelectorAll('[data-drawer-close]').forEach((element) => {
        element.addEventListener('click', () => shell.classList.remove('is-drawer-open'));
    });

    const logout = document.getElementById('logout-button');
    if (logout) {
        logout.addEventListener('click', () => api.logout());
    }
};

const boot = async () => {
    let ready = false;
    initLanguage(() => {
        if (ready) {
            paintUser();
            paintBrand();
            render({ preserveDraft: true });
        }
    });

    if (!session.token()) {
        redirectToLogin();
        return;
    }

    try {
        const me = await api.get('/api/auth/me');
        bootstrapState.user = me.user;
    } catch (error) {
        if (error.status !== 401) {
            toastError(error);
        }
        return;
    }

    try {
        const data = await api.get('/api/admin/content');
        bootstrapState.content = data.content;
        bootstrapState.settings = data.settings;
    } catch (error) {
        toastError(error);
    }

    paintUser();
    paintBrand();
    bindShell();
    ready = true;
    window.addEventListener('hashchange', () => render());
    render();
};

boot();
