const PREFERENCE_KEY = 'sas.language';
const ATTRIBUTES = ['title', 'aria-label', 'aria-description', 'placeholder', 'content', 'alt'];
const french = new Map([
    ['Language', 'Langue'],
    ['Cannot reach the server. Please check your connection and try again.', 'Le serveur est inaccessible. Vérifiez votre connexion et réessayez.'],
    ['The request could not be completed.', 'Impossible de traiter la demande.'],
    ['Please sign in to continue.', 'Veuillez vous connecter pour continuer.'],
]);

let language = 'en';
let onChange;

const supportedLanguage = (value) => {
    const base = String(value || '').toLowerCase().split('-')[0];
    return base === 'en' || base === 'fr' ? base : '';
};

const readPreference = () => {
    try {
        return window.localStorage.getItem(PREFERENCE_KEY);
    } catch {
        return '';
    }
};

export const addTranslations = (dictionary) => {
    Object.entries(dictionary).forEach(([key, value]) => french.set(key, value));
};

export const getLanguage = () => language;

export const t = (english, values = {}) => {
    const source = String(english ?? '');
    const message = (language === 'fr' ? french.get(source) : undefined) ?? source;
    return message.replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match);
};

const applyLanguage = () => {
    document.documentElement.lang = language;
    document.querySelectorAll('[data-i18n]').forEach((element) => {
        const value = t(element.dataset.i18n);
        if (element.textContent !== value) {
            element.textContent = value;
        }
    });
    ATTRIBUTES.forEach((attribute) => {
        const marker = `data-i18n-${attribute}`;
        document.querySelectorAll(`[${marker}]`).forEach((element) => {
            element.setAttribute(attribute, t(element.getAttribute(marker)));
        });
    });
    document.querySelectorAll('[data-language-select]').forEach((select) => {
        select.value = language;
    });
};

export const setLanguage = (value) => {
    const next = supportedLanguage(value);
    if (!next) {
        return;
    }
    try {
        window.localStorage.setItem(PREFERENCE_KEY, next);
    } catch {
        /* The switch still works when storage is unavailable. */
    }

    const url = new URL(window.location.href);
    if (url.searchParams.has('lang') && url.searchParams.get('lang') !== next) {
        url.searchParams.set('lang', next);
        window.history.replaceState(window.history.state, '', url);
    }

    if (language !== next) {
        language = next;
        applyLanguage();
        onChange?.(language);
    }
};

const handleSelection = (event) => {
    if (event.target.matches('[data-language-select]')) {
        setLanguage(event.target.value);
    }
};

export const initLanguage = (callback) => {
    const queryLanguage = new URLSearchParams(window.location.search).get('lang');
    language = supportedLanguage(queryLanguage)
        || supportedLanguage(readPreference())
        || (navigator.languages || [navigator.language]).map(supportedLanguage).find(Boolean)
        || 'en';
    onChange = callback;
    applyLanguage();
    document.addEventListener('change', handleSelection);
    return language;
};
