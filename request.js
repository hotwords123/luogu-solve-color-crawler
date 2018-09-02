
'use strict';

const url      = require('url');
const http     = require('http');
const https    = require('https');

const { timeout: TIMEOUT, request_headers: REQUEST_HEADERS } = require('./options.json');

class HTTPError extends Error {
    constructor(code) {
        super(code.toString());
        this.statusCode = code;
    }
}

class TimeoutError extends Error {
    constructor(...arg) {
        super(...arg);
    }
}

function httpRequest(options, data) {
    return new Promise((resolve, reject) => {
        try {
            let h = options.protocol === 'https:' ? https : http;
            let req = h.request(options, (res) => {
                if (res.statusCode === 200) {
                    resolve(res);
                } else {
                    reject(new HTTPError(res.statusCode));
                }
            });
            req.on('error', (err) => reject(err));
            req.on('timeout', () => reject(new TimeoutError("Request timeout")));
            if (data) req.write(data);
            req.end();
        } catch (err) {
            reject(err);
        }
    });
}

async function requestPage(dest, method, headers, data) {
    let options = Object.assign({
        method: method || 'GET',
        headers: Object.assign(REQUEST_HEADERS, headers || {}),
        timeout: TIMEOUT.request
    }, url.parse(encodeURI(dest)));
    return await httpRequest(options, data);
}

function requestPageContent(dest, method, headers, encoding) {
    return new Promise(async function(resolve, reject) {
        try {
            let resp = await requestPage(dest, method, headers);
            let res = '';
            let timeout;
            resp.setEncoding(encoding || 'utf-8');
            resp.on('data', (chunk) => { res += chunk; });
            resp.on('end', () => {
                resolve(res);
                clearTimeout(timeout);
            });
            timeout = setTimeout(() => reject(new TimeoutError("Response timeout")), TIMEOUT.response);
        } catch (err) {
            reject(err);
        }
    });
}

module.exports = { HTTPError, TimeoutError, requestPageContent };
