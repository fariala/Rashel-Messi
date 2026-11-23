import { t } from '../i18n.js';
import { api } from '../api.js';
import {
    esc, fmtDate, setBusy, toast, toastError,
} from '../ui.js';

const TIMEZONES = ['Asia/Makassar', 'Asia/Jakarta', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'Europe/London', 'America/New_York', 'UTC'];

const colorRow = (label, key, value) => `
    <div class="sas-swatch">
        <input type="color" id="set-theme-${esc(key)}" name="${esc(key)}" value="${esc(value)}" aria-label="${esc(label)}">
        <span>${esc(label)}</span>
    </div>`;

const render = (ctx) => {
    const settings = ctx.settings || {};
    const theme = settings.theme || {};
    const user = ctx.user || {};

    return `
        <div class="sas-page-head">
            <div>
                <h2>${esc(t('Settings'))}</h2>
                <p>${esc(t('Publication, branding and the account behind your studio.'))}</p>
            </div>
            <div class="sas-page-actions">
                <a class="sas-btn sas-btn-outline sas-btn-sm" href="/invite.html" target="_blank" rel="noopener">
                    <i class="fa-solid fa-arrow-up-right-from-square"></i> ${esc(t('View invitation'))}
                </a>
            </div>
        </div>

        <div class="sas-grid-2">
            <section class="sas-card">
                <div class="sas-card-head">
                    <div>
                        <h3 class="sas-card-title">${esc(t('Publication'))}</h3>
                        <p class="sas-card-subtitle">${esc(t('Control who can see the invitation'))}</p>
                    </div>
                    <span class="sas-badge ${settings.published ? 'sas-badge-attending' : 'sas-badge-pending'}">${settings.published ? t('Live') : t('Draft')}</span>
                </div>
                <form id="settings-form">
                    <div class="sas-switch" style="border-bottom:1px solid var(--sas-line)">
                        <span>
                            <label for="set-published" style="display:block;font-size:0.88rem;font-weight:700">${esc(t('Invitation is published'))}</label>
                            <span class="sas-hint">${esc(t('Draft mode hides the invitation and pauses RSVP.'))}</span>
                        </span>
                        <input class="form-check-input" type="checkbox" id="set-published" ${settings.published ? 'checked' : ''}>
                    </div>

                    <div class="sas-field" style="margin-top:1rem">
                        <label class="sas-label" for="set-brand">${esc(t('Studio / brand name'))}</label>
                        <input class="sas-input" id="set-brand" value="${esc(settings.brandName)}" required>
                    </div>

                    <div class="sas-field">
                        <label class="sas-label" for="set-slug">${esc(t('Invitation slug'))}</label>
                        <input class="sas-input" id="set-slug" value="${esc(settings.slug)}" placeholder="rashel-adrian">
                        <span class="sas-hint">${esc(t('Lowercase letters, numbers and dashes.'))}</span>
                    </div>

                    <div class="sas-form-grid">
                        <div class="sas-field">
                            <label class="sas-label" for="set-seats">${esc(t('Default seats per guest'))}</label>
                            <input class="sas-input" id="set-seats" type="number" min="1" max="12" value="${esc(settings.defaultSeats || 2)}">
                        </div>
                        <div class="sas-field">
                            <label class="sas-label" for="set-timezone">${esc(t('Timezone'))}</label>
                            <select class="sas-select" id="set-timezone">
                                ${TIMEZONES.map((zone) => `<option value="${esc(zone)}" ${settings.timezone === zone ? 'selected' : ''}>${esc(zone)}</option>`).join('')}
                            </select>
                        </div>
                    </div>

                    <div class="sas-field">
                        <label class="sas-label" for="set-public-url">${esc(t('Public base URL'))} <span class="sas-muted">${esc(t('(optional)'))}</span></label>
                        <input class="sas-input" id="set-public-url" value="${esc(settings.publicUrl || '')}" placeholder="https://invitations.yourdomain.com">
                        <span class="sas-hint">${esc(t('Used inside guest QR codes. Leave empty to use the current host.'))}</span>
                    </div>

                    <h4 class="sas-card-title" style="font-size:1rem;margin:1.5rem 0 0.5rem">${esc(t('Theme palette'))}</h4>
                    <div class="sas-swatches">
                        ${colorRow(t('Primary'), 'primary', theme.primary || '#b76e79')}
                        ${colorRow(t('Accent'), 'accent', theme.accent || '#c2a26b')}
                        ${colorRow(t('Ink'), 'ink', theme.ink || '#2c2530')}
                        ${colorRow(t('Surface'), 'surface', theme.surface || '#fbf7f2')}
                    </div>

                    <div class="d-flex justify-content-end" style="margin-top:1.25rem">
                        <button type="submit" class="sas-btn sas-btn-primary" id="settings-save">
                            <i class="fa-solid fa-floppy-disk"></i> ${esc(t('Save settings'))}
                        </button>
                    </div>
                </form>
            </section>

            <section class="sas-card">
                <div class="sas-card-head">
                    <div>
                        <h3 class="sas-card-title">${esc(t('Account'))}</h3>
                        <p class="sas-card-subtitle">${esc(t('How you sign in to the studio'))}</p>
                    </div>
                </div>

                <div class="sas-person" style="margin-bottom:1.2rem">
                    <span class="sas-avatar sas-avatar-lg">${esc((user.name || 'S').charAt(0).toUpperCase())}</span>
                    <div>
                        <div class="sas-person-name">${esc(user.name || '')}</div>
                        <div class="sas-person-meta">${esc(t(user.role || 'Owner'))} &middot; ${esc(t('joined {date}', { date: fmtDate(user.createdAt) }))}</div>
                    </div>
                </div>

                <form id="profile-form">
                    <div class="sas-field">
                        <label class="sas-label" for="set-name">${esc(t('Full name'))}</label>
                        <input class="sas-input" id="set-name" value="${esc(user.name || '')}" required>
                    </div>
                    <div class="sas-field">
                        <label class="sas-label" for="set-email">${esc(t('Email address'))}</label>
                        <input class="sas-input" id="set-email" type="email" value="${esc(user.email || '')}" required>
                    </div>
                    <button type="submit" class="sas-btn sas-btn-outline sas-btn-sm" id="profile-save">
                        <i class="fa-solid fa-user-check"></i> ${esc(t('Update profile'))}
                    </button>
                </form>

                <div class="sas-divider"></div>

                <h4 class="sas-card-title" style="font-size:1rem;margin-bottom:0.75rem">${esc(t('Change password'))}</h4>
                <form id="password-form">
                    <div class="sas-field">
                        <label class="sas-label" for="set-current">${esc(t('Current password'))}</label>
                        <input class="sas-input" id="set-current" type="password" autocomplete="current-password" required>
                    </div>
                    <div class="sas-field">
                        <label class="sas-label" for="set-new">${esc(t('New password'))}</label>
                        <input class="sas-input" id="set-new" type="password" autocomplete="new-password" minlength="8" required>
                        <span class="sas-hint">${esc(t('At least 8 characters.'))}</span>
                    </div>
                    <div class="sas-field">
                        <label class="sas-label" for="set-confirm">${esc(t('Confirm new password'))}</label>
                        <input class="sas-input" id="set-confirm" type="password" autocomplete="new-password" required>
                    </div>
                    <button type="submit" class="sas-btn sas-btn-outline sas-btn-sm" id="password-save">
                        <i class="fa-solid fa-key"></i> ${esc(t('Change password'))}
                    </button>
                </form>
            </section>
        </div>

        <section class="sas-card" style="margin-top:1rem">
            <div class="sas-card-head">
                <div>
                    <h3 class="sas-card-title">${esc(t('Your data'))}</h3>
                    <p class="sas-card-subtitle">${esc(t('Everything is stored locally in data/db.json'))}</p>
                </div>
            </div>
            <div class="sas-quick">
                <a href="/api/admin/backup" download><i class="fa-solid fa-database"></i> ${esc(t('Download full backup'))}</a>
                <a href="/api/admin/guests/export" download><i class="fa-solid fa-user-group"></i> ${esc(t('Export guest list (CSV)'))}</a>
                <a href="/api/admin/rsvps/export" download><i class="fa-solid fa-envelope-open-text"></i> ${esc(t('Export RSVPs (CSV)'))}</a>
                <a href="/api/public/invitation" target="_blank" rel="noopener"><i class="fa-solid fa-code"></i> ${esc(t('View public invitation API'))}</a>
            </div>
        </section>

        <section class="sas-card sas-danger-zone" style="margin-top:1rem">
            <div class="sas-card-head">
                <div>
                    <h3 class="sas-card-title">${esc(t('Session'))}</h3>
                    <p class="sas-card-subtitle">${esc(t('Signing out clears the session on this device.'))}</p>
                </div>
                <button type="button" class="sas-btn sas-btn-danger sas-btn-sm" id="settings-logout">
                    <i class="fa-solid fa-right-from-bracket"></i> ${esc(t('Sign out'))}
                </button>
            </div>
            <p class="sas-hint" style="margin:0">
                ${esc(t('Guest passes remain valid after you sign out. Never share admin credentials with guests.'))}
            </p>
        </section>

        </div>
    `;
};

