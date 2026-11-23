import { api } from '../api.js';
import { t } from '../i18n.js';
import { frenchFieldPath, getFrenchCopy } from '../../../server/lib/invitation-language.js';
import {
    esc, fileToDataUrl, setBusy, toast, toastError,
} from '../ui.js';
import './cms-translations.js';

const SECTIONS = [
    { id: 'couple', label: 'Couple & hero', icon: 'fa-heart' },
    { id: 'story', label: 'Love story', icon: 'fa-book-open' },
    { id: 'events', label: 'Events', icon: 'fa-calendar-days' },
    { id: 'gallery', label: 'Gallery', icon: 'fa-images' },
    { id: 'gifts', label: 'Wedding gifts', icon: 'fa-gift' },
    { id: 'rsvp', label: 'RSVP & details', icon: 'fa-envelope-open-text' },
    { id: 'design', label: 'Meta & music', icon: 'fa-wand-magic-sparkles' },
];

const state = {
    draft: null,
    active: 'couple',
    editLanguage: 'en',
    status: 'idle',
    revision: 0,
    saving: false,
};

const clone = (value) => JSON.parse(JSON.stringify(value || {}));

const getPath = (object, path) => path.split('.').reduce((cursor, key) => (
    cursor === null || cursor === undefined ? undefined : cursor[key]
), object);

const setPath = (object, path, value) => {
    const keys = path.split('.');
    let cursor = object;
    keys.forEach((key, index) => {
        if (index === keys.length - 1) {
            cursor[key] = value;
            return;
        }
        if (typeof cursor[key] !== 'object' || cursor[key] === null) {
            cursor[key] = {};
        }
        cursor = cursor[key];
    });
};

const val = (path) => {
    const value = getPath(state.draft, path);
    return value === undefined || value === null ? '' : value;
};

const translated = (message, values) => esc(t(message, values));

const copyField = (path, options) => {
    const frenchPath = state.editLanguage === 'fr' ? frenchFieldPath(path) : null;
    if (!frenchPath) {
        return { path, value: val(path), placeholder: t(options.placeholder || '') };
    }
    const english = val(path);
    return {
        path: frenchPath,
        value: val(frenchPath) || getFrenchCopy(english) || '',
        placeholder: english || t(options.placeholder || ''),
        language: 'fr',
    };
};

const textField = (label, path, options = {}) => {
    const field = copyField(path, options);
    return `
    <div class="sas-field ${options.full ? 'is-full' : ''}">
        <label class="sas-label" for="f-${esc(path).replace(/\./g, '-')}">${translated(label)}</label>
        <input class="sas-input" id="f-${esc(path).replace(/\./g, '-')}" data-path="${esc(field.path)}"
            ${field.language ? 'lang="fr"' : ''}
            type="${options.type || 'text'}" value="${esc(field.value)}" placeholder="${esc(field.placeholder)}"
            ${options.min !== undefined ? `min="${options.min}"` : ''} ${options.max !== undefined ? `max="${options.max}"` : ''}>
    </div>`;
};

const areaField = (label, path, options = {}) => {
    const field = copyField(path, options);
    return `
    <div class="sas-field ${options.full ? 'is-full' : ''}">
        <label class="sas-label" for="f-${esc(path).replace(/\./g, '-')}">${translated(label)}</label>
        <textarea class="sas-textarea" id="f-${esc(path).replace(/\./g, '-')}" data-path="${esc(field.path)}"
            ${field.language ? 'lang="fr"' : ''} rows="${options.rows || 3}" placeholder="${esc(field.placeholder)}">${esc(field.value)}</textarea>
    </div>`;
};

const toggleField = (label, path, hint) => `
    <div class="sas-field is-full">
        <label class="sas-switch">
            <span>
                <strong style="display:block;font-size:0.85rem;font-weight:600">${translated(label)}</strong>
                <span class="sas-hint">${translated(hint || '')}</span>
            </span>
            <input class="form-check-input" type="checkbox" data-path="${esc(path)}" data-type="bool" ${val(path) ? 'checked' : ''}>
        </label>
    </div>`;

