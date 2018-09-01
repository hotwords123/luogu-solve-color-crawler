
'use strict';

const EOL = require('os').EOL;

const { randomString } = require('./utility.js');

const DIFFICULTY_TAGS = require('./difficulty-tags.json');

function makeImg(a, b, color) {
    a = a.toString().replace(/-/g, '--');
    b = b.toString().replace(/-/g, '--');
    return `![${a} ${b}](https://img.shields.io/badge/${a}-${b}-${color}.svg)`;
}

module.exports = async function(res) {

    let source = [];
    let items = DIFFICULTY_TAGS.map((a) => ({
        name: a.name,
        color: a.color, 
        list: []
    }));

    res.solved.forEach(function(prob) {
        let p = items.findIndex((a) => a.name === prob.difficulty);
        if (p === -1) {
            p = items.length;
            items.push({
                name: prob.difficulty,
                color: randomString('0123456789abcdef', 6),
                list: []
            });
        }
        items[p].list.push({
            pid: prob.pid,
            name: prob.name
        });
    });

    items.forEach(function(item) {
        if (!item.list.length) return;
        source = source.concat([
            '- ' + makeImg(item.list.length, item.name, item.color), '',
            item.list.map((prob) => makeImg(prob.pid, prob.name, item.color)).join(' ')
        ]);
    });

    return source.join(EOL);

};