// SETTINGS_MOUNT
const mount = (ctx, root) => {
    const settingsForm = root.querySelector('#settings-form');
    if (settingsForm) {
        settingsForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const save = root.querySelector('#settings-save');
            setBusy(save, true);
            try {
                const result = await api.put('/api/admin/settings', {
                    brandName: root.querySelector('#set-brand').value.trim(),
                    slug: root.querySelector('#set-slug').value.trim(),
                    published: root.querySelector('#set-published').checked,
                    defaultSeats: Number(root.querySelector('#set-seats').value) || 2,
                    timezone: root.querySelector('#set-timezone').value,
                    publicUrl: root.querySelector('#set-public-url').value.trim(),
                    theme: {
                        primary: root.querySelector('[name="primary"]').value,
                        accent: root.querySelector('[name="accent"]').value,
                        ink: root.querySelector('[name="ink"]').value,
                        surface: root.querySelector('[name="surface"]').value,
                    },
                });
                ctx.update({ settings: result.settings });
                toast(t('Settings saved.'), 'success');
            } catch (error) {
                toastError(error);
            } finally {
                setBusy(save, false);
            }
        });
    }

    const profileForm = root.querySelector('#profile-form');
    if (profileForm) {
        profileForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const save = root.querySelector('#profile-save');
            setBusy(save, true);
            try {
                const result = await api.patch('/api/auth/me', {
                    name: root.querySelector('#set-name').value.trim(),
                    email: root.querySelector('#set-email').value.trim(),
                });
                ctx.update({ user: result.user });
                toast(t('Profile updated.'), 'success');
            } catch (error) {
                toastError(error);
            } finally {
                setBusy(save, false);
            }
        });
    }

    const passwordForm = root.querySelector('#password-form');
    if (passwordForm) {
        passwordForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const save = root.querySelector('#password-save');
            const current = root.querySelector('#set-current').value;
            const next = root.querySelector('#set-new').value;
            const confirmValue = root.querySelector('#set-confirm').value;

            if (next !== confirmValue) {
                toast(t('The new passwords do not match.'), 'warning');
                return;
            }

            setBusy(save, true);
            try {
                await api.post('/api/auth/password', { currentPassword: current, newPassword: next });
                passwordForm.reset();
                toast(t('Password updated.'), 'success');
            } catch (error) {
                toastError(error);
            } finally {
                setBusy(save, false);
            }
        });
    }

    const logout = root.querySelector('#settings-logout');
    if (logout) {
        logout.addEventListener('click', () => api.logout());
    }
};

export default {
    title: 'Settings',
    subtitle: 'Publication, branding and account',
    render,
    mount,
};

