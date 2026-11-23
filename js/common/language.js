import { addTranslations, getLanguage, initLanguage, t } from '../saas/i18n.js';
import './legacy-translations.js';

const countries = { en: 'US', fr: 'FR' };

export const lang = {
    getLanguage,
    getCountry() {
        return countries[getLanguage()];
    },
    getLocale() {
        return `${getLanguage()}_${this.getCountry()}`;
    },
    init() {
        document.querySelectorAll('[data-legacy-fr]').forEach((element) => {
            const english = element.textContent.trim();
            addTranslations({ [english]: element.dataset.legacyFr });
            element.dataset.i18n = english;
        });

        initLanguage(() => {
            const format = new Intl.NumberFormat(getLanguage());
            document.querySelectorAll('[data-legacy-number]').forEach((element) => {
                element.textContent = format.format(element.dataset.legacyNumber);
            });
            document.querySelectorAll('[data-legacy-replies]').forEach((element) => {
                element.textContent = element.dataset.show === 'true'
                    ? t('Hide replies')
                    : t('Show replies ({count})', { count: element.dataset.uuids.split(',').length });
            });
            document.dispatchEvent(new Event('undangan.language'));
        });
    },
};
