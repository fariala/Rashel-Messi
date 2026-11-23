import { api, session } from './api.js';
import { initLanguage, t } from './i18n.js';
import './login-translations.js';
import { setBusy, toast } from './ui.js';

const form = document.getElementById('login-form');
const emailInput = document.getElementById('login-email');
const passwordInput = document.getElementById('login-password');
const rememberInput = document.getElementById('login-remember');
const errorBox = document.getElementById('login-error');
const submitButton = document.getElementById('login-submit');
const toggle = document.getElementById('toggle-password');
let visibleError;

const showError = (message, values) => {
    visibleError = { message, values };
    errorBox.querySelector('span').textContent = t(message, values);
    errorBox.classList.add('is-visible');
};

const hideError = () => {
    visibleError = undefined;
    errorBox.classList.remove('is-visible');
};

const updatePasswordLabel = () => {
    toggle.setAttribute('aria-label', t(passwordInput.type === 'password' ? 'Show password' : 'Hide password'));
};

const goToDashboard = () => {
    const target = session.consumeReturn();
    const safe = target && target.startsWith('/') && !target.startsWith('//') ? target : '/admin.html';
    window.location.replace(safe);
};

const restoreSession = async () => {
    if (!session.token()) {
        return;
    }
    try {
        await api.get('/api/auth/me');
        goToDashboard();
    } catch {
        session.clear();
    }
};

if (form) {
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        hideError();

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
            showError('Please enter your email and password.');
            return;
        }

        setBusy(submitButton, true);

        try {
            const result = await api.request('/api/auth/login', {
                method: 'POST',
                body: { email, password, remember: Boolean(rememberInput && rememberInput.checked) },
                redirect: false,
            });

            session.set(result.token);
            toast(t('Welcome back, {name}.', { name: result.user.name.split(' ')[0] }), 'success');
            window.setTimeout(goToDashboard, 220);
        } catch (error) {
            const retryIn = error.code === 'rate_limited' && error.message.match(/\b(\d+) minute/);
            if (retryIn) {
                showError('Too many login attempts. Please try again in {minutes} minute(s).', { minutes: retryIn[1] });
            } else {
                showError(error.message || 'We could not sign you in.');
            }
            passwordInput.value = '';
            passwordInput.focus();
        } finally {
            setBusy(submitButton, false);
            submitButton.querySelector('[data-i18n]').textContent = t('Sign in');
        }
    });
}

if (toggle) {
    toggle.addEventListener('click', () => {
        const isPassword = passwordInput.type === 'password';
        passwordInput.type = isPassword ? 'text' : 'password';
        toggle.innerHTML = `<i class="fa-solid ${isPassword ? 'fa-eye-slash' : 'fa-eye'}"></i>`;
        updatePasswordLabel();
        passwordInput.focus();
    });
}

const demo = document.getElementById('demo-fill');
if (demo) {
    demo.addEventListener('click', () => {
        emailInput.value = 'admin@saswedding.id';
        passwordInput.value = 'wedding123';
        hideError();
        passwordInput.focus();
    });
}

initLanguage(() => {
    if (toggle) {
        updatePasswordLabel();
    }
    if (visibleError) {
        showError(visibleError.message, visibleError.values);
    }
});

if (form) {
    updatePasswordLabel();
    restoreSession();
}