const imageField = (label, path, options = {}) => `
    <div class="sas-field ${options.full ? 'is-full' : ''}">
        <label class="sas-label" for="f-${esc(path).replace(/\./g, '-')}">${translated(label)}</label>
        <div class="sas-media">
            <img class="sas-media-thumb" src="${esc(val(path) || '/assets/images/placeholder.webp')}" alt="${translated('Preview')}">
            <input class="sas-input" id="f-${esc(path).replace(/\./g, '-')}" data-path="${esc(path)}" value="${esc(val(path))}" placeholder="./assets/images/bg.webp">
            <label class="sas-btn sas-btn-outline sas-btn-sm sas-upload">
                <i class="fa-solid fa-arrow-up-from-bracket"></i> ${translated('Upload')}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-upload="${esc(path)}">
            </label>
        </div>
    </div>`;

const colorField = (label, path) => `
    <div class="sas-swatch">
        <input type="color" data-path="${esc(path)}" value="${esc(val(path) || '#b76e79')}" aria-label="${esc(label)}">
        <span>${esc(label)}</span>
    </div>`;

const repeat = (title, listKey, index, body) => `
    <div class="sas-repeat">
        <div class="sas-repeat-head">
            <p class="sas-repeat-title"><i class="fa-solid fa-grip-lines"></i> ${translated(title)} ${index + 1}</p>
            <button type="button" class="sas-icon-btn is-danger" data-remove="${esc(listKey)}" data-index="${index}" aria-label="${translated('Remove item')}">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
        <div class="sas-form-grid">${body}</div>
    </div>`;

const addButton = (label, listKey) => `
    <button type="button" class="sas-btn sas-btn-soft sas-btn-sm" data-add="${esc(listKey)}">
        <i class="fa-solid fa-plus"></i> ${translated(label)}
    </button>`;

const listOf = (key) => {
    if (!Array.isArray(state.draft[key])) {
        state.draft[key] = [];
    }
    return state.draft[key];
};

const storySection = () => `
    <section class="sas-card sas-form-section" data-section="story">
        <div class="sas-card-head">
            <div>
                <h3 class="sas-card-title">${translated('Your love story')}</h3>
                <p class="sas-card-subtitle">${translated('A timeline of the moments that brought you here')}</p>
            </div>
            ${addButton('Add moment', 'story')}
        </div>
        ${listOf('story').map((item, index) => repeat('Moment', 'story', index, `
            ${textField('Date', `story.${index}.date`, { placeholder: 'August 2019' })}
            ${textField('Title', `story.${index}.title`, { placeholder: 'A rainy first meeting' })}
            ${areaField('Story', `story.${index}.text`, { full: true, rows: 3 })}
        `)).join('') || `<p class="sas-hint">${translated('No moments yet - add the first one.')}</p>`}
    </section>`;

const eventsSection = () => `
    <section class="sas-card sas-form-section" data-section="events">
        <div class="sas-card-head">
            <div>
                <h3 class="sas-card-title">${translated('Wedding events')}</h3>
                <p class="sas-card-subtitle">${translated('Ceremony, reception and anything in between')}</p>
            </div>
            ${addButton('Add event', 'events')}
        </div>
        ${listOf('events').map((item, index) => repeat('Event', 'events', index, `
            ${textField('Type', `events.${index}.type`, { placeholder: 'Ceremony' })}
            ${textField('Title', `events.${index}.title`, { placeholder: 'Holy Matrimony' })}
            ${textField('Date', `events.${index}.date`, { type: 'date' })}
            ${textField('Venue', `events.${index}.venue`)}
            ${textField('Start time', `events.${index}.startTime`, { type: 'time' })}
            ${textField('End time', `events.${index}.endTime`, { type: 'time' })}
            ${textField('Address', `events.${index}.address`, { full: true })}
            ${textField('Google Maps link', `events.${index}.mapUrl`, { full: true, placeholder: 'https://maps.google.com/...' })}
            ${areaField('Note', `events.${index}.note`, { full: true, rows: 2 })}
        `)).join('') || `<p class="sas-hint">${translated('No events yet - add your ceremony.')}</p>`}
    </section>`;

