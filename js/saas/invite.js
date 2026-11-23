import { copyText, esc } from './ui.js';
import { addTranslations, getLanguage, initLanguage, t } from './i18n.js';
import { invitationTranslations } from './invite-translations.js';

addTranslations(invitationTranslations);

const root = document.getElementById('invite-root');
const params = new URLSearchParams(window.location.search);
const guestCode = (params.get('code') || '').trim();
const fallbackName = (params.get('to') || '').trim();

let music = null;
let countdownTimer = 0;
let revealObserver = null;
let invitationRequest = null;

const stateData = {
    opened: false,
    rsvpDraft: null,
    rsvpPending: false,
    rsvpError: '',
    rsvpResult: null,
};

const text = (key, values) => esc(t(key, values));
const locale = () => getLanguage() === 'fr' ? 'fr-FR' : 'en-GB';

const fmtDate = (value, options = { day: 'numeric', month: 'long', year: 'numeric' }) => {
    if (!value) {
        return '';
    }
    const date = new Date(String(value).length <= 10 ? `${value}T00:00:00` : value);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    return new Intl.DateTimeFormat(locale(), options).format(date);
};

const fmtTime = (time) => {
    const date = new Date(`2000-01-01T${time}:00Z`);
    return Number.isNaN(date.getTime()) ? time : new Intl.DateTimeFormat(locale(), {
        hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
    }).format(date);
};

const initialsOf = (name) => String(name || '')
    .split('&')
    .map((part) => part.trim().charAt(0))
    .join(' & ');

const applyTheme = (theme = {}) => {
    const map = {
        primary: '--inv-primary',
        accent: '--inv-accent',
        ink: '--inv-ink',
        surface: '--inv-surface',
    };
    Object.entries(map).forEach(([key, variable]) => {
        if (theme[key]) {
            document.documentElement.style.setProperty(variable, theme[key]);
        }
    });
};

