import { getLanguage, t } from './i18n.js';

const ESCAPES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

/**
 * Escape a value for safe interpolation in HTML.
 *
 * @param {any} value
 * @returns {string}
 */
export const esc = (value) => String(value === null || value === undefined ? '' : value)
    .replace(/[&<>"']/g, (char) => ESCAPES[char]);

const formatters = Object.fromEntries(['en', 'fr'].map((language) => {
    const locale = language === 'fr' ? 'fr-FR' : 'en-GB';
    const date = { day: 'numeric', month: 'short', year: 'numeric' };
    const time = { hour: '2-digit', minute: '2-digit' };
    return [language, {
        date: new Intl.DateTimeFormat(locale, date),
        dateTime: new Intl.DateTimeFormat(locale, { ...date, ...time }),
        shortDate: new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short' }),
        time: new Intl.DateTimeFormat(locale, time),
        number: new Intl.NumberFormat(language === 'fr' ? locale : 'en-US'),
        relative: new Intl.RelativeTimeFormat(locale, { numeric: 'always' }),
    }];
}));

const toDate = (value) => {
    if (!value) {
        return null;
    }
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

export const fmtNumber = (value) => formatters[getLanguage()].number.format(Number(value) || 0);
export const countLabel = (count, singular, plural, emphasize = false) => {
    const value = fmtNumber(count);
    return t(count === 1 ? singular : plural, { count: emphasize ? `<strong>${value}</strong>` : value });
};
export const fmtDate = (value) => {
    const date = toDate(value);
    return date ? formatters[getLanguage()].date.format(date) : '—';
};
export const fmtDateTime = (value) => {
    const date = toDate(value);
    return date ? formatters[getLanguage()].dateTime.format(date) : '—';
};
export const fmtShortDate = (value) => {
    const date = toDate(value);
    return date ? formatters[getLanguage()].shortDate.format(date) : '';
};
export const fmtTime = (value) => {
    const date = toDate(value);
    return date ? formatters[getLanguage()].time.format(date) : '';
};

/**
 * Human friendly relative time, e.g. "3 min ago".
 *
 * @param {string} value
 * @returns {string}
 */
export const timeAgo = (value) => {
    const date = toDate(value);
    if (!date) {
        return '—';
    }
    const seconds = Math.round((Date.now() - date.getTime()) / 1000);
    if (seconds < 45) {
        return t('just now');
    }
    const minutes = Math.round(seconds / 60);
    const relative = formatters[getLanguage()].relative;
    if (minutes < 60) {
        return getLanguage() === 'en' ? `${minutes} min ago` : relative.format(-minutes, 'minute');
    }
    const hours = Math.round(minutes / 60);
    if (hours < 24) {
        return relative.format(-hours, 'hour');
    }
    const days = Math.round(hours / 24);
    if (days < 7) {
        return relative.format(-days, 'day');
    }
    return fmtDate(date);
};

/**
 * Initials for an avatar chip.
 *
 * @param {string} name
 * @returns {string}
 */
export const initials = (name) => String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

const AVATAR_TONES = ['#b76e79', '#8d6e63', '#6b7f8d', '#8a7ca8', '#7f9179', '#a8806a', '#9a7c6f', '#6f7a9a'];

/**
 * Deterministic avatar tint for a name.
 *
 * @param {string} name
 * @returns {string}
 */
const avatarTone = (name) => {
    let hash = 0;
    for (let i = 0; i < String(name).length; i += 1) {
        hash = (hash + String(name).charCodeAt(i) * 17) % 997;
    }
    return AVATAR_TONES[hash % AVATAR_TONES.length];
};

/**
 * Avatar markup.
 *
 * @param {string} name
 * @param {string} [sizeClass]
 * @returns {string}
 */
export const avatar = (name, sizeClass = '') => (
    `<span class="sas-avatar ${sizeClass}" style="background:${avatarTone(name)}" aria-hidden="true">${esc(initials(name))}</span>`
);

const STATUS_LABELS = {
    attending: 'Attending',
    declined: 'Declined',
    pending: 'Awaiting reply',
};

/**
 * RSVP status badge.
 *
 * @param {string} status
 * @returns {string}
 */
export const statusBadge = (status) => {
    const normalized = ['attending', 'declined'].includes(status) ? status : 'pending';
    return `<span class="sas-badge sas-badge-${normalized}">${esc(t(STATUS_LABELS[normalized]))}</span>`;
};

/**
 * Check-in badge.
 *
 * @param {string|null} checkedInAt
 * @returns {string}
 */
export const checkinBadge = (checkedInAt) => (checkedInAt
    ? `<span class="sas-badge sas-badge-checked">${esc(t('Checked in'))}</span>`
    : `<span class="sas-badge sas-badge-neutral sas-badge-no-dot">${esc(t('Not arrived'))}</span>`);

/**
 * Debounce a callback.
 *
 * @param {(...args: any[]) => void} fn
 * @param {number} [wait]
 * @returns {(...args: any[]) => void}
 */
export const debounce = (fn, wait = 320) => {
    let timer = 0;
    return (...args) => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => fn(...args), wait);
    };
};

const TOAST_ICONS = {
    success: 'fa-circle-check',
    error: 'fa-circle-exclamation',
    warning: 'fa-triangle-exclamation',
    info: 'fa-circle-info',
};

/**
 * Show a floating toast notification.
 *
 * @param {string} message
 * @param {'success'|'error'|'warning'|'info'} [type]
 * @returns {void}
 */
export const toast = (message, type = 'info') => {
    let stack = document.querySelector('.sas-toast-stack');
    if (!stack) {
        stack = document.createElement('div');
        stack.className = 'sas-toast-stack';
        stack.setAttribute('role', 'status');
        stack.setAttribute('aria-live', 'polite');
        document.body.appendChild(stack);
    }

    const element = document.createElement('div');
    element.className = `sas-toast is-${type}`;
    element.innerHTML = `<i class="fa-solid ${TOAST_ICONS[type] || TOAST_ICONS.info}"></i><span>${esc(message)}</span>`;
    stack.appendChild(element);

    window.setTimeout(() => {
        element.style.opacity = '0';
        element.style.transform = 'translateY(6px)';
        element.style.transition = 'opacity 220ms ease, transform 220ms ease';
        window.setTimeout(() => element.remove(), 240);
    }, 3600);
};

/**
 * Show an error toast for a thrown error.
 *
 * @param {any} error
 * @returns {void}
 */
export const toastError = (error) => {
    toast(t(error?.message || 'Something went wrong.'), 'error');
};

/**
 * Create a Bootstrap modal on the fly.
 *
 * @param {{ title: string, subtitle?: string, body: string, footer?: string, size?: 'sm'|'lg'|'xl', onMount?: (element: HTMLElement, close: () => void) => void }} options
 * @returns {{ element: HTMLElement, close: () => void }}
 */
export const modal = (options) => {
    const sizeClass = options.size ? ` modal-${options.size}` : '';
    const wrapper = document.createElement('div');
    wrapper.className = 'modal fade';
    wrapper.tabIndex = -1;
    wrapper.innerHTML = `
        <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable${sizeClass}">
            <div class="modal-content sas-modal">
                <div class="sas-modal-head">
                    <div>
                        <h3 class="sas-modal-title">${esc(options.title)}</h3>
                        ${options.subtitle ? `<p class="sas-modal-sub">${esc(options.subtitle)}</p>` : ''}
                    </div>
                    <button type="button" class="sas-modal-close" data-bs-dismiss="modal" aria-label="${esc(t('Close'))}">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div class="sas-modal-body">${options.body}</div>
                ${options.footer ? `<div class="sas-modal-foot">${options.footer}</div>` : ''}
            </div>
        </div>`;

    document.body.appendChild(wrapper);

    const instance = new window.bootstrap.Modal(wrapper, { backdrop: 'static' });
    const close = () => instance.hide();

    wrapper.addEventListener('hidden.bs.modal', () => {
        instance.dispose();
        wrapper.remove();
    });

    instance.show();

    if (options.onMount) {
        options.onMount(wrapper, close);
    }

    return { element: wrapper, close };
};

/**
 * Promise based confirmation dialog.
 *
 * @param {{ title?: string, message: string, confirmLabel?: string, cancelLabel?: string, tone?: 'danger'|'primary' }} options
 * @returns {Promise<boolean>}
 */
export const confirmAction = (options) => new Promise((resolve) => {
    let settled = false;
    const finish = (value, close) => {
        if (settled) {
            return;
        }
        settled = true;
        resolve(value);
        close();
    };

    modal({
        title: options.title || t('Please confirm'),
        body: `<p style="margin:0;font-size:0.9rem;line-height:1.7;color:var(--sas-ink-soft)">${esc(options.message)}</p>`,
        footer: `
            <button type="button" class="sas-btn sas-btn-outline" data-confirm-cancel>${esc(options.cancelLabel || t('Cancel'))}</button>
            <button type="button" class="sas-btn ${options.tone === 'danger' ? 'sas-btn-danger' : 'sas-btn-primary'}" data-confirm-ok>${esc(options.confirmLabel || t('Confirm'))}</button>`,
        onMount: (element, close) => {
            element.querySelector('[data-confirm-ok]').addEventListener('click', () => finish(true, close));
            element.querySelector('[data-confirm-cancel]').addEventListener('click', () => finish(false, close));
            element.addEventListener('hidden.bs.modal', () => finish(false, () => {}));
        },
    });
});

/**
 * Copy text to the clipboard with a graceful fallback.
 *
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export const copyText = async (text) => {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        /* fall through to the legacy path */
    }

    try {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', 'readonly');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand('copy');
        area.remove();
        return ok;
    } catch {
        return false;
    }
};