const gallerySection = () => `
    <section class="sas-card sas-form-section" data-section="gallery">
        <div class="sas-card-head">
            <div>
                <h3 class="sas-card-title">${translated('Gallery')}</h3>
                <p class="sas-card-subtitle">${translated('Square images work best - they appear in a two-column grid')}</p>
            </div>
            ${addButton('Add photo', 'gallery')}
        </div>
        ${listOf('gallery').map((item, index) => repeat('Photo', 'gallery', index, `
            ${imageField('Image', `gallery.${index}.url`, { full: true })}
            ${textField('Caption', `gallery.${index}.caption`, { full: true })}
        `)).join('') || `<p class="sas-hint">${translated('No photos yet.')}</p>`}
    </section>`;

const giftsSection = () => `
    <section class="sas-card sas-form-section" data-section="gifts">
        <div class="sas-card-head">
            <div>
                <h3 class="sas-card-title">${translated('Wedding gifts')}</h3>
                <p class="sas-card-subtitle">${translated('Bank accounts, e-wallets or a delivery address')}</p>
            </div>
            ${addButton('Add gift option', 'gifts')}
        </div>
        ${listOf('gifts').map((item, index) => repeat('Gift option', 'gifts', index, `
            ${textField('Type', `gifts.${index}.type`, { placeholder: 'Bank Transfer' })}
            ${textField('Provider', `gifts.${index}.provider`, { placeholder: 'Bank Mandiri' })}
            ${textField('Account name', `gifts.${index}.accountName`)}
            ${textField('Account number', `gifts.${index}.accountNumber`)}
            ${textField('Note', `gifts.${index}.note`, { full: true })}
        `)).join('') || `<p class="sas-hint">${translated('No gift options yet.')}</p>`}
    </section>`;

