
'use strict';

const SEPARATOR = '--------------------';
const EOL = require('os').EOL;

let sections, data;

function makeSummary() {
    let res = data;
    let date = new Date();
    date.setTime(res.time);
    sections.push({
        title: `U${res.uid} ${res.username}`,
        detail: [
            `提交总数: ${res.submitTotal}`,
            `通过总数: ${res.solvedTotal}`,
            `统计时间: ${date.toLocaleString()}`
        ]
    });
}

function makeDifficultyResult() {

    let solved = data.solved;
    let names = [], lists = [];

    solved.forEach((prob) => {
        let p = names.indexOf(prob.difficulty);
        if (p === -1) {
            p = names.length;
            names.push(prob.difficulty);
            lists.push([]);
        }
        let desc = prob.pid + ' ' + prob.name;
        if (prob.algorithms.length) {
            desc += ` (${prob.algorithms.join(';')})`;
        }
        lists[p].push(desc);
    });

    sections.push({
        title: '难度总览',
        detail: names.map((name, i) => `${name}: ${lists[i].length}`)
    });

    names.forEach((name, i) => {
        sections.push({
            title: '难度: ' + name,
            detail: lists[i]
        });
    });
}

function makeAlgorithmResult() {

    let solved = data.solved;
    let names = [], lists = [];

    solved.forEach((prob) => {
        let desc = prob.pid + ' ' + prob.name + ` (难度: ${prob.difficulty})`;
        prob.algorithms.forEach((algorithm) => {
            let p = names.indexOf(algorithm);
            if (p === -1) {
                p = names.length;
                names.push(algorithm);
                lists.push([]);
            }
            lists[p].push(desc);
        });
    });

    sections.push({
        title: '算法总览',
        detail: names.map((name, i) => `${name}: ${lists[i].length}`)
    });

    names.forEach((name, i) => {
        sections.push({
            title: '算法标签: ' + name,
            detail: lists[i]
        });
    });
}

function makeUnknownResult() {

    if (!data.solvedUnknown.length) return;

    sections.push({
        title: '未知题目',
        detail: data.solvedUnknown
    });
}

module.exports = async function (res) {
		
    sections = [];
    data = res;

    makeSummary();
    makeDifficultyResult();
    makeAlgorithmResult();
    makeUnknownResult();

    return [].concat(...sections.map((section) => [section.title, SEPARATOR].concat(section.detail).join(EOL))).join(EOL + EOL);
};
