'use strict';

const languageData = require('./invitation-language-data.json');
const fields = new Map(Object.entries(languageData.fields));
const frenchCopy = new Map(Object.entries(languageData.frenchCopy));

const getFrenchCopy = (english) => {
    if (typeof english !== 'string') {
        return undefined;
    }

    const source = english.trim();
    const exact = frenchCopy.get(source);
    if (exact) {
        return exact;
    }

    const title = /^(.+?)\s*-\s*Wedding Invitation$/.exec(source);
    if (title) {
        return `${title[1].replace(/ & /g, ' et ')} – Invitation au mariage`;
    }

    const signature = /^With love, (.+)$/.exec(source);
    if (signature) {
        return `Avec toute notre affection, ${signature[1].replace(/ & /g, ' et ')}`;
    }

    const honorific = /^(Mr|Mrs)\.(\s.*|$)/.exec(source);
    if (honorific) {
        return `${honorific[1] === 'Mr' ? 'M.' : 'Mme'}${honorific[2]}`;
    }

    return undefined;
};

const frenchFieldPath = (path) => {
    const keys = path.split('.');
    const key = keys.pop();
    const section = keys.filter((part) => !/^\d+$/.test(part)).join('.');
    return fields.get(section)?.includes(key) ? [...keys, 'translations', 'fr', key].join('.') : null;
};

const localizeInvitation = (content, language, path = '') => {
    if (Array.isArray(content)) {
        return content.map((item) => localizeInvitation(item, language, path));
    }
    if (content === null || typeof content !== 'object') {
        return content;
    }

    const overrides = content.translations?.fr;
    const entries = Object.entries(content)
        .filter(([key]) => key !== 'translations')
        .map(([key, value]) => {
            const childPath = path ? `${path}.${key}` : key;
            return [key, localizeInvitation(value, language, childPath)];
        });
    const localized = Object.fromEntries(entries);
    if (language === 'fr') {
        for (const key of fields.get(path) || []) {
            const override = overrides?.[key];
            const copy = (typeof override === 'string' && override.trim()) || getFrenchCopy(content[key]);
            if (copy) {
                localized[key] = copy;
            }
        }
    }
    return localized;
};

module.exports = { frenchFieldPath, getFrenchCopy, localizeInvitation };
