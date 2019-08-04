
'use strict';

const fs   = require('fs');
const Path = require('path');

const { cache_age_days: CACHE_AGE_DAYS } = require('./options.json');
const CACHE_AGE = CACHE_AGE_DAYS < 0 ? Infinity : CACHE_AGE_DAYS * 24 * 3600 * 1000;

const { asyncWork, mkdirEx } = require('./utility.js');

const CACHE_FILE = Path.join(__dirname, "cache/problems.json");
const CURRENT_VERSION = 1;

let saveInterval = null;
let cacheChanged = false;
let savingCache = false;
let forceSaving = false;
let cacheData = {};

async function readCache() {
    try {
        cacheData = JSON.parse(await asyncWork(fs.readFile, CACHE_FILE, "utf-8"));
        if (cacheData.version !== CURRENT_VERSION) {
            throw new Error("Version not match");
        }
    } catch (err) {
        cacheData = {
            version: CURRENT_VERSION,
            data: {}
        };
    }
}

async function saveCache(force) {

    if (!cacheChanged) return;

    if (savingCache) {
        if (force) forceSaving = true;
        return;
    }

    savingCache = true;

    try {
        await mkdirEx(CACHE_FILE);
        await asyncWork(fs.writeFile, CACHE_FILE, JSON.stringify(cacheData), "utf-8");
    } catch (err) {
        console.log('Failed to save cache:');
        console.log(err.toString());
    }

    savingCache = false;

    if (forceSaving) {
        forceSaving = false;
        await saveCache(false);
    }
    
}

module.exports = {
    
    async init() {
        await readCache();
        cacheChanged = true;
        await saveCache();
        saveInterval = setInterval(async () => await saveCache(false), 5000);
    },

    get(pid) {
        if (!cacheData.data[pid]) return null;
        let res = cacheData.data[pid];
        if (Date.now() - res.time > CACHE_AGE) {
            cacheData.data[pid] = null;
            cacheChanged = true;
            return null;
        }
        return res.data;
    },

    set(pid, data) {
        cacheData.data[pid] = {
            time: Date.now(),
            data: data
        };
        cacheChanged = true;
    },

    async save() {
        await saveCache(true);
    },

    async stop() {
        if (saveInterval !== null) {
            clearInterval(saveInterval);
        }
        await saveCache(true);
    }
};
