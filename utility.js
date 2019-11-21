
'use strict';

function sleep(time) {
    return new Promise((resolve) => {
        setTimeout(resolve, time);
    });
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

module.exports = { sleep, parseString, randomString };