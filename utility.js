
'use strict';

const fs       = require('fs');
const Path     = require('path');
const url      = require('url');
const http     = require('http');
const https    = require('https');

const { timeout: TIMEOUT, request_headers: REQUEST_HEADERS } = require('./options.json');

function asyncWork(fn, ...arg) {
	return new Promise((resolve, reject) => {
		fn.call(this, ...arg, (err, data) => {
			if (err) reject(err);
			else resolve(data);
		});
	});
}

function sleep(time) {
    return new Promise((resolve) => {
        setTimeout(resolve, time);
    });
}

function existsAsync(filename) {
	return new Promise((resolve) => {
		fs.exists(filename, resolve);
	});
}

async function mkdirEx(path) {
	path = Path.normalize(path);
	let arr = path.split(Path.sep);
	let i = 1;
	for (; i < arr.length; ++i) {
		if (!await existsAsync(arr.slice(0, i).join(Path.sep))) break;
	}
	for (; i < arr.length; ++i) {
		await asyncWork(fs.mkdir, arr.slice(0, i).join(Path.sep));
	}
}

function parseString(str, arg) {
	return str.replace(/<[^<>]+>/g, function(s) {
		let a = s.slice(1, -1);
		return a in arg ? arg[a] : s;
	});
}

function httpRequest(options, data) {
	return new Promise((resolve, reject) => {
        let h = options.protocol === 'https:' ? https : http;
		let req = h.request(options, (res) => {
			if (res.statusCode === 200) {
				resolve(res);
			} else {
				reject(new Error(`HTTP Error ${res.statusCode}`));
			}
		});
		req.on('error', (err) => reject(err));
		req.on('timeout', () => reject(new Error("Request timeout")));
		if (data) req.write(data);
		req.end();
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
			timeout = setTimeout(() => reject(new Error("Response timeout")), TIMEOUT.response);
		} catch (err) {
			reject(err);
		}
	});
}

module.exports = { asyncWork, sleep, existsAsync, mkdirEx, parseString, requestPageContent };