'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const store = require('./lib/store');
const { verifyToken } = require('./lib/security');
const { createRouter } = require('./lib/router');
const {
    HttpError, readJson, sendJson, sendError, serveFile, parseCookies,
} = require('./lib/http');

const { registerAuthRoutes } = require('./routes/auth');
const { registerGuestRoutes } = require('./routes/guests');
const { registerContentRoutes } = require('./routes/content');
const { registerRsvpRoutes } = require('./routes/rsvps');
const { registerDashboardRoutes } = require('./routes/dashboard');
const { registerPublicRoutes } = require('./routes/public');

const ROOT = path.join(__dirname, '..');
const PORT = Number.parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const COOKIE_NAME = 'sas_token';

const PRIVATE_PREFIXES = ['/server', '/data', '/node_modules', '/.git', '/.github'];

const setSessionCookie = (res, token, maxAge) => {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
};

const clearSessionCookie = (res) => {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
};

const router = createRouter();
const deps = { load: store.load, mutate: store.mutate, setSessionCookie, clearSessionCookie };

registerAuthRoutes(router, deps);
registerGuestRoutes(router, deps);
registerContentRoutes(router, deps);
registerRsvpRoutes(router, deps);
registerDashboardRoutes(router, deps);
registerPublicRoutes(router);

const resolveUser = (req) => {
    const header = req.headers.authorization || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const cookies = parseCookies(req.headers.cookie || '');
    const token = bearer || cookies[COOKIE_NAME] || '';

    if (!token) {
        return null;
    }

    const payload = verifyToken(token);
    if (!payload) {
        return null;
    }

    return store.load().users.find((user) => user.id === payload.sub) || null;
};

const isPrivatePath = (pathname) => PRIVATE_PREFIXES.some((prefix) => (
    pathname === prefix || pathname.startsWith(`${prefix}/`)
));

const handleApi = async (req, res, url) => {
    const method = req.method === 'HEAD' ? 'GET' : req.method;
    const requiresBody = ['POST', 'PATCH', 'PUT'].includes(method);
    const body = requiresBody ? await readJson(req) : {};

    const ctx = {
        req,
        res,
        method,
        pathname: url.pathname,
        query: Object.fromEntries(url.searchParams.entries()),
        body,
        params: {},
        user: resolveUser(req),
        ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'local',
        settings: store.load().settings,
    };

    const matched = router.match(method, url.pathname);
    if (!matched) {
        throw new HttpError(404, `No API route for ${method} ${url.pathname}.`, 'not_found');
    }
    if (matched.route.auth && !ctx.user) {
        throw new HttpError(401, 'Please sign in to continue.', 'unauthorized');
    }

    ctx.params = matched.params;
    const result = await matched.route.handler(ctx);

    if (!res.writableEnded) {
        sendJson(res, 200, result === undefined ? { ok: true } : result);
    }
};

const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');

    let url;
    try {
        url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    } catch {
        res.writeHead(400).end('Bad request');
        return;
    }

    try {
        if (url.pathname.startsWith('/api/')) {
            await handleApi(req, res, url);
            return;
        }

        if (url.pathname.startsWith('/uploads/')) {
            if (serveFile(res, store.UPLOAD_DIR, url.pathname.replace(/^\/uploads/, ''))) {
                return;
            }
            throw new HttpError(404, 'File not found.', 'not_found');
        }

        if (url.pathname === '/' || url.pathname === '') {
            res.writeHead(302, { Location: '/login.html' });
            res.end();
            return;
        }

        if (url.pathname === '/admin' || url.pathname === '/dashboard') {
            res.writeHead(302, { Location: '/admin.html' });
            res.end();
            return;
        }

        if (url.pathname === '/invite' || url.pathname === '/i') {
            res.writeHead(302, { Location: `/invite.html${url.search}` });
            res.end();
            return;
        }

        if (isPrivatePath(url.pathname)) {
            throw new HttpError(404, 'Not found.', 'not_found');
        }

        if (serveFile(res, ROOT, url.pathname)) {
            return;
        }

        if (serveFile(res, ROOT, '/404.html')) {
            return;
        }

        throw new HttpError(404, 'Page not found.', 'not_found');
    } catch (error) {
        if (url.pathname.startsWith('/api/')) {
            sendError(res, error);
            return;
        }
        if (!res.headersSent) {
            res.writeHead(error.status || 500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(error.status === 404 ? '404 - Page not found' : '500 - Server error');
        } else {
            res.end();
        }
    }
});

fs.mkdirSync(store.UPLOAD_DIR, { recursive: true });
store.load();

server.listen(PORT, HOST, () => {
    console.log('');
    console.log('  SAS Wedding Studio');
    console.log('  ---------------------------------------------');
    console.log(`  Admin login : http://localhost:${PORT}/login.html`);
    console.log(`  Dashboard   : http://localhost:${PORT}/admin.html`);
    console.log(`  Invitation  : http://localhost:${PORT}/invite.html`);
    console.log(`  API health  : http://localhost:${PORT}/api/public/health`);
    console.log('  ---------------------------------------------');
    console.log('  Demo login  : admin@saswedding.id / wedding123');
    console.log('');
});

process.on('SIGINT', () => {
    console.log('\nShutting down...');
    server.close(() => process.exit(0));
});