const calendarLink = (event, headline) => {
    if (!event || !event.date) {
        return '';
    }
    const start = `${event.date.replace(/-/g, '')}T${(event.startTime || '09:00').replace(':', '')}00`;
    const end = `${event.date.replace(/-/g, '')}T${(event.endTime || '10:00').replace(':', '')}00`;
    const title = encodeURIComponent(`${headline || t('Our wedding')} - ${event.title || t('Event')}`);
    const location = encodeURIComponent(`${event.venue}, ${event.address}`);
    const details = encodeURIComponent(t('We would love to celebrate with you.'));
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&location=${location}&details=${details}&hl=${getLanguage()}`;
};

const coverMarkup = (content, greeting) => {
    const hero = content.hero || {};
    const names = String(hero.headline || '').split('&');
    const coupleFirst = names.length > 1 ? names[0].trim() : (hero.headline || '');
    const coupleSecond = names.length > 1 ? names[1].trim() : '';
    const cover = (content.meta && content.meta.coverImage) || '/assets/images/sas/cover.svg';

    return `
        <header class="invite-cover${stateData.opened ? ' is-hidden' : ''}" id="invite-cover" style="--inv-cover:url('${esc(cover)}')" ${stateData.opened ? 'inert' : ''}>
            <div class="invite-cover-frame" aria-hidden="true"></div>
            <span class="invite-monogram">${esc(coupleSecond ? initialsOf(`${coupleFirst}&${coupleSecond}`) : coupleFirst.charAt(0))}</span>
            <p class="invite-eyebrow">${esc(hero.eyebrow || t('The Wedding Of'))}</p>
            <h1>${coupleSecond ? `${esc(coupleFirst)} <span class="invite-amp-cover">&amp;</span> ${esc(coupleSecond)}` : esc(hero.headline || '')}</h1>
            <p class="invite-cover-meta">
                <span class="invite-cover-date">${esc(hero.dateLabel || '')}</span>
                <span class="invite-cover-dot" aria-hidden="true"></span>
                <span class="invite-cover-place">${esc(hero.location || '')}</span>
            </p>
            <div class="invite-greeting">
                <p>${text('Dear')}</p>
                <strong>${esc(greeting || t('Our dear guest'))}</strong>
            </div>
            <button type="button" class="invite-open" id="invite-open">
                <i class="fa-solid fa-envelope-open-text"></i> ${text('Open invitation')}
            </button>
            <p class="invite-cover-note">${esc(content.meta && content.meta.hashtag ? content.meta.hashtag : '')}</p>
        </header>`;
};

const quoteMarkup = (content) => {
    if (!content.quote || !content.quote.text) {
        return '';
    }
    return `
        <section class="invite-quote invite-reveal">
            <blockquote>${text('“{quote}”', { quote: content.quote.text })}</blockquote>
            ${content.quote.source ? `<cite>${esc(content.quote.source)}</cite>` : ''}
        </section>`;
};

const personMarkup = (data) => `
    <div class="invite-person">
        ${data.photo ? `<img src="${esc(data.photo)}" alt="${esc(data.fullName || data.nickname || '')}">` : ''}
        <h3>${esc(data.fullName || data.nickname || '')}</h3>
        ${data.role ? `<p class="invite-role">${esc(data.role)}</p>` : ''}
        ${data.childOrder ? `<p>${esc(data.childOrder)}</p>` : ''}
        ${data.father ? `<p>${esc(data.father)}</p>` : ''}
        ${data.mother ? `<p>${text('and {name}', { name: data.mother })}</p>` : ''}
        ${data.bio ? `<p style="margin-top:0.75rem">${esc(data.bio)}</p>` : ''}
        ${data.instagram ? `<a class="invite-social" href="https://instagram.com/${esc(data.instagram.replace('@', ''))}" target="_blank" rel="noopener"><i class="fa-brands fa-instagram"></i> ${esc(data.instagram)}</a>` : ''}
    </div>`;

const coupleMarkup = (content) => {
    const bride = (content.couple && content.couple.bride) || {};
    const groom = (content.couple && content.couple.groom) || {};
    return `
        <section class="invite-section invite-section-alt invite-reveal" id="couple">
            <div class="invite-inner">
                <p class="invite-eyebrow">${text('The happy couple')}</p>
                <h2 class="invite-section-title">${text('Two hearts, one celebration')}</h2>
                <div class="invite-couple">
                    ${personMarkup(bride)}
                    <span class="invite-amp">&amp;</span>
                    ${personMarkup(groom)}
                </div>
                <div class="invite-ornament"><i class="fa-solid fa-heart"></i></div>
            </div>
        </section>`;
};

const countdownMarkup = (content) => {
    const events = Array.isArray(content.events) ? content.events : [];
    if (!events.length) {
        return '';
    }
    return `
        <section class="invite-section invite-reveal" id="countdown">
            <div class="invite-inner">
                <p class="invite-eyebrow">${text('Save the date')}</p>
                <h2 class="invite-section-title">${text('Counting down the days')}</h2>
                <p class="invite-text">${esc(events[0].date ? fmtDate(events[0].date) : '')}${events[0].venue ? ` &middot; ${esc(events[0].venue)}` : ''}</p>
                <div class="invite-countdown" id="invite-countdown" data-date="${esc(events[0].date || '')}T${esc(events[0].startTime || '09:00')}:00">
                    <div><strong data-unit="days">--</strong><span>${text('Days')}</span></div>
                    <div><strong data-unit="hours">--</strong><span>${text('Hours')}</span></div>
                    <div><strong data-unit="minutes">--</strong><span>${text('Minutes')}</span></div>
                    <div><strong data-unit="seconds">--</strong><span>${text('Seconds')}</span></div>
                </div>
                <p style="margin-top:1.5rem">
                    <a class="invite-map" href="${esc(calendarLink(events[0], content.hero?.headline))}" target="_blank" rel="noopener">
                        <i class="fa-solid fa-calendar-plus"></i> ${text('Add to Google Calendar')}
                    </a>
                </p>
            </div>
        </section>`;
};

const eventsMarkup = (content) => {
    const events = Array.isArray(content.events) ? content.events : [];
    if (!events.length) {
        return '';
    }
    return `
        <section class="invite-section invite-section-alt invite-reveal" id="events">
            <div class="invite-inner">
                <p class="invite-eyebrow">${text('When & where')}</p>
                <h2 class="invite-section-title">${text('The celebration')}</h2>
                <div class="invite-events">
                    ${events.map((event) => `
                        <article class="invite-event">
                            <p class="invite-event-type">${esc(event.type || t('Event'))}</p>
                            <h4>${esc(event.title || '')}</h4>
                            <p class="invite-event-when">
                                <i class="fa-solid fa-clock"></i>
                                ${esc(fmtDate(event.date))}${event.startTime ? ` &middot; ${esc(fmtTime(event.startTime))}` : ''}${event.endTime ? ` - ${esc(fmtTime(event.endTime))}` : ''}
                            </p>
                            ${event.venue ? `<p><strong>${esc(event.venue)}</strong></p>` : ''}
                            ${event.address ? `<p>${esc(event.address)}</p>` : ''}
                            ${event.note ? `<p class="invite-event-note">${esc(event.note)}</p>` : ''}
                            ${event.mapUrl ? `<a class="invite-map" href="${esc(event.mapUrl)}" target="_blank" rel="noopener"><i class="fa-solid fa-location-dot"></i> ${text('Open map')}</a>` : ''}
                        </article>`).join('')}
                </div>
            </div>
        </section>`;
};

const storyMarkup = (content) => {
    const story = Array.isArray(content.story) ? content.story : [];
    if (!story.length) {
        return '';
    }
    return `
        <section class="invite-section invite-reveal" id="story">
            <div class="invite-inner">
                <p class="invite-eyebrow">${text('Our journey')}</p>
                <h2 class="invite-section-title">${text('How we got here')}</h2>
                <div class="invite-story">
                    ${story.map((item) => `
                        <article class="invite-story-item">
                            <span class="invite-story-date">${esc(item.date || '')}</span>
                            <h4>${esc(item.title || '')}</h4>
                            <p>${esc(item.text || '')}</p>
                        </article>`).join('')}
                </div>
            </div>
        </section>`;
};

const galleryMarkup = (content) => {
    const gallery = Array.isArray(content.gallery) ? content.gallery : [];
    if (!gallery.length) {
        return '';
    }
    return `
        <section class="invite-section invite-section-alt invite-reveal" id="gallery">
            <div class="invite-inner">
                <p class="invite-eyebrow">${text('Moments')}</p>
                <h2 class="invite-section-title">${text('Our gallery')}</h2>
                <div class="invite-gallery">
                    ${gallery.map((photo) => `
                        <button type="button" data-lightbox="${esc(photo.url)}" aria-label="${esc(photo.caption || t('Open photo'))}">
                            <img src="${esc(photo.url)}" alt="${esc(photo.caption || t('Wedding photo'))}" loading="lazy">
                        </button>`).join('')}
                </div>
            </div>
        </section>`;
};

const dressMarkup = (content) => {
    const dress = content.dressCode || {};
    if (!dress.title && !dress.text) {
        return '';
    }
    return `
        <section class="invite-section invite-reveal" id="dress-code">
            <div class="invite-inner">
                <p class="invite-eyebrow">${text('Dress code')}</p>
                <h2 class="invite-section-title">${esc(dress.title || t('What to wear'))}</h2>
                <p class="invite-text">${esc(dress.text || '')}</p>
                ${Array.isArray(dress.colors) && dress.colors.length
        ? `<div class="invite-dress">${dress.colors.map((color) => `<span style="--swatch:${esc(color)}"></span>`).join('')}</div>`
        : ''}
            </div>
        </section>`;
};

const giftsMarkup = (content) => {
    const gifts = Array.isArray(content.gifts) ? content.gifts : [];
    if (!gifts.length) {
        return '';
    }
    return `
        <section class="invite-section invite-section-alt invite-reveal" id="gifts">
            <div class="invite-inner">
                <p class="invite-eyebrow">${text('With gratitude')}</p>
                <h2 class="invite-section-title">${text('Wedding gifts')}</h2>
                <p class="invite-text">${text('Your presence is the greatest gift. If you would like to send something more, here is how.')}</p>
                <div class="invite-gifts">
                    ${gifts.map((gift) => `
                        <article class="invite-gift">
                            <p class="invite-gift-type">${esc(gift.type || t('Gift'))}</p>
                            <h4>${esc(gift.provider || '')}</h4>
                            <p class="invite-gift-account">${esc(gift.accountName || '')}</p>
                            ${gift.accountNumber ? `
                                <div class="invite-gift-number">
                                    <span>${esc(gift.accountNumber)}</span>
                                    <button type="button" class="invite-copy" data-copy="${esc(gift.accountNumber)}">${text('Copy')}</button>
                                </div>` : ''}
                            ${gift.note ? `<p class="invite-gift-note">${esc(gift.note)}</p>` : ''}
                        </article>`).join('')}
                </div>
            </div>
        </section>`;
};

const passMarkup = (guest) => {
    if (!guest) {
        return '';
    }
    return `
        <section class="invite-section invite-reveal" id="pass">
            <div class="invite-inner">
                <p class="invite-eyebrow">${text('Your entrance pass')}</p>
                <h2 class="invite-section-title">${text('Your QR invitation')}</h2>
                <div class="invite-pass">
                    <img src="/api/public/pass/${encodeURIComponent(guest.code)}?format=png" alt="${text('QR pass for {name}', { name: guest.name })}" loading="lazy">
                    <div>
                        <h4>${esc(guest.name)}</h4>
                        <p>${text('Pass code')} <code>${esc(guest.code)}</code></p>
                        <p>${text('Reserved seats: {seats}', { seats: guest.seats })}</p>
                        ${guest.checkedInAt
        ? `<span class="invite-badge"><i class="fa-solid fa-check"></i> ${text('Checked in - welcome!')}</span>`
        : `<p>${text('Please show this QR code at the entrance so we can welcome you quickly.')}</p>`}
                        <p style="margin-top:0.75rem">
                            <a class="invite-map" href="/api/public/pass/${encodeURIComponent(guest.code)}?format=png" download="${esc(guest.code)}.png">
                                <i class="fa-solid fa-download"></i> ${text('Download pass')}
                            </a>
                        </p>
                    </div>
                </div>
            </div>
        </section>`;
};

const rsvpMarkup = (content, guest) => {
    const config = content.rsvp || {};
    if (config.enabled === false) {
        return '';
    }

    const maxSeats = Math.max(Number(config.maxSeats) || 6, 1);
    const draft = stateData.rsvpDraft;
    const seats = draft?.seats ?? (guest ? (guest.rsvpSeats || guest.seats || 1) : 1);
    const status = guest?.rsvpStatus || 'pending';
    const attendance = draft?.attendance ?? status;
    const message = draft?.message ?? guest?.message ?? '';
    const name = draft?.name ?? fallbackName;

    return `
        <section class="invite-section invite-reveal" id="rsvp">
            <div class="invite-inner">
                <p class="invite-eyebrow">${text('RSVP')}</p>
                <h2 class="invite-section-title">${esc(config.title || t('Will you celebrate with us?'))}</h2>
                <p class="invite-text">${esc(config.message || '')}</p>
                ${config.deadline ? `<p class="invite-text" style="font-size:0.78rem;margin-top:0.5rem">${text('Kindly reply before {date}.', { date: fmtDate(config.deadline) })}</p>` : ''}

                <div class="invite-rsvp" id="rsvp-card">
                    ${status !== 'pending' ? `<p class="invite-rsvp-msg is-success">${text(status === 'attending' ? 'You confirmed your attendance. You can update your answer below.' : 'You declined the invitation. You can update your answer below.')}</p>` : ''}
                    <form id="rsvp-form" novalidate>
                        ${guest
        ? `<p class="invite-rsvp-note" style="margin-top:0">${t('Replying as {name}.', { name: `<strong>${esc(guest.name)}</strong>` })}</p>`
        : `<div class="invite-field">
                                <label for="rsvp-name">${text('Your name')}</label>
                                <input id="rsvp-name" name="name" value="${esc(name)}" placeholder="${text('Your full name')}" required>
                            </div>`}

                        <div class="invite-choice">
                            <label>
                                <input type="radio" name="attendance" value="attending" ${attendance === 'attending' ? 'checked' : ''} required>
                                <i class="fa-solid fa-heart"></i> <span>${text('Joyfully attending')}</span>
                            </label>
                            <label>
                                <input type="radio" name="attendance" value="declined" ${attendance === 'declined' ? 'checked' : ''}>
                                <i class="fa-solid fa-heart-crack"></i> <span>${text('Cannot attend')}</span>
                            </label>
                        </div>

                        <div class="invite-field">
                            <label for="rsvp-seats">${text('Number of seats')}</label>
                            <select id="rsvp-seats" name="seats">
                                ${Array.from({ length: maxSeats }, (item, index) => index + 1)
        .map((count) => `<option value="${count}" ${count === seats ? 'selected' : ''}>${text(count === 1 ? '{count} seat' : '{count} seats', { count })}</option>`)
        .join('')}
                            </select>
                        </div>

                        <div class="invite-field">
                            <label for="rsvp-message">${text('A note for the couple')} <span class="sas-muted">${text('(optional)')}</span></label>
                            <textarea id="rsvp-message" name="message" maxlength="500" placeholder="${text('Send your wishes...')}">\n${esc(message)}</textarea>
                        </div>

                        <div id="rsvp-feedback" role="status"></div>

                        <button type="submit" class="invite-submit" id="rsvp-submit">
                            <i class="fa-solid fa-paper-plane"></i> ${text('Send RSVP')}
                        </button>
                    </form>
                </div>
            </div>
        </section>`;
};

const closingMarkup = (content, brandName) => {
    const closing = content.closing || {};
    return `
        <footer class="invite-closing invite-reveal">
            <div class="invite-inner">
                <p class="invite-eyebrow">${text('With love')}</p>
                <h2>${esc(content.hero?.headline || t('Thank you'))}</h2>
                <p>${esc(closing.text || '')}</p>
                <p class="invite-signature">${esc(closing.signature || '')}</p>
                ${content.meta && content.meta.hashtag ? `<span class="invite-hashtag">${esc(content.meta.hashtag)}</span>` : ''}
            </div>
        </footer>
        <div class="invite-footer">
            <p style="margin:0">${t('Made with love by {brand}', { brand: `<strong>${esc(brandName || 'SAS Wedding Studio')}</strong>` })}</p>
        </div>`;
};

const pageMarkup = (data) => {
    const content = data.content || {};
    const guest = data.guest;
    const greeting = data.greeting || (guest ? guest.name : '');

    return `
        ${coverMarkup(content, greeting)}
        <main class="invite-main${stateData.opened ? ' is-open' : ''}" id="invite-main" ${stateData.opened ? '' : 'inert'}>
            ${data.invalidCode ? `<div class="invite-section" style="padding:2rem 1.5rem 0"><div class="invite-inner"><p class="invite-rsvp-msg is-error">${text('We could not find that invitation code, but you are still warmly welcome. Please reply below so we can reserve your seat.')}</p></div></div>` : ''}
            ${quoteMarkup(content)}
            ${coupleMarkup(content)}
            ${countdownMarkup(content)}
            ${eventsMarkup(content)}
            ${storyMarkup(content)}
            ${galleryMarkup(content)}
            ${dressMarkup(content)}
            ${giftsMarkup(content)}
            ${rsvpMarkup(content, guest)}
            ${passMarkup(guest)}
            ${closingMarkup(content, data.brandName)}
        </main>

        <div class="invite-lightbox" id="invite-lightbox" role="dialog" aria-modal="true" aria-label="${text('Gallery photo')}">
            <button type="button" id="lightbox-close" aria-label="${text('Close photo')}"><i class="fa-solid fa-xmark"></i></button>
            <img alt="${text('Gallery photo')}">
        </div>

        ${content.meta && content.meta.music && content.meta.music.enabled && content.meta.music.url
        ? `<button type="button" class="invite-music" id="invite-music" aria-label="${text('Toggle music')}" aria-pressed="false"><i class="fa-solid fa-compact-disc"></i></button>`
        : ''}`;
};

const startCountdown = () => {
    const countdown = document.getElementById('invite-countdown');
    if (!countdown) {
        return;
    }

    const target = new Date(countdown.dataset.date);
    if (Number.isNaN(target.getTime())) {
        countdown.style.display = 'none';
        return;
    }

    const units = {
        days: countdown.querySelector('[data-unit="days"]'),
        hours: countdown.querySelector('[data-unit="hours"]'),
        minutes: countdown.querySelector('[data-unit="minutes"]'),
        seconds: countdown.querySelector('[data-unit="seconds"]'),
    };

    const tick = () => {
        const diff = target.getTime() - Date.now();
        const days = Math.max(Math.floor(diff / 86400000), 0);
        const hours = Math.max(Math.floor((diff % 86400000) / 3600000), 0);
        const minutes = Math.max(Math.floor((diff % 3600000) / 60000), 0);
        const seconds = Math.max(Math.floor((diff % 60000) / 1000), 0);

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

    window.clearInterval(countdownTimer);
    countdownTimer = window.setInterval(tick, 1000);
    tick();
};

const updateMusicButton = () => {
    const button = document.getElementById('invite-music');
    const playing = Boolean(music && !music.paused);
    if (button) {
        button.classList.toggle('is-playing', playing);
        button.setAttribute('aria-pressed', String(playing));
    }
};

const toggleMusic = (forceOn) => {
    if (!music) {
        return;
    }

    const shouldPlay = forceOn !== undefined ? forceOn : music.paused;
    if (shouldPlay) {
        music.play().catch(() => {
            /* autoplay can be blocked until the guest interacts with the page */
        });
    } else {
        music.pause();
    }
};

const saveRsvpDraft = (form = document.getElementById('rsvp-form')) => {
    if (!form) {
        return;
    }
    const fields = new FormData(form);
    stateData.rsvpDraft = {
        name: fields.get('name'),
        attendance: fields.get('attendance') || '',
        seats: Number(fields.get('seats')) || 1,
        message: fields.get('message'),
    };
};

const rsvpErrors = {
    unpublished: 'This invitation is not available yet.',
    rsvp_disabled: 'RSVP is currently closed for this invitation.',
    rsvp_closed: 'The RSVP period has closed. Please contact the couple directly.',
    invalid_attendance: 'Please choose whether you will attend.',
    guest_not_found: 'We could not find that invitation code.',
    invalid_name: 'Please tell us your name.',
};

const paintRsvpStatus = () => {
    const card = document.getElementById('rsvp-card');
    if (!card) {
        return;
    }

    const result = stateData.rsvpResult;
    if (result) {
        const reply = result.attendance === 'attending'
            ? 'Thank you, {name}! We cannot wait to celebrate with you.'
            : 'Thank you for letting us know, {name}. You will be missed.';
        card.innerHTML = `
            <div role="status">
                <p class="invite-rsvp-msg is-success" style="margin:0">
                    <strong>${text(reply, { name: result.name })}</strong>
                </p>
                <p class="invite-rsvp-note" style="margin-top:0.75rem">${text('Your answer has been saved. You may close this page.')}</p>
            </div>`;
        return;
    }

    const feedback = document.getElementById('rsvp-feedback');
    const submit = document.getElementById('rsvp-submit');
    feedback.innerHTML = stateData.rsvpError
        ? `<p class="invite-rsvp-msg is-error">${text(stateData.rsvpError)}</p>` : '';
    submit.disabled = stateData.rsvpPending;
    submit.innerHTML = stateData.rsvpPending
        ? `<span class="sas-spinner"></span> ${text('Sending')}`
        : `<i class="fa-solid fa-paper-plane"></i> ${text('Send RSVP')}`;
};

const sendRsvp = async (event, guest) => {
    event.preventDefault();
    if (stateData.rsvpPending) {
        return;
    }

    const form = event.currentTarget;
    saveRsvpDraft(form);
    const draft = stateData.rsvpDraft;
    const name = guest?.name || draft.name.trim();
    if (!name) {
        stateData.rsvpError = 'Please tell us your name.';
        form.elements.name.focus();
        paintRsvpStatus();
        return;
    }
    if (!draft.attendance) {
        stateData.rsvpError = 'Please choose whether you will attend.';
        form.querySelector('[name="attendance"]').focus();
        paintRsvpStatus();
        return;
    }

    stateData.rsvpPending = true;
    stateData.rsvpError = '';
    paintRsvpStatus();

    try {
        const response = await fetch('/api/public/rsvp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
                code: guest?.code,
                name,
                attendance: draft.attendance,
                seats: draft.seats,
                message: draft.message.trim(),
            }),
        });
        const result = await response.json();
        if (response.ok) {
            stateData.rsvpResult = result;
        } else {
            const errorCode = result?.error?.code;
            stateData.rsvpError = Object.hasOwn(rsvpErrors, errorCode)
                ? rsvpErrors[errorCode]
                : 'Your RSVP could not be saved.';
        }
    } catch {
        stateData.rsvpError = 'Your RSVP could not be saved.';
    } finally {
        stateData.rsvpPending = false;
        paintRsvpStatus();
    }
};

const bind = (data) => {
    const content = data.content || {};
    const guest = data.guest;
    const cover = document.getElementById('invite-cover');
    const main = document.getElementById('invite-main');
    const openButton = document.getElementById('invite-open');

    const openInvitation = () => {
        stateData.opened = true;
        cover.classList.add('is-hidden');
        cover.inert = true;
        main.classList.add('is-open');
        main.inert = false;
        document.body.style.overflow = '';
        window.scrollTo({ top: 0 });
        toggleMusic(true);
        startCountdown();
    };

    document.body.style.overflow = stateData.opened ? '' : 'hidden';
    openButton.addEventListener('click', openInvitation);
    if (stateData.opened) {
        startCountdown();
    }

    const musicButton = document.getElementById('invite-music');
    if (musicButton) {
        const url = new URL(content.meta.music.url, document.baseURI).href;
        if (music?.src !== url) {
            music?.pause();
            music = new Audio(url);
            music.loop = true;
            music.volume = 0.45;
            music.addEventListener('play', updateMusicButton);
            music.addEventListener('pause', updateMusicButton);
        }
        updateMusicButton();
        musicButton.addEventListener('click', () => toggleMusic());
    } else {
        music?.pause();
        music = null;
    }

    const lightbox = document.getElementById('invite-lightbox');
    const image = lightbox.querySelector('img');
    const closeButton = document.getElementById('lightbox-close');
    let selectedPhoto;
    const closeLightbox = () => {
        lightbox.classList.remove('is-open');
        selectedPhoto?.focus();
    };

    root.querySelectorAll('[data-lightbox]').forEach((button) => {
        button.addEventListener('click', () => {
            selectedPhoto = button;
            image.src = button.dataset.lightbox;
            image.alt = button.querySelector('img').alt;
            lightbox.classList.add('is-open');
            closeButton.focus();
        });
    });

    lightbox.addEventListener('click', (event) => {
        if (event.target === lightbox) {
            closeLightbox();
        }
    });
    closeButton.addEventListener('click', closeLightbox);

    root.querySelectorAll('[data-copy]').forEach((button) => {
        button.addEventListener('click', async () => {
            const ok = await copyText(button.dataset.copy);
            button.textContent = t(ok ? 'Copied' : 'Copy failed');
            window.setTimeout(() => {
                button.textContent = t('Copy');
            }, 1800);
        });
    });

    const form = document.getElementById('rsvp-form');
    if (form) {
        form.addEventListener('submit', (event) => sendRsvp(event, guest));
        paintRsvpStatus();
    }

    if ('IntersectionObserver' in window) {
        revealObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12 });

        root.querySelectorAll('.invite-reveal').forEach((element) => revealObserver.observe(element));
    } else {
        root.querySelectorAll('.invite-reveal').forEach((element) => element.classList.add('is-visible'));
    }
};

const stateScreen = (brand, title, message) => `
    <div class="invite-state">
        <img src="/assets/images/sas/cover.svg" alt="">
        <p class="invite-eyebrow">${esc(brand || 'SAS Wedding Studio')}</p>
        <h1>${text(title)}</h1>
        <p>${text(message)}</p>
    </div>`;

const applyMetadata = (content) => {
    const title = content.meta?.title || content.hero?.headline;
    document.title = title || t('Wedding invitation | SAS Wedding Studio');

    [
        ['meta[property="og:title"]', title],
        ['meta[name="description"]', content.meta?.description],
        ['meta[property="og:description"]', content.meta?.description],
    ].forEach(([selector, value]) => {
        const element = document.querySelector(selector);
        element.content = value || t(element.dataset.i18nContent);
    });
};

const renderInvitation = (data, error) => {
    const scrollY = window.scrollY;
    saveRsvpDraft();
    revealObserver?.disconnect();
    window.clearInterval(countdownTimer);
    if (!data?.published) {
        music?.pause();
        document.body.style.overflow = '';
        root.innerHTML = error
            ? stateScreen(data?.brandName, 'We could not open this invitation', error)
            : stateScreen(
                data?.brandName,
                'The invitation is not live yet',
                'Our celebration page is being prepared. Please check back soon - we cannot wait to share it with you.',
            );
        return;
    }

    applyTheme(data.theme);
    applyMetadata(data.content || {});
    root.innerHTML = pageMarkup(data);
    bind(data);
    if (stateData.opened) {
        window.scrollTo({ top: scrollY, behavior: 'instant' });
    }
};

const refreshInvitation = async () => {
    invitationRequest?.abort();
    const request = new AbortController();
    invitationRequest = request;
    root.setAttribute('aria-busy', 'true');

    const search = new URLSearchParams({ lang: getLanguage() });
    if (guestCode) {
        search.set('code', guestCode);
    }
    if (fallbackName) {
        search.set('to', fallbackName);
    }

    try {
        const response = await fetch(`/api/public/invitation?${search}`, {
            headers: { Accept: 'application/json' },
            signal: request.signal,
        });
        const data = response.ok ? await response.json() : null;
        if (!request.signal.aborted) {
            renderInvitation(data, response.ok ? '' : 'The invitation could not be loaded right now.');
        }
    } catch {
        if (!request.signal.aborted) {
            renderInvitation(null, 'Please check your connection and try again.');
        }
    } finally {
        if (invitationRequest === request) {
            invitationRequest = null;
            root.removeAttribute('aria-busy');
        }
    }
};

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        root.querySelector('.invite-lightbox.is-open button')?.click();
    }
});

initLanguage(refreshInvitation);
document.querySelector('.invite-language').hidden = false;
refreshInvitation();

