import { guest } from './app/guest/guest.js';
import { lang } from './common/language.js';

((w) => {
    document.addEventListener('DOMContentLoaded', lang.init, { once: true });
    w.undangan = guest.init();
})(window);