const coupleSection = () => {
    const bride = 'couple.bride';
    const groom = 'couple.groom';
    return `
        <section class="sas-card sas-form-section" data-section="couple">
            <div class="sas-card-head">
                <div>
                    <h3 class="sas-card-title">${translated('Hero & cover')}</h3>
                    <p class="sas-card-subtitle">${translated('The opening screen of your invitation')}</p>
                </div>
            </div>
            <div class="sas-form-grid">
                ${textField('Eyebrow', 'hero.eyebrow', { placeholder: 'The Wedding Of' })}
                ${textField('Headline', 'hero.headline', { placeholder: 'Rashel & Adrian' })}
                ${textField('Date label', 'hero.dateLabel', { placeholder: 'Saturday, 12 June 2027' })}
                ${textField('Location', 'hero.location', { placeholder: 'The Amara Estate, Ubud - Bali' })}
                ${imageField('Cover image', 'meta.coverImage', { full: true })}
            </div>
        </section>

        <section class="sas-card sas-form-section" data-section="couple">
            <div class="sas-card-head">
                <div>
                    <h3 class="sas-card-title">${translated('Opening quote')}</h3>
                    <p class="sas-card-subtitle">${translated('A verse, poem or line that means something to you')}</p>
                </div>
            </div>
            <div class="sas-form-grid">
                ${areaField('Quote', 'quote.text', { full: true, rows: 4 })}
                ${textField('Source', 'quote.source', { full: true, placeholder: 'Ar-Rum 21' })}
            </div>
        </section>

        <section class="sas-card sas-form-section" data-section="couple">
            <div class="sas-card-head">
                <div>
                    <h3 class="sas-card-title">${translated('The bride')}</h3>
                    <p class="sas-card-subtitle">${translated('Names, parents and a short introduction')}</p>
                </div>
            </div>
            <div class="sas-form-grid">
                ${textField('Full name', `${bride}.fullName`)}
                ${textField('Nickname', `${bride}.nickname`)}
                ${textField('Role label', `${bride}.role`, { placeholder: 'The Bride' })}
                ${textField('Instagram', `${bride}.instagram`, { placeholder: '@handle' })}
                ${imageField('Photo', `${bride}.photo`, { full: true })}
                ${textField('Child order', `${bride}.childOrder`, { full: true, placeholder: 'The first daughter of' })}
                ${textField('Father', `${bride}.father`)}
                ${textField('Mother', `${bride}.mother`)}
                ${areaField('Short bio', `${bride}.bio`, { full: true })}
            </div>
        </section>

        <section class="sas-card sas-form-section" data-section="couple">
            <div class="sas-card-head">
                <div>
                    <h3 class="sas-card-title">${translated('The groom')}</h3>
                    <p class="sas-card-subtitle">${translated('Names, parents and a short introduction')}</p>
                </div>
            </div>
            <div class="sas-form-grid">
                ${textField('Full name', `${groom}.fullName`)}
                ${textField('Nickname', `${groom}.nickname`)}
                ${textField('Role label', `${groom}.role`, { placeholder: 'The Groom' })}
                ${textField('Instagram', `${groom}.instagram`, { placeholder: '@handle' })}
                ${imageField('Photo', `${groom}.photo`, { full: true })}
                ${textField('Child order', `${groom}.childOrder`, { full: true, placeholder: 'The second son of' })}
                ${textField('Father', `${groom}.father`)}
                ${textField('Mother', `${groom}.mother`)}
                ${areaField('Short bio', `${groom}.bio`, { full: true })}
            </div>
        </section>`;
};

const rsvpSection = () => `
    <section class="sas-card sas-form-section" data-section="rsvp">
        <div class="sas-card-head">
            <div>
                <h3 class="sas-card-title">${translated('RSVP')}</h3>
                <p class="sas-card-subtitle">${translated('Let guests confirm attendance before the big day')}</p>
            </div>
        </div>
        <div class="sas-form-grid">
            ${toggleField('Allow RSVP responses', 'rsvp.enabled', 'Guests can confirm or decline from the invitation page.')}
            ${textField('Reply deadline', 'rsvp.deadline', { type: 'date' })}
            ${textField('Maximum seats per party', 'rsvp.maxSeats', { type: 'number', min: 1, max: 12 })}
            ${textField('Heading', 'rsvp.title', { full: true, placeholder: 'Will you celebrate with us?' })}
            ${areaField('Helper message', 'rsvp.message', { full: true, rows: 3 })}
        </div>
    </section>

    <section class="sas-card sas-form-section" data-section="rsvp">
        <div class="sas-card-head">
            <div>
                <h3 class="sas-card-title">${translated('Dress code')}</h3>
                <p class="sas-card-subtitle">${translated('A palette guests can match to your celebration')}</p>
            </div>
        </div>
        <div class="sas-form-grid">
            ${textField('Title', 'dressCode.title', { full: true, placeholder: 'Garden Formal' })}
            ${areaField('Guidance', 'dressCode.text', { full: true, rows: 2 })}
        </div>
        <div class="sas-swatches" style="margin-top:0.5rem">
            ${[0, 1, 2, 3].map((index) => colorField(t('Colour {number}', { number: index + 1 }), `dressCode.colors.${index}`)).join('')}
        </div>
    </section>

    <section class="sas-card sas-form-section" data-section="rsvp">
        <div class="sas-card-head">
            <div>
                <h3 class="sas-card-title">${translated('Closing note')}</h3>
                <p class="sas-card-subtitle">${translated('The final message before your footer')}</p>
            </div>
        </div>
        <div class="sas-form-grid">
            ${areaField('Message', 'closing.text', { full: true, rows: 3 })}
            ${textField('Signature', 'closing.signature', { full: true, placeholder: 'With love, Rashel & Adrian' })}
        </div>
    </section>`;

