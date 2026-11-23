const TOKEN_KEY = 'sas.token';
const RETURN_KEY = 'sas.returnTo';

/**
 * Error thrown for every non-2xx API response.
 */
export class ApiError extends Error {
    /**
     * @param {string} message
     * @param {number} status
     * @param {string} code
     */
    constructor(message, status, code) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
    }
}

const safeStorage = {
    get(key) {
        try {
            return window.localStorage.getItem(key) || '';
        } catch {
            return '';
        }
    },
    set(key, value) {
        try {
            window.localStorage.setItem(key, value);
        } catch {
            /* storage unavailable - session cookie still works */
        }
    },
    remove(key) {
        try {
            window.localStorage.removeItem(key);
        } catch {
            /* ignore */
        }
    },
};

export const session = {
    /**
     * @returns {string}
     */
    token() {
        return safeStorage.get(TOKEN_KEY);
    },
    /**
     * @param {string} token
     * @returns {void}
     */
    set(token) {
        safeStorage.set(TOKEN_KEY, token);
    },
    /**
     * @returns {void}
     */
    clear() {
        safeStorage.remove(TOKEN_KEY);
    },
    /**
     * Remember the page the user wanted before being redirected to login.
     *
     * @param {string} path
     * @returns {void}
     */
    remember(path) {
        safeStorage.set(RETURN_KEY, path);
    },
    /**
     * @returns {string}
     */
    consumeReturn() {
        const path = safeStorage.get(RETURN_KEY);
        safeStorage.remove(RETURN_KEY);
        return path;
    },
};

export const redirectToLogin = () => {
    if (!window.location.pathname.endsWith('/login.html')) {
        session.remember(`${window.location.pathname}${window.location.search}${window.location.hash}`);
        window.location.replace('/login.html');
    }
};

/**
 * Serialize a query object, skipping empty values.
 *
 * @param {Record<string, any>} [params]
 * @returns {string}
 */
export const query = (params = {}) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            search.set(key, String(value));
        }
    });
    const text = search.toString();
    return text ? `?${text}` : '';
};

/**
 * Perform an API request.
 *
 * @param {string} path
 * @param {{ method?: string, body?: any, headers?: Record<string, string>, redirect?: boolean }} [options]
 * @returns {Promise<any>}
 */
const request = async (path, options = {}) => {
    const { method = 'GET', body, headers = {}, redirect = true } = options;
    const token = session.token();

    const finalHeaders = { Accept: 'application/json', ...headers };
    if (token) {
        finalHeaders.Authorization = `Bearer ${token}`;
    }
    if (body !== undefined) {
        finalHeaders['Content-Type'] = 'application/json';
    }

    let response;
    try {
        response = await fetch(path, {
            method,
            headers: finalHeaders,
            credentials: 'same-origin',
            body: body === undefined ? undefined : JSON.stringify(body),
        });
    } catch {
        throw new ApiError('Cannot reach the server. Please check your connection and try again.', 0, 'network_error');
    }

    const contentType = response.headers.get('content-type') || '';
    let payload = null;
    if (contentType.includes('application/json')) {
        try {
            payload = await response.json();
        } catch {
            payload = null;
        }
    } else {
        payload = await response.text();
    }

    if (!response.ok) {
        const details = payload && payload.error ? payload.error : {};
        if (response.status === 401 && redirect) {
            session.clear();
            redirectToLogin();
        }
        throw new ApiError(details.message || 'The request could not be completed.', response.status, details.code || 'error');
    }

    return payload;
};

export const api = {
    request,
    get: (path, params) => request(`${path}${query(params)}`),
    post: (path, body) => request(path, { method: 'POST', body }),
    patch: (path, body) => request(path, { method: 'PATCH', body }),
    put: (path, body) => request(path, { method: 'PUT', body }),
    delete: (path) => request(path, { method: 'DELETE' }),
    /**
     * Sign out and return to the login screen.
     *
     * @returns {Promise<void>}
     */
    async logout() {
        try {
            await request('/api/auth/logout', { method: 'POST', body: {} });
        } catch {
            /* the session is cleared locally regardless */
        }
        session.clear();
        window.location.replace('/login.html');
    },
};
