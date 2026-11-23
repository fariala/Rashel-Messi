'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.txt': 'text/plain; charset=utf-8',
    '.webmanifest': 'application/manifest+json',
    '.map': 'application/json; charset=utf-8',
};

class HttpError extends Error {
    /**
     * @param {number} status
     * @param {string} message
     * @param {string} [code]
     */
    constructor(status, message, code = 'error') {
        super(message);
        this.status = status;
        this.code = code;
    }
}

/**
 * Read and parse a JSON request body.
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {number} [limit]
 * @returns {Promise<any>}
 */
const readJson = (req, limit = 8 * 1024 * 1024) => new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on('data', (chunk) => {
        size += chunk.length;
        if (size > limit) {
            reject(new HttpError(413, 'Request body is too large.', 'payload_too_large'));
            req.destroy();
            return;
        }
        chunks.push(chunk);
    });

    req.on('end', () => {
        if (!size) {
            resolve({});
            return;
        }
        try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
            reject(new HttpError(400, 'Invalid JSON body.', 'invalid_json'));
        }
    });

    req.on('error', reject);
});

/**
 * Send a JSON response.
 *
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {any} data
 */
const sendJson = (res, status, data) => {
    const body = JSON.stringify(data);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-store',
    });
    res.end(body);
};

const sendBuffer = (res, status, buffer, type, filename) => {
    const headers = {
        'Content-Type': type,
        'Content-Length': buffer.length,
        'Cache-Control': 'private, max-age=60',
    };

    if (filename) {
        headers['Content-Disposition'] = `inline; filename="${filename}"`;
    }

    res.writeHead(status, headers);
    res.end(buffer);
};

const sendError = (res, error) => {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof HttpError ? error.message : 'Something went wrong on the server.';
    if (status >= 500) {
        console.error('[api]', error);
    }
    sendJson(res, status, { error: { message, code: error.code || 'internal_error', status } });
};

/**
 * Serve a file from a directory, guarding against path traversal.
 *
 * @param {import('node:http').ServerResponse} res
 * @param {string} rootDir
 * @param {string} pathname
 * @returns {boolean} whether a file was served
 */
const serveFile = (res, rootDir, pathname) => {
    let decoded;
    try {
        decoded = decodeURIComponent(pathname);
    } catch {
        return false;
    }

    const relative = decoded.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!relative || relative.includes('\0')) {
        return false;
    }

    const filePath = path.resolve(rootDir, relative);
    const rootResolved = path.resolve(rootDir);
    if (filePath !== rootResolved && !filePath.startsWith(rootResolved + path.sep)) {
        return false;
    }

    let stat;
    try {
        stat = fs.statSync(filePath);
    } catch {
        return false;
    }

    const target = stat.isDirectory() ? path.join(filePath, 'index.html') : filePath;
    let finalStat;
    try {
        finalStat = fs.statSync(target);
    } catch {
        return false;
    }
    if (!finalStat.isFile()) {
        return false;
    }

    const ext = path.extname(target).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const etag = `W/"${finalStat.size}-${Number(finalStat.mtimeMs).toString(36)}"`;

    if (res.req && res.req.headers['if-none-match'] === etag) {
        res.writeHead(304, { ETag: etag });
        res.end();
        return true;
    }

    const cacheControl = ext === '.html' ? 'no-cache' : 'public, max-age=3600';
    res.writeHead(200, {
        'Content-Type': type,
        'Content-Length': finalStat.size,
        'Cache-Control': cacheControl,
        'ETag': etag,
        'Last-Modified': finalStat.mtime.toUTCString(),
    });

    if (res.req && res.req.method === 'HEAD') {
        res.end();
        return true;
    }

    fs.createReadStream(target).pipe(res);
    return true;
};

const parseCookies = (header = '') => header.split(';').reduce((acc, part) => {
    const index = part.indexOf('=');
    if (index > 0) {
        acc[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
    }
    return acc;
}, {});

module.exports = { MIME, HttpError, readJson, sendJson, sendBuffer, sendError, serveFile, parseCookies };