const metaSection = () => `
    <section class="sas-card sas-form-section" data-section="design">
        <div class="sas-card-head">
            <div>
                <h3 class="sas-card-title">${translated('Page metadata')}</h3>
                <p class="sas-card-subtitle">${translated('Used in browser tabs, search results and shared links')}</p>
            </div>
        </div>
        <div class="sas-form-grid">
            ${textField('Page title', 'meta.title', { full: true })}
            ${areaField('Description', 'meta.description', { full: true, rows: 3 })}
            ${textField('Hashtag', 'meta.hashtag', { placeholder: '#RashelAndAdrian' })}
            ${imageField('Social share image', 'meta.coverImage', { full: true })}
        </div>
    </section>

    <section class="sas-card sas-form-section" data-section="design">
        <div class="sas-card-head">
            <div>
                <h3 class="sas-card-title">${translated('Background music')}</h3>
                <p class="sas-card-subtitle">${translated('Played softly when the guest opens the invitation')}</p>
            </div>
        </div>
        <div class="sas-form-grid">
            ${toggleField('Enable music', 'meta.music.enabled', 'Guests can always mute the player.')}
            ${textField('Track title', 'meta.music.title', { full: true, placeholder: 'Pure Love' })}
            ${textField('Audio file URL', 'meta.music.url', { full: true, placeholder: './assets/music/pure-love-304010.mp3' })}
        </div>
    </section>`;

const sectionGroups = () => ({
    couple: coupleSection(),
    story: storySection(),
    events: eventsSection(),
    gallery: gallerySection(),
    gifts: giftsSection(),
    rsvp: rsvpSection(),
    design: metaSection(),
});

const panel = () => {
    const groups = sectionGroups();
    return SECTIONS.map((section) => `
        <div data-group="${section.id}" class="${state.active === section.id ? '' : 'sas-hidden'}">
            ${groups[section.id]}
        </div>`).join('');
};

const tabs = () => SECTIONS.map((section) => `
    <button type="button" class="sas-tab ${state.active === section.id ? 'is-active' : ''}" data-tab="${section.id}">
        <i class="fa-solid ${section.icon}"></i> ${translated(section.label)}
    </button>`).join('');

const normalizeDraft = (content) => {
    const draft = clone(content);
    ['story', 'events', 'gallery', 'gifts'].forEach((key) => {
        if (!Array.isArray(draft[key])) {
            draft[key] = [];
        }
    });
    draft.dressCode = draft.dressCode || {};
    if (!Array.isArray(draft.dressCode.colors)) {
        draft.dressCode.colors = ['#b76e79', '#c2a26b', '#e8dcc9', '#2c2530'];
    }
    draft.meta = draft.meta || {};
    draft.meta.music = draft.meta.music || { enabled: false, url: '', title: '' };
    draft.rsvp = draft.rsvp || {};
    draft.hero = draft.hero || {};
    draft.quote = draft.quote || {};
    draft.couple = draft.couple || {};
    draft.couple.bride = draft.couple.bride || {};
    draft.couple.groom = draft.couple.groom || {};
    draft.closing = draft.closing || {};
    return draft;
};

const uid = (prefix) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

const BLANKS = {
    story: () => ({ id: uid('story'), date: '', title: '', text: '' }),
    events: () => ({
        id: uid('evt'), type: 'Ceremony', title: '', date: '', startTime: '', endTime: '', venue: '', address: '', mapUrl: '', note: '',
    }),
    gallery: () => ({ id: uid('gal'), url: '', caption: '' }),
    gifts: () => ({
        id: uid('gift'), type: 'Bank Transfer', provider: '', accountName: '', accountNumber: '', note: '',
    }),
};

