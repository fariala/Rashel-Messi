'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { seedDatabase } = require('../seed');

const ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = process.env.SAS_DATA_DIR ? path.resolve(process.env.SAS_DATA_DIR) : path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

let cache = null;

const ensureDirs = () => {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
};

const writeFile = (db) => {
    ensureDirs();
    const tmp = `${DB_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
    fs.renameSync(tmp, DB_FILE);
};

const normalize = (db) => {
    db.users = Array.isArray(db.users) ? db.users : [];
    db.guests = Array.isArray(db.guests) ? db.guests : [];
    db.rsvps = Array.isArray(db.rsvps) ? db.rsvps : [];
    db.activity = Array.isArray(db.activity) ? db.activity : [];
    db.settings = db.settings && typeof db.settings === 'object' ? db.settings : {};
    db.content = db.content && typeof db.content === 'object' ? db.content : {};
    db.meta = db.meta && typeof db.meta === 'object' ? db.meta : { version: 1 };
    return db;
};

/**
 * Load the database from disk (cached in memory after the first read).
 * Seeds a demo database when the file does not exist or cannot be parsed.
 *
 * @returns {object}
 */
const load = () => {
    if (cache) {
        return cache;
    }

    ensureDirs();

    if (!fs.existsSync(DB_FILE)) {
        cache = normalize(seedDatabase());
        writeFile(cache);
        return cache;
    }

    try {
        cache = normalize(JSON.parse(fs.readFileSync(DB_FILE, 'utf8')));
    } catch (err) {
        console.warn('[store] database is corrupted, re-seeding:', err.message);
        cache = normalize(seedDatabase());
        writeFile(cache);
    }

    return cache;
};

/**
 * Persist the whole database.
 *
 * @param {object} db
 * @returns {object}
 */
const save = (db) => {
    cache = normalize(db);
    cache.meta = { ...cache.meta, updatedAt: new Date().toISOString() };
    writeFile(cache);
    return cache;
};

/**
 * Mutate and persist the database in one call.
 *
 * @param {(db: object) => any} fn
 * @returns {any}
 */
const mutate = (fn) => {
    const db = load();
    const result = fn(db);
    save(db);
    return result;
};

/**
 * Rebuild the database with fresh demo data.
 *
 * @returns {object}
 */
const reset = () => {
    cache = normalize(seedDatabase());
    writeFile(cache);
    return cache;
};

module.exports = { DATA_DIR, UPLOAD_DIR, DB_FILE, load, save, mutate, reset };
