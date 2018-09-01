
'use strict';

const fs       = require('fs');
const Path     = require('path');

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

function randomString(char, len) {
    let res = '';
    while (len--) res += char[Math.floor(Math.random() * char.length)];
    return res;
}

module.exports = { asyncWork, sleep, existsAsync, mkdirEx, parseString, randomString };