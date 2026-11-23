import { admin } from './app/admin/admin.js';
import { lang } from './common/language.js';

((w) => {
    document.addEventListener('DOMContentLoaded', lang.init, { once: true });
    w.undangan = admin.init();
})(window);
