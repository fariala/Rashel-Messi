'use strict';

const { HttpError } = require('./http');

/**
 * Minimal path-pattern router.
 * Patterns support named params, e.g. `/api/admin/guests/:id/qr`.
 */
const createRouter = () => {
    const routes = [];

    /**
     * @param {'GET'|'POST'|'PATCH'|'PUT'|'DELETE'} method
     * @param {string} pattern
     * @param {(ctx: object) => any} handler
     * @param {{ auth?: boolean }} [options]
     */
    const add = (method, pattern, handler, options = {}) => {
        const keys = [];
        const regexSource = pattern
            .split('/')
            .map((part) => {
                if (part.startsWith(':')) {
                    keys.push(part.slice(1));
                    return '([^/]+)';
                }
                return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            })
            .join('/');
        routes.push({
            method,
            regex: new RegExp(`^${regexSource}/?$`, 'i'),
            keys,
            handler,
            auth: Boolean(options.auth),
        });
    };

    /**
     * @param {string} method
     * @param {string} pathname
     * @returns {{ route: object, params: object }|null}
     */
    const match = (method, pathname) => {
        for (const route of routes) {
            if (route.method !== method) {
                continue;
            }
            const result = route.regex.exec(pathname);
            if (!result) {
                continue;
            }
            const params = {};
            route.keys.forEach((key, index) => {
                params[key] = decodeURIComponent(result[index + 1]);
            });
            return { route, params };
        }
        return null;
    };

    /**
     * Dispatch a request. Throws HttpError for unmatched routes.
     *
 * @param {object} ctx
 * @returns {any}
 */
const dispatch = (ctx) => {
    const found = match(ctx.method, ctx.pathname);
    if (!found) {
        throw new HttpError(404, `No API route for ${ctx.method} ${ctx.pathname}.`, 'not_found');
    }
    ctx.params = found.params;
    return found.route.handler(ctx);
};

    return {
        get: (pattern, handler, options) => add('GET', pattern, handler, options),
        post: (pattern, handler, options) => add('POST', pattern, handler, options),
        patch: (pattern, handler, options) => add('PATCH', pattern, handler, options),
        put: (pattern, handler, options) => add('PUT', pattern, handler, options),
        delete: (pattern, handler, options) => add('DELETE', pattern, handler, options),
        match,
        dispatch,
        routes,
    };
};

module.exports = { createRouter };