const statusText = () => {
    const messages = {
        idle: ['fa-circle-info', 'Changes are saved when you press Save.'],
        dirty: ['fa-pen', 'You have unsaved changes.'],
        saved: ['fa-circle-check', 'All changes saved.'],
    };
    const [icon, message] = messages[state.status];
    return `<i class="fa-solid ${icon}" aria-hidden="true"></i> ${translated(message)}`;
};

const paintStatus = () => {
    const note = document.getElementById('cms-dirty');
    if (note) {
        note.innerHTML = statusText();
    }
};

const setSaveBusy = (busy) => {
    document.querySelectorAll('[data-save]').forEach((button) => setBusy(button, busy));
};

const saveContent = async (ctx) => {
    if (state.saving) {
        return;
    }
    state.saving = true;
    const revision = state.revision;
    setSaveBusy(true);
    try {
        const saved = await api.put('/api/admin/content', { content: state.draft });
        ctx.update({ content: saved.content });
        if (revision === state.revision) {
            state.draft = normalizeDraft(saved.content);
            state.status = 'saved';
        }
        paintStatus();
        toast(t('Invitation content saved.'), 'success');
    } catch (error) {
        toastError(error);
    } finally {
        state.saving = false;
        setSaveBusy(false);
    }
};

const render = (ctx, { preserveDraft = false } = {}) => {
    if (!preserveDraft || !state.draft) {
        state.draft = normalizeDraft(ctx.content);
        state.status = 'idle';
        state.revision += 1;
    }
    return `
        <div class="sas-page-head">
            <div>
                <h2>${translated('Invitation CMS')}</h2>
                <p>${translated('Edit every word, photo and detail your guests will see.')}</p>
            </div>
            <div class="sas-page-actions">
                <a class="sas-btn sas-btn-outline sas-btn-sm" href="/invite.html?lang=${state.editLanguage}" data-preview target="_blank" rel="noopener">
                    <i class="fa-solid fa-arrow-up-right-from-square"></i> ${translated('Preview')}
                </a>
                <button type="button" class="sas-btn sas-btn-outline sas-btn-sm" data-reload>
                    <i class="fa-solid fa-rotate-left"></i> ${translated('Reload')}
                </button>
                <button type="button" class="sas-btn sas-btn-primary sas-btn-sm" data-save>
                    <i class="fa-solid fa-floppy-disk"></i> ${translated('Save changes')}
                </button>
            </div>
        </div>

        <div class="sas-cms">
            <div class="sas-cms-language">
                <div>
                    <label class="sas-label" for="cms-language">${translated('Invitation content language')}</label>
                    <select id="cms-language" class="language-switch" aria-describedby="cms-language-hint">
                        <option value="en" lang="en" ${state.editLanguage === 'en' ? 'selected' : ''}>English</option>
                        <option value="fr" lang="fr" ${state.editLanguage === 'fr' ? 'selected' : ''}>Français</option>
                    </select>
                </div>
                <p id="cms-language-hint" class="sas-hint">${translated('Edit the invitation in both languages. Photos, schedules and other shared details apply to both. If a French translation is missing, guests see the English text.')}</p>
            </div>
            <nav class="sas-tabs" aria-label="${translated('CMS sections')}">${tabs()}</nav>
            <div id="cms-panel">${panel()}</div>
        </div>

        <div class="sas-savebar">
            <p id="cms-dirty" role="status">${statusText()}</p>
            <div class="d-flex gap-2">
                <button type="button" class="sas-btn sas-btn-outline sas-btn-sm" data-reload>
                    <i class="fa-solid fa-rotate-left"></i> ${translated('Reset')}
                </button>
                <button type="button" class="sas-btn sas-btn-primary sas-btn-sm" data-save>
                    <i class="fa-solid fa-floppy-disk"></i> ${translated('Save changes')}
                </button>
            </div>
        </div>`;
};