/**
 * Toggle a button's busy state while keeping its label.
 *
 * @param {HTMLButtonElement|null} button
 * @param {boolean} busy
 * @returns {void}
 */
export const setBusy = (button, busy) => {
    if (!button) {
        return;
    }
    if (busy) {
        if (!button.dataset.label) {
            button.dataset.label = button.innerHTML;
        }
        button.setAttribute('aria-busy', 'true');
        button.disabled = true;
        button.innerHTML = '<span class="sas-spinner"></span>';
        return;
    }
    button.removeAttribute('aria-busy');
    button.disabled = false;
    if (button.dataset.label) {
        button.innerHTML = button.dataset.label;
        delete button.dataset.label;
    }
};

/**
 * Convert a File to a data URL.
 *
 * @param {File} file
 * @returns {Promise<string>}
 */
export const fileToDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(t('That file could not be read.')));
    reader.readAsDataURL(file);
});

/**
 * Minimal CSV parser that understands quoted fields.
 *
 * @param {string} text
 * @returns {Array<Record<string, string>>}
 */
export const parseCsv = (text) => {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;

    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        const next = text[i + 1];

        if (quoted) {
            if (char === '"' && next === '"') {
                cell += '"';
                i += 1;
            } else if (char === '"') {
                quoted = false;
            } else {
                cell += char;
            }
        } else if (char === '"') {
            quoted = true;
        } else if (char === ',') {
            row.push(cell.trim());
            cell = '';
        } else if (char === '\n') {
            row.push(cell.trim());
            rows.push(row);
            row = [];
            cell = '';
        } else if (char !== '\r') {
            cell += char;
        }
    }

    if (cell.length || row.length) {
        row.push(cell.trim());
        rows.push(row);
    }

    if (rows.length < 2) {
        return [];
    }

    const headers = rows[0].map((header) => header.toLowerCase().replace(/[^a-z]/g, ''));
    return rows.slice(1)
        .filter((line) => line.some((value) => value.length))
        .map((line) => headers.reduce((record, header, index) => {
            if (header) {
                record[header] = line[index] === undefined ? '' : line[index];
            }
            return record;
        }, {}));
};

/**
 * Standard empty state markup.
 *
 * @param {string} icon
 * @param {string} title
 * @param {string} text
 * @returns {string}
 */
export const emptyState = (icon, title, text) => `
    <div class="sas-empty">
        <i class="fa-solid ${esc(icon)}"></i>
        <h4>${esc(title)}</h4>
        <p>${esc(text)}</p>
    </div>`;