const mount = (ctx, root) => {
    const panelElement = root.querySelector('#cms-panel');
    if (state.saving) {
        setSaveBusy(true);
    }

    const paint = () => {
        const scroll = window.scrollY;
        panelElement.innerHTML = panel();
        root.querySelectorAll('[data-tab]').forEach((tab) => {
            tab.classList.toggle('is-active', tab.dataset.tab === state.active);
        });
        window.scrollTo({ top: scroll });
    };

    const markDirty = () => {
        state.status = 'dirty';
        state.revision += 1;
        paintStatus();
    };

    root.addEventListener('click', async (event) => {
        const tab = event.target.closest('[data-tab]');
        if (tab) {
            state.active = tab.dataset.tab;
            root.querySelectorAll('[data-tab]').forEach((item) => {
                item.classList.toggle('is-active', item.dataset.tab === state.active);
            });
            root.querySelectorAll('[data-group]').forEach((group) => {
                group.classList.toggle('sas-hidden', group.dataset.group !== state.active);
            });
            return;
        }

        const add = event.target.closest('[data-add]');
        if (add) {
            const key = add.dataset.add;
            if (key === 'dressCode.colors') {
                state.draft.dressCode.colors.push('#e8dcc9');
            } else if (BLANKS[key]) {
                listOf(key).push(BLANKS[key]());
            }
            markDirty();
            paint();
            return;
        }

        const remove = event.target.closest('[data-remove]');
        if (remove) {
            const key = remove.dataset.remove;
            const index = Number(remove.dataset.index);
            if (key === 'dressCode.colors') {
                state.draft.dressCode.colors.splice(index, 1);
            } else if (Array.isArray(state.draft[key])) {
                state.draft[key].splice(index, 1);
            }
            markDirty();
            paint();
            return;
        }

        if (event.target.closest('[data-save]')) {
            await saveContent(ctx);
            return;
        }

        if (event.target.closest('[data-reload]')) {
            state.draft = normalizeDraft(ctx.content);
            state.status = 'idle';
            state.revision += 1;
            paint();
            paintStatus();
        }
    });

    root.addEventListener('input', (event) => {
        const fieldEl = event.target.closest('[data-path]');
        if (!fieldEl || fieldEl.type === 'file') {
            return;
        }

        const path = fieldEl.dataset.path;
        if (fieldEl.type === 'checkbox') {
            setPath(state.draft, path, fieldEl.checked);
        } else if (fieldEl.type === 'number') {
            setPath(state.draft, path, Number(fieldEl.value) || 0);
        } else {
            setPath(state.draft, path, fieldEl.value);
        }

        const media = fieldEl.closest('.sas-media');
        if (media && media.querySelector('img')) {
            media.querySelector('img').src = fieldEl.value || '/assets/images/placeholder.webp';
        }

        markDirty();
    });

    root.addEventListener('change', async (event) => {
        if (event.target.id === 'cms-language') {
            state.editLanguage = event.target.value;
            root.querySelector('[data-preview]').href = `/invite.html?lang=${state.editLanguage}`;
            paint();
            return;
        }

        const upload = event.target.closest('[data-upload]');
        if (!upload || !upload.files || !upload.files[0]) {
            return;
        }

        const file = upload.files[0];
        const path = upload.dataset.upload;
        try {
            toast(t('Uploading image...'), 'info');
            const dataUrl = await fileToDataUrl(file);
            const result = await api.post('/api/admin/media', { name: file.name, dataUrl });
            setPath(state.draft, path, result.file.url);

            const media = upload.closest('.sas-media');
            if (media) {
                const input = media.querySelector('[data-path]');
                const preview = media.querySelector('img');
                if (input) {
                    input.value = result.file.url;
                }
                if (preview) {
                    preview.src = result.file.url;
                }
            }
            markDirty();
            toast(t('Image uploaded. Remember to save.'), 'success');
        } catch (error) {
            toastError(error);
        } finally {
            upload.value = '';
        }
    });
};

export default {
    title: 'Invitation CMS',
    subtitle: 'Content, photos and details for your invitation',
    render,
    mount,
};




