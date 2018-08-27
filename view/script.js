
'use strict';

function randomColor() {
    let res = '#';
    for (let i = 0; i < 6; ++i) res += Math.floor(Math.random() * 16).toString(16);
    return res;
}

function downloadFile(content, filename, mimeType) {
    let blob = new Blob([ content ], { type: mimeType });
    let url = URL.createObjectURL(blob);
    let $a = $('<a>');
    $a.attr('href', url);
    $a.attr('download', filename);
    $('body').append($a);
    $a.get(0).click();
    $a.remove();
    URL.revokeObjectURL(url);
}

class DataMapError extends Error {
	constructor(...arg) {
		super(...arg);
	}
}

class DataMap {

	constructor(arr) {
		this.head = arr[0];
		this.body = arr.slice(1);
	}

	getCID(col) {
		let cid = this.head.indexOf(col);
		if (cid === -1) throw new DataMapError(`Column "${col}" not found`);
		return cid;
	}

	getRID(col, value) {
		let cid = this.getCID(col);
		return this.body.findIndex((row) => {
			return row[cid] === value;
		});
	}

	lookupRow(col, value) {
		let rid = this.getRID(col, value);
		if (rid === -1) return null;
		return this.body[rid];
	}

	lookup(col, value, col2) {
		let row = this.lookupRow(col, value);
		let cid2 = this.getCID(col2);
		if (!row) return null;
		return row[cid2];
    }

    lookupByRID(rid, col) {
        return this.body[rid][this.getCID(col)];
    }
    
    appendRow(row) {
        if (row instanceof Array) {
            return this.body.push(row) - 1;
        } else {
            return this.body.push(this.head.map(function(title) {
                return row[title];
            })) - 1;
        }
    }

    sort(cols) {
        let self = this;
        this.body.sort(function(a, b) {
            for (let i = 0; i < cols.length; ++i) {
                let cid = self.getCID(cols[i].name);
                let t = cols[i].fn(a[cid], b[cid]);
                if (t) return t;
            }
            return 0;
        });
    }

    rowData(row) {
        let res = {};
        this.head.forEach(function(col, i) {
            res[col] = row[i];
        });
        return res;
    }

    rowDataByRID(rid) {
        return this.rowData(this.body[rid]);
    }

    forEach(fn, thisObj) {
        let self = this;
        this.body.forEach(function(row, i) {
            fn.call(thisObj, self.rowData(row), i);
        });
    }

    get cols() {
        return this.head;
    }

    get rows() {
        return this.body;
    }

    get numCols() {
        return this.head.length;
    }

    get numRows() {
        return this.body.length;
    }

    get length() {
        return this.numRows;
    }
}

let dataManager = {
    crawlResult: null,
    difficultyTags: new DataMap([
        [ "id", "name", "color" ],
        [ 0, "入门难度", "#e74c3c" ],
        [ 1, "普及-", "#e67e22" ],
        [ 2, "普及/提高-", "#f1c40f" ],
        [ 3, "普及+/提高", "#5eb95e" ],
        [ 4, "提高+/省选-", "#3498db" ],
        [ 5, "省选/NOI-", "#8e44ad" ],
        [ 6, "NOI/NOI+/CTSC", "#2e468c" ],
        [ 7, "尚无评定", "#bbb" ]
    ]),
    algorithmTags: new DataMap([[ "id", "name" ]]),
    difficultyCount: {},
    algorithmCount: {},
    solved: [],
    init(crawlResult) {
        let self = this;
        this.crawlResult = crawlResult;
        this.difficultyCount = {};
        this.algorithmCount = {};
        this.solved = [];
        crawlResult.solved.forEach(function(prob) {
            let diff_id = self.difficultyTags.lookup("name", prob.difficulty, "id");
            if (diff_id === null) {
                diff_id = self.difficultyTags.numRows;
                self.difficultyTags.appendRow({
                    id: diff_id,
                    name: prob.difficulty,
                    color: randomColor()
                });
            }
            if (!self.difficultyCount[diff_id]) {
                self.difficultyCount[diff_id] = 0;
            }
            ++self.difficultyCount[diff_id];
            let algo_ids = prob.algorithms.map(function(algo) {
                let p = self.algorithmTags.lookup("name", algo, "id");
                if (p === null) {
                    p = self.algorithmTags.numRows;
                    self.algorithmTags.appendRow({
                        id: p,
                        name: algo
                    });
                }
                if (!self.algorithmCount[p]) {
                    self.algorithmCount[p] = 0;
                }
                ++self.algorithmCount[p];
                return p;
            });
            self.solved.push({
                pid: prob.pid,
                name: prob.name,
                diff_id: diff_id,
                algo_ids: algo_ids.join(",")
            });
        });
    }
};

let UI = {
    filter: {
        diff: [],
        algo: []
    },
    listeners: {},
    on(id, fn) {
        if (!this.listeners[id]) this.listeners[id] = [];
        this.listeners[id].push(fn);
        return this;
    },
    emit(id, ...arg) {
        if (this.listeners[id]) {
            let self = this;
            this.listeners[id].forEach(function(fn) {
                fn.apply(self, arg);
            });
        }
        return this;
    },
    init() {
        this.load();
    },
    selfInit() {
        this.addSelfListeners();
        this.addListeners();
    },
    addSelfListeners() {
        this.on('difficulty.mouseOver', function(diff_id) {
            if (diff_id !== -1) {
                difficultyPanel.$ranges[diff_id].addClass('hover');
            }
            difficultyPanel.$items[diff_id].addClass('hover');
        }).on('difficulty.mouseOut', function(diff_id) {
            if (diff_id !== -1) {
                difficultyPanel.$ranges[diff_id].removeClass('hover');
            }
            difficultyPanel.$items[diff_id].removeClass('hover');
        }).on('difficulty.click', function(diff_id) {
            if (diff_id === -1) {
                this.filter.diff.forEach(function(diff_id) {
                    difficultyPanel.$ranges[diff_id].removeClass('selected');
                    difficultyPanel.$items[diff_id].removeClass('selected');
                });
                this.filter.diff = [];
            } else {
                let p = this.filter.diff.indexOf(diff_id);
                if (p === -1) {
                    this.filter.diff.push(diff_id);
                    difficultyPanel.$ranges[diff_id].addClass('selected');
                    difficultyPanel.$items[diff_id].addClass('selected');
                } else {
                    this.filter.diff.splice(p, 1);
                    difficultyPanel.$ranges[diff_id].removeClass('selected');
                    difficultyPanel.$items[diff_id].removeClass('selected');
                }
            }
            this.updateProblems();
        }).on('algorithm.click', function(algo_id) {
            if (algo_id === -1) {
                this.filter.algo.forEach(function(algo_id) {
                    algorithmPanel.$items[algo_id].removeClass('selected');
                });
                this.filter.algo = [];
            } else {
                let p = this.filter.algo.indexOf(algo_id);
                if (p === -1) {
                    this.filter.algo.push(algo_id);
                    algorithmPanel.$items[algo_id].addClass('selected');
                } else {
                    this.filter.algo.splice(p, 1);
                    algorithmPanel.$items[algo_id].removeClass('selected');
                }
            }
            this.updateProblems();
        });
    },
    load() {
        let userDesc = 'U' + dataManager.crawlResult.uid + ' ' + dataManager.crawlResult.username;
        let spaceURL = 'https://www.luogu.org/space/show?uid=' + dataManager.crawlResult.uid;
        let submitURL = 'https://www.luogu.org/recordnew/lists?uid=' + dataManager.crawlResult.uid;
        let solvedURL = submitURL + '&status=12';
        this.userDesc = userDesc;
        document.title = '洛谷做题记录 - ' + userDesc;
        $('.r-header h1').text(userDesc);
        $('#r-summary-user').html('')
            .append($('<a target="_blank">')
                .prop('href', spaceURL)
                .text(userDesc));
        $('#r-summary-submit').html('')
            .append($('<a target="_blank">')
                .prop('href', submitURL)
                .text(dataManager.crawlResult.submitTotal));
        $('#r-summary-solved').html('')
            .append($('<a target="_blank">')
                .prop('href', solvedURL)
                .text(dataManager.crawlResult.solvedTotal));
        $('#r-summary-unknown').text(dataManager.crawlResult.solvedUnknown.length)
            .prop('title', dataManager.crawlResult.solvedUnknown.join('\n'));
        let date = new Date();
        date.setTime(dataManager.crawlResult.time);
        $('#r-summary-time').text(date.toLocaleString());

        this.filter.diff = [];
        this.filter.algo = [];
        this.updateProblems();
        difficultyPanel.draw();
        algorithmPanel.draw();
    },
    checkDiff(diff_id) {
        return !this.filter.diff.length || this.filter.diff.indexOf(diff_id) !== -1;
    },
    checkAlgo(algo_ids) {
        if (!this.filter.algo.length) return true;
        for (let i = 0; i < this.filter.algo.length; ++i) {
            if (algo_ids.indexOf(this.filter.algo[i].toString()) !== -1) return true;
        }
        return false;
    },
    updateProblems() {
        let self = this;
        problemPanel.updateProblems(dataManager.solved.filter((prob) => {
            return self.checkDiff(prob.diff_id) && self.checkAlgo(prob.algo_ids.split(','));
        }));
    },
    addListeners() {
        $('#r-file').on('input', function() {
            if (this.files.length === 1) {
                let reader = new FileReader();
                reader.onload = function() {
                    try {
                        initView(JSON.parse(reader.result));
                    } catch (err) {
                        console.log(err);
                        alert(err.stack);
                    }
                };
                reader.readAsText(this.files[0]);
            }
        });
        $('.r-page-a').click(function(e) {
            problemPanel.setPage($(this).attr('data-page'));
        });
        $('.r-sort-by').click(function(e) {
            problemPanel.setSortWays($(this).attr('data-sort-by'), null);
        });
        $('.r-sort-order').click(function(e) {
            problemPanel.setSortWays(null, $(this).attr('data-order'));
        });
        $('#r-export-json').click(function(e) {
            if (!dataManager.crawlResult) return;
            downloadFile(JSON.stringify(dataManager.crawlResult), UI.userDesc + '.json', 'application/json');
        });
        $('#r-export-txt').click(function(e) {
            if (!dataManager.crawlResult) return;
            downloadFile(resultTextMaker.make(dataManager.crawlResult), UI.userDesc + '.txt', 'text/plain');
        });
        $('#r-export-html').click(function(e) {
            if (!dataManager.crawlResult) return;
            downloadFile(resultHtmlMaker.make(dataManager.crawlResult), document.title + '.html', 'text/html');
        });
        $('.r-difficulty-bar').on('mouseover', '.r-difficulty-bar-range', function(e) {
            UI.emit('difficulty.mouseOver', parseInt($(this).attr('data-id')));
        }).on('mouseout', '.r-difficulty-bar-range', function(e) {
            UI.emit('difficulty.mouseOut', parseInt($(this).attr('data-id')));
        }).on('click', '.r-difficulty-bar-range', function(e) {
            UI.emit('difficulty.click', parseInt($(this).attr('data-id')));
        });
        $('.r-difficulty-list').on('mouseover', '.r-difficulty-item', function(e) {
            UI.emit('difficulty.mouseOver', parseInt($(this).attr('data-id')));
        }).on('mouseout', '.r-difficulty-item', function(e) {
            UI.emit('difficulty.mouseOut', parseInt($(this).attr('data-id')));
        }).on('click', '.r-difficulty-item', function(e) {
            UI.emit('difficulty.click', parseInt($(this).attr('data-id')));
        });
        $('.r-algorithm-list').on('click', '.r-algorithm-item', function(e) {
            UI.emit('algorithm.click', parseInt($(this).attr('data-id')));
        });
    }
};

let problemPanel = {
    $list: $('.r-problems'),
    $items: {},
    problems: [],
    currentPage: 0,
    totalPages: 0,
    problemsPerPage: 25,
    sortWays: {
        keyword: 'pid',
        order: 'asc'
    },
    sortFn: {
        'pid': function(a, b) {
            if (a.pid.startsWith('P') && !b.pid.startsWith('P')) return -1;
            if (b.pid.startsWith('P') && !a.pid.startsWith('P')) return 1;
            if (a.pid > b.pid) return 1;
            if (a.pid < b.pid) return -1;
            return 0;
        },
        'diff': function(a, b) {
            if (a.diff_id > b.diff_id) return 1;
            if (a.diff_id < b.diff_id) return -1;
            return problemPanel.sortFn['pid'](a, b);
        }
    },
    setPage(page) {
        if (!this.totalPages) return;
        if (typeof page === 'string') {
            switch (page) {
                case 'first': page = 1; break;
                case 'last': page = this.totalPages; break;
                case 'prev': page = this.currentPage - 1; break;
                case 'next': page = this.currentPage + 1; break;
                default: return;
            }
        }
        if (page < 1) page = 1;
        if (page > this.totalPages) page = this.totalPages;
        if (page === this.currentPage) return;
        this.currentPage = page;
        this.updateInfo();
        this.draw();
    },
    setSortWays(keyword, order) {
        if (keyword) this.sortWays.keyword = keyword;
        if (order) this.sortWays.order = order;
        this.sort();
        this.updateInfo();
        this.draw();
    },
    sort() {
        let fn = this.sortFn[this.sortWays.keyword];
        let rev = this.sortWays.order === 'des';
        this.problems.sort(function(a, b) {
            let t = fn(a, b);
            return rev ? -t : t;
        });
    },
    updateProblems(problems) {
        this.problems = problems.slice(0);
        if (!this.problems.length) {
            this.currentPage = 0;
            this.totalPages = 0;
        } else {
            this.currentPage = 1;
            this.totalPages = Math.ceil(this.problems.length / this.problemsPerPage);
        }
        this.sort();
        this.updateInfo();
        this.draw();
    },
    draw() {
        let self = this;
        this.$list.html('');
        this.$items = {};
        let diffTags = dataManager.difficultyTags;
        let algoTags = dataManager.algorithmTags;
        this.problems
        .slice((this.currentPage - 1) * this.problemsPerPage, this.currentPage * this.problemsPerPage)
        .forEach(function(prob) {
            let $item = $('<div class="r-panel r-problem">');
            $item.append($('<span class="r-problem-name">')
                .append($('<a target="_blank">')
                    .prop('href', 'https://www.luogu.org/problemnew/show/' + prob.pid)
                    .text(prob.pid + ' ' + prob.name)));
            let $tags = $('<span class="r-panel-right">');
            let diffRow = diffTags.rowData(diffTags.lookupRow('id', prob.diff_id));
            $tags.append($('<span class="r-problem-tag r-problem-tag-difficulty">')
                .attr('data-id', prob.diff_id)
                .text(diffRow.name)
                .css('backgroundColor', diffRow.color));
            prob.algo_ids.split(',').forEach(function(algo_id) {
                if (!algo_id) return;
                $tags.append($('<span class="r-problem-tag r-problem-tag-algorithm">')
                    .attr('data-id', algo_id)
                    .text(algoTags.lookup('id', parseInt(algo_id), 'name')));
            });
            self.$list.append($item.append($tags));
            self.$items[prob.pid] = $item;
        });
    },
    updateInfo() {
        let self = this;
        $('#r-filtered-count').text(this.problems.length);
        $('.r-page-num').text(this.totalPages ? '第' + this.currentPage + '/' + this.totalPages + '页' : '---');
        $('.r-sort-by').each(function(i, a) {
            let $a = $(a);
            if ($a.attr('data-sort-by') === self.sortWays.keyword) {
                $a.addClass('selected');
            } else {
                $a.removeClass('selected');
            }
        });
        $('.r-sort-order').each(function(i, a) {
            let $a = $(a);
            if ($a.attr('data-order') === self.sortWays.order) {
                $a.addClass('selected');
            } else {
                $a.removeClass('selected');
            }
        });
    }
};

let difficultyPanel = {
    $bar: $('.r-difficulty-bar'),
    $list: $('.r-difficulty-list'),
    $ranges: {},
    $items: {},
    draw() {
        let self = this;
        let ranges = [];
        let total = dataManager.solved.length;
        this.$bar.html('');
        this.$list.html('');
        this.$ranges = {};
        this.$items = {};
        dataManager.difficultyTags.forEach(function(row) {
            let cnt = dataManager.difficultyCount[row.id];
            if (!cnt) return;
            ranges.push({
                id: row.id,
                name: row.name,
                count: cnt,
                color: row.color
            });
        });
        ranges.push({
            id: -1,
            name: '总计',
            count: total,
            color: 'transparent'
        });
        ranges.forEach(function(range) {
            let percent = range.count / total * 100;
            if (range.id !== -1) {
                let $range = $('<span class="r-difficulty-bar-range">');
                $range.attr('data-id', range.id)
                    .css('width', percent + '%')
                    .css('backgroundColor', range.color);
                self.$bar.append($range);
                self.$ranges[range.id] = $range;
            }
            let $item = $('<div class="r-difficulty-item">');
            $item.attr('data-id', range.id)
                .append($('<span class="r-difficulty-item-icon">')
                    .css('backgroundColor', range.color))
                .append($('<span class="r-panel-left">')
                    .text(range.name))
                .append($('<span class="r-panel-right">')
                    .text(range.count));
            self.$list.append($item);
            self.$items[range.id] = $item;
        });
    }
};

let algorithmPanel = {
    $list: $('.r-algorithm-list'),
    $items: {},
    draw() {
        let self = this;
        let list = [];
        this.$list.html('');
        this.$items = {};
        let total = dataManager.solved.length;
        dataManager.algorithmTags.forEach(function(row) {
            if (!dataManager.algorithmCount[row.id]) return;
            list.push({
                id: row.id,
                name: row.name,
                count: dataManager.algorithmCount[row.id]
            });
        });
        list.push({
            id: -1,
            name: '总计',
            count: total
        });
        list.sort(function(a, b) {
            return b.count - a.count;
        });
        list.forEach(function(item) {
            let percent = item.count / total * 100;
            let $item = $('<div class="r-algorithm-item">');
            $item.attr('data-id', item.id)
                .append($('<span class="r-panel-left">').text(item.name))
                .append($('<span class="r-panel-right r-algorithm-bar">')
                    .append($('<span class="r-algorithm-bar-fill">')
                        .css('width', percent + '%'))
                    .append($('<span class="r-algorithm-bar-text">').text(item.count)));
            self.$list.append($item);
            self.$items[item.id] = $item;
        });
    }
};

let resultTextMaker = {

    // Copied from crawler

    generateSummaryResult(sections, res) {
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
    },
    generateDifficultyResult(sections, solved) {
    
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
    },
    generateAlgorithmResult(sections, solved) {
    
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
    },
    generateUnknownResult(sections, arr) {
        if (!arr.length) return;
    
        sections.push({
            title: '未知题目',
            detail: arr
        });
    },
    make(res) {
    
        const SEPARATOR = '--------------------';
        const CRLF = '\r\n';
    
        let sections = [];
    
        this.generateSummaryResult(sections, res);
        this.generateDifficultyResult(sections, res.solved);
        this.generateAlgorithmResult(sections, res.solved);
        this.generateUnknownResult(sections, res.solvedUnknown);
    
        return [].concat(...sections.map((section) => [section.title, SEPARATOR].concat(section.detail).join(CRLF))).join(CRLF + CRLF);
    }
};

let resultHtmlMaker = {
    template: "<!DOCTYPE html>\n<html lang=\"zh\">\n<head>\n    <meta charset=\"utf-8\">\n    <title>洛谷做题记录</title>\n    <style type=\"text/css\">\n\n    * {\n        margin: 0;\n        padding: 0;\n    }\n    \n    a {\n        color: #0e90d2;\n        text-decoration: none;\n    }\n    \n    a:hover {\n        color: #095f8a;\n    }\n    \n    body {\n        font-family: sans-serif;\n        background: #f0f0f0;\n        user-select: none;\n        -moz-user-select: none;\n        -webkit-user-select: none;\n    }\n    \n    .r-header {\n        position: fixed;\n        left: 0;\n        top: 0;\n        width: 100%;\n        height: 60px;\n        background: linear-gradient(to bottom right, #d9e8ff, #f2f6fd);\n        border-bottom: 1px solid #bbb;\n        box-shadow: 0 0 8px #bbb;\n        z-index: 11;\n        cursor: pointer;\n        transition: all linear .3s 0s;\n    }\n    \n    .r-header:hover {\n        border-color: #aaa;\n        box-shadow: 0 0 12px #aaa;\n    }\n    \n    .r-header h1 {\n        padding: 16px 20px;\n        font-size: 28px;\n        line-height: 30px;\n        color: #333;\n    }\n    \n    .r-main {\n        padding: 15px;\n        margin-top: 60px;\n        display: flex;\n        flex-direction: row;\n        z-index: 10;\n    }\n    \n    .r-panel {\n        background: #fafafa;\n        border: 1px solid #bbb;\n        border-radius: 5px;\n        box-shadow: 0 0 8px #bbb;\n        transition: all linear .3s 0s;\n    }\n    \n    .r-panel:hover {\n        background: #fcfcfc;\n        border-color: #aaa;\n        box-shadow: 0 0 12px #aaa;\n    }\n    \n    .r-panel-left {\n        font-weight: bold;\n    }\n    \n    .r-panel-right {\n        float: right;\n    }\n    \n    .r-table-row {\n        font-size: 14px;\n        line-height: 25px;\n    }\n    \n    .r-left {\n        padding-right: 15px;\n        flex-grow: 1;\n        flex-shrink: 1;\n    }\n    \n    .r-problem {\n        margin-bottom: 15px;\n        padding: 10px;\n        height: 16px;\n        line-height: 16px;\n    }\n    \n    .r-problem.hidden {\n        display: none;\n    }\n    \n    .r-problem-name {\n        font-size: 16px;\n    }\n    \n    .r-problem-tag {\n        display: inline-block;\n        min-width: 3em;\n        height: 16px;\n        margin: 2px 4px;\n        padding: 0 5px;\n        font-size: 12px;\n        font-weight: bold;\n        line-height: 16px;\n        text-align: center;\n        border-radius: 2px;\n        color: #fff;\n    }\n    \n    .r-problem-tag-algorithm {\n        background: #f495a0;\n    }\n    \n    .r-right {\n        width: 30%;\n        max-width: 400px;\n        min-width: 250px;\n    }\n    \n    .r-right > .r-panel {\n        position: relative;\n        margin-bottom: 15px;\n        padding: 50px 20px 15px 20px;\n    }\n    \n    .r-right > .r-panel > .r-panel-title {\n        position: absolute;\n        top: 15px;\n        left: 15px;\n        font-size: 16px;\n        font-weight: bold;\n        color: #000;\n    }\n    \n    a.selected {\n        color: #333;\n        cursor: default;\n    }\n    \n    .r-difficulty-bar {\n        width: 100%;\n        height: 10px;\n        margin-top: 10px;\n        overflow: hidden;\n        border-radius: 5px;\n        box-shadow: 0 0 8px #bbb;\n        transition: all linear .3s 0s;\n    }\n    \n    .r-difficulty-bar:hover {\n        box-shadow: 0 0 12px #aaa;\n    }\n    \n    .r-difficulty-bar-range {\n        display: block;\n        float: left;\n        height: 10px;\n        opacity: 0.4;\n        cursor: pointer;\n        transition: opacity linear .3s 0s;\n    }\n    \n    .r-difficulty-bar-range.hover {\n        opacity: 0.7;\n    }\n    \n    .r-difficulty-bar-range.selected {\n        opacity: 1;\n    }\n    \n    .r-difficulty-list {\n        margin-top: 20px;\n    }\n    \n    .r-difficulty-item {\n        margin-top: 10px;\n        padding: 10px;\n        height: 14px;\n        font-size: 14px;\n        line-height: 14px;\n        border-radius: 5px;\n        border: 1px solid #bbb;\n        box-shadow: 0 0 4px #bbb;\n        cursor: pointer;\n        transition: all linear .3s 0s;\n    }\n    \n    .r-difficulty-item.hover {\n        border: 1px solid #aaa;\n        box-shadow: 0 0 12px #aaa;\n        background: #f3f3f3;\n    }\n    \n    .r-difficulty-item.selected {\n        border: 1px solid #999;\n        box-shadow: 0 0 12px #999;\n        background: #e3e3e3;\n    }\n    \n    .r-difficulty-item-icon {\n        display: block;\n        float: left;\n        width: 12px;\n        height: 12px;\n        border: 1px solid #aaa;\n        margin-right: 4px;\n    }\n    \n    .r-algorithm-list {\n        max-height: 400px;\n        overflow-y: auto;\n    }\n    \n    .r-algorithm-item {\n        margin-bottom: 5px;\n        padding: 6px 8px;\n        height: 14px;\n        border-radius: 4px;\n        border: 1px solid #ccc;\n        font-size: 14px;\n        line-height: 14px;\n        cursor: pointer;\n        transition: all linear .3s 0s;\n    }\n    \n    .r-algorithm-item:hover {\n        background: #f7f7f7;\n        border: 1px solid #999;\n    }\n    \n    .r-algorithm-item.selected {\n        background: #e3e3e3;\n    }\n    \n    .r-algorithm-bar {\n        position: relative;\n        display: block;\n        width: 100px;\n        height: 14px;\n        background: #ddd;\n    }\n    \n    .r-algorithm-bar-fill {\n        position: absolute;\n        display: block;\n        top: 0;\n        left: 0;\n        height: 100%;\n        background: #a7c6ff;\n        z-index: 1;\n    }\n    \n    .r-algorithm-bar-text {\n        position: absolute;\n        display: block;\n        top: 0;\n        left: 0;\n        width: 100%;\n        height: 100%;\n        text-align: center;\n        font-size: 12px;\n        color: #333;\n        z-index: 2;\n    }\n    \n    </style>\n    <script src=\"https://libs.baidu.com/jquery/2.0.0/jquery.min.js\" type=\"text/javascript\"></script>\n</head>\n<body>\n    <div class=\"r-header\">\n        <h1></h1>\n    </div>\n    <div class=\"r-main\">\n        <div class=\"r-left\">\n            <div class=\"r-problems\"></div>\n        </div>\n        <div class=\"r-right\">\n            <div class=\"r-panel r-summary\">\n                <div class=\"r-panel-title\">总览</div>\n                <div class=\"r-table-row\">\n                    <span class=\"r-panel-left\">用户</span>\n                    <span class=\"r-panel-right\" id=\"r-summary-user\"></span>\n                </div>\n                <div class=\"r-table-row\">\n                    <span class=\"r-panel-left\">提交总数</span>\n                    <span class=\"r-panel-right\" id=\"r-summary-submit\"></span>\n                </div>\n                <div class=\"r-table-row\">\n                    <span class=\"r-panel-left\">通过总数</span>\n                    <span class=\"r-panel-right\" id=\"r-summary-solved\"></span>\n                </div>\n                <div class=\"r-table-row\">\n                    <span class=\"r-panel-left\">未知题目</span>\n                    <span class=\"r-panel-right\" id=\"r-summary-unknown\"></span>\n                </div>\n                <div class=\"r-table-row\">\n                    <span class=\"r-panel-left\">统计时间</span>\n                    <span class=\"r-panel-right\" id=\"r-summary-time\"></span>\n                </div>\n                <div class=\"r-table-row\">\n                    <span class=\"r-panel-left\">题目总数</span>\n                    <span class=\"r-panel-right\" id=\"r-filtered-count\"></span>\n                </div>\n            </div>\n            <div class=\"r-panel r-operations\">\n                <div class=\"r-panel-title\">操作</div>\n                <div class=\"r-table-row\">\n                    <span class=\"r-panel-left\">题目页码</span>\n                    <span class=\"r-panel-right\">\n                        <a href=\"javascript:void(0);\" class=\"r-page-a\" data-page=\"first\" title=\"第一页\">&lt;&lt;</a>\n                        <a href=\"javascript:void(0);\" class=\"r-page-a\" data-page=\"prev\" title=\"上一页\">&lt;</a>\n                        <span class=\"r-page-num\">---</span>\n                        <a href=\"javascript:void(0);\" class=\"r-page-a\" data-page=\"next\" title=\"下一页\">&gt;</a>\n                        <a href=\"javascript:void(0);\" class=\"r-page-a\" data-page=\"last\" title=\"最后一页\">&gt;&gt;</a>\n                    </span>\n                </div>\n                <div class=\"r-table-row\">\n                    <span class=\"r-panel-left\">排序方式</span>\n                    <span class=\"r-panel-right\">\n                        <a href=\"javascript:void(0);\" class=\"r-sort-by\" data-sort-by=\"pid\">题号</a>\n                        <a href=\"javascript:void(0);\" class=\"r-sort-by\" data-sort-by=\"diff\">难度</a>\n                        <span>|</span>\n                        <a href=\"javascript:void(0);\" class=\"r-sort-order\" data-order=\"asc\">升序</a>\n                        <a href=\"javascript:void(0);\" class=\"r-sort-order\" data-order=\"des\">降序</a>\n                    </span>\n                </div>\n                <div class=\"r-table-row\">\n                    <span class=\"r-panel-left\">导出统计数据</span>\n                    <span class=\"r-panel-right\">\n                        <a href=\"javascript:void(0);\" id=\"r-export-json\" title=\"原始数据(json)\">原始数据</a>\n                        <a href=\"javascript:void(0);\" id=\"r-export-txt\" title=\"文本(txt)\">文本</a>\n                    </span>\n                </div>\n            </div>\n            <div class=\"r-panel r-difficulty\">\n                <div class=\"r-panel-title\">难度</div>\n                <div class=\"r-difficulty-bar\"></div>\n                <div class=\"r-difficulty-list\"></div>\n            </div>\n            <div class=\"r-panel r-algorithm\">\n                <div class=\"r-panel-title\">算法标签</div>\n                <div class=\"r-algorithm-list\"></div>\n            </div>\n        </div>\n    </div>\n\n    <script type=\"text/javascript\">\n\n    'use strict';\n    \n    function randomColor() {\n        let res = '#';\n        for (let i = 0; i < 6; ++i) res += Math.floor(Math.random() * 16).toString(16);\n        return res;\n    }\n    \n    function downloadFile(content, filename, mimeType) {\n        let blob = new Blob([ content ], { type: mimeType });\n        let url = URL.createObjectURL(blob);\n        let $a = $('<a>');\n        $a.attr('href', url);\n        $a.attr('download', filename);\n        $('body').append($a);\n        $a.get(0).click();\n        $a.remove();\n        URL.revokeObjectURL(url);\n    }\n    \n    class DataMapError extends Error {\n        constructor(...arg) {\n            super(...arg);\n        }\n    }\n    \n    class DataMap {\n    \n        constructor(arr) {\n            this.head = arr[0];\n            this.body = arr.slice(1);\n        }\n    \n        getCID(col) {\n            let cid = this.head.indexOf(col);\n            if (cid === -1) throw new DataMapError(`Column \"${col}\" not found`);\n            return cid;\n        }\n    \n        getRID(col, value) {\n            let cid = this.getCID(col);\n            return this.body.findIndex((row) => {\n                return row[cid] === value;\n            });\n        }\n    \n        lookupRow(col, value) {\n            let rid = this.getRID(col, value);\n            if (rid === -1) return null;\n            return this.body[rid];\n        }\n    \n        lookup(col, value, col2) {\n            let row = this.lookupRow(col, value);\n            let cid2 = this.getCID(col2);\n            if (!row) return null;\n            return row[cid2];\n        }\n    \n        lookupByRID(rid, col) {\n            return this.body[rid][this.getCID(col)];\n        }\n        \n        appendRow(row) {\n            if (row instanceof Array) {\n                return this.body.push(row) - 1;\n            } else {\n                return this.body.push(this.head.map(function(title) {\n                    return row[title];\n                })) - 1;\n            }\n        }\n    \n        sort(cols) {\n            let self = this;\n            this.body.sort(function(a, b) {\n                for (let i = 0; i < cols.length; ++i) {\n                    let cid = self.getCID(cols[i].name);\n                    let t = cols[i].fn(a[cid], b[cid]);\n                    if (t) return t;\n                }\n                return 0;\n            });\n        }\n    \n        rowData(row) {\n            let res = {};\n            this.head.forEach(function(col, i) {\n                res[col] = row[i];\n            });\n            return res;\n        }\n    \n        rowDataByRID(rid) {\n            return this.rowData(this.body[rid]);\n        }\n    \n        forEach(fn, thisObj) {\n            let self = this;\n            this.body.forEach(function(row, i) {\n                fn.call(thisObj, self.rowData(row), i);\n            });\n        }\n    \n        get cols() {\n            return this.head;\n        }\n    \n        get rows() {\n            return this.body;\n        }\n    \n        get numCols() {\n            return this.head.length;\n        }\n    \n        get numRows() {\n            return this.body.length;\n        }\n    \n        get length() {\n            return this.numRows;\n        }\n    }\n    \n    let dataManager = {\n        crawlResult: null,\n        difficultyTags: new DataMap([\n            [ \"id\", \"name\", \"color\" ],\n            [ 0, \"入门难度\", \"#e74c3c\" ],\n            [ 1, \"普及-\", \"#e67e22\" ],\n            [ 2, \"普及/提高-\", \"#f1c40f\" ],\n            [ 3, \"普及+/提高\", \"#5eb95e\" ],\n            [ 4, \"提高+/省选-\", \"#3498db\" ],\n            [ 5, \"省选/NOI-\", \"#8e44ad\" ],\n            [ 6, \"NOI/NOI+/CTSC\", \"#2e468c\" ],\n            [ 7, \"尚无评定\", \"#bbb\" ]\n        ]),\n        algorithmTags: new DataMap([[ \"id\", \"name\" ]]),\n        difficultyCount: {},\n        algorithmCount: {},\n        solved: [],\n        init(crawlResult) {\n            let self = this;\n            this.crawlResult = crawlResult;\n            this.difficultyCount = {};\n            this.algorithmCount = {};\n            this.solved = [];\n            crawlResult.solved.forEach(function(prob) {\n                let diff_id = self.difficultyTags.lookup(\"name\", prob.difficulty, \"id\");\n                if (diff_id === null) {\n                    diff_id = self.difficultyTags.numRows;\n                    self.difficultyTags.appendRow({\n                        id: diff_id,\n                        name: prob.difficulty,\n                        color: randomColor()\n                    });\n                }\n                if (!self.difficultyCount[diff_id]) {\n                    self.difficultyCount[diff_id] = 0;\n                }\n                ++self.difficultyCount[diff_id];\n                let algo_ids = prob.algorithms.map(function(algo) {\n                    let p = self.algorithmTags.lookup(\"name\", algo, \"id\");\n                    if (p === null) {\n                        p = self.algorithmTags.numRows;\n                        self.algorithmTags.appendRow({\n                            id: p,\n                            name: algo\n                        });\n                    }\n                    if (!self.algorithmCount[p]) {\n                        self.algorithmCount[p] = 0;\n                    }\n                    ++self.algorithmCount[p];\n                    return p;\n                });\n                self.solved.push({\n                    pid: prob.pid,\n                    name: prob.name,\n                    diff_id: diff_id,\n                    algo_ids: algo_ids.join(\",\")\n                });\n            });\n        }\n    };\n    \n    let UI = {\n        filter: {\n            diff: [],\n            algo: []\n        },\n        listeners: {},\n        on(id, fn) {\n            if (!this.listeners[id]) this.listeners[id] = [];\n            this.listeners[id].push(fn);\n            return this;\n        },\n        emit(id, ...arg) {\n            if (this.listeners[id]) {\n                let self = this;\n                this.listeners[id].forEach(function(fn) {\n                    fn.apply(self, arg);\n                });\n            }\n            return this;\n        },\n        init() {\n            this.load();\n        },\n        selfInit() {\n            this.addSelfListeners();\n            this.addListeners();\n        },\n        addSelfListeners() {\n            this.on('difficulty.mouseOver', function(diff_id) {\n                if (diff_id !== -1) {\n                    difficultyPanel.$ranges[diff_id].addClass('hover');\n                }\n                difficultyPanel.$items[diff_id].addClass('hover');\n            }).on('difficulty.mouseOut', function(diff_id) {\n                if (diff_id !== -1) {\n                    difficultyPanel.$ranges[diff_id].removeClass('hover');\n                }\n                difficultyPanel.$items[diff_id].removeClass('hover');\n            }).on('difficulty.click', function(diff_id) {\n                if (diff_id === -1) {\n                    this.filter.diff.forEach(function(diff_id) {\n                        difficultyPanel.$ranges[diff_id].removeClass('selected');\n                        difficultyPanel.$items[diff_id].removeClass('selected');\n                    });\n                    this.filter.diff = [];\n                } else {\n                    let p = this.filter.diff.indexOf(diff_id);\n                    if (p === -1) {\n                        this.filter.diff.push(diff_id);\n                        difficultyPanel.$ranges[diff_id].addClass('selected');\n                        difficultyPanel.$items[diff_id].addClass('selected');\n                    } else {\n                        this.filter.diff.splice(p, 1);\n                        difficultyPanel.$ranges[diff_id].removeClass('selected');\n                        difficultyPanel.$items[diff_id].removeClass('selected');\n                    }\n                }\n                this.updateProblems();\n            }).on('algorithm.click', function(algo_id) {\n                if (algo_id === -1) {\n                    this.filter.algo.forEach(function(algo_id) {\n                        algorithmPanel.$items[algo_id].removeClass('selected');\n                    });\n                    this.filter.algo = [];\n                } else {\n                    let p = this.filter.algo.indexOf(algo_id);\n                    if (p === -1) {\n                        this.filter.algo.push(algo_id);\n                        algorithmPanel.$items[algo_id].addClass('selected');\n                    } else {\n                        this.filter.algo.splice(p, 1);\n                        algorithmPanel.$items[algo_id].removeClass('selected');\n                    }\n                }\n                this.updateProblems();\n            });\n        },\n        load() {\n            let userDesc = 'U' + dataManager.crawlResult.uid + ' ' + dataManager.crawlResult.username;\n            let spaceURL = 'https://www.luogu.org/space/show?uid=' + dataManager.crawlResult.uid;\n            let submitURL = 'https://www.luogu.org/recordnew/lists?uid=' + dataManager.crawlResult.uid;\n            let solvedURL = submitURL + '&status=12';\n            this.userDesc = userDesc;\n            document.title = '洛谷做题记录 - ' + userDesc;\n            $('.r-header h1').text(userDesc);\n            $('#r-summary-user').html('')\n                .append($('<a target=\"_blank\">')\n                    .prop('href', spaceURL)\n                    .text(userDesc));\n            $('#r-summary-submit').html('')\n                .append($('<a target=\"_blank\">')\n                    .prop('href', submitURL)\n                    .text(dataManager.crawlResult.submitTotal));\n            $('#r-summary-solved').html('')\n                .append($('<a target=\"_blank\">')\n                    .prop('href', solvedURL)\n                    .text(dataManager.crawlResult.solvedTotal));\n            $('#r-summary-unknown').text(dataManager.crawlResult.solvedUnknown.length)\n                .prop('title', dataManager.crawlResult.solvedUnknown.join('\\n'));\n            let date = new Date();\n            date.setTime(dataManager.crawlResult.time);\n            $('#r-summary-time').text(date.toLocaleString());\n    \n            this.filter.diff = [];\n            this.filter.algo = [];\n            this.updateProblems();\n            difficultyPanel.draw();\n            algorithmPanel.draw();\n        },\n        checkDiff(diff_id) {\n            return !this.filter.diff.length || this.filter.diff.indexOf(diff_id) !== -1;\n        },\n        checkAlgo(algo_ids) {\n            if (!this.filter.algo.length) return true;\n            for (let i = 0; i < this.filter.algo.length; ++i) {\n                if (algo_ids.indexOf(this.filter.algo[i].toString()) !== -1) return true;\n            }\n            return false;\n        },\n        updateProblems() {\n            let self = this;\n            problemPanel.updateProblems(dataManager.solved.filter((prob) => {\n                return self.checkDiff(prob.diff_id) && self.checkAlgo(prob.algo_ids.split(','));\n            }));\n        },\n        addListeners() {\n            $('.r-page-a').click(function(e) {\n                problemPanel.setPage($(this).attr('data-page'));\n            });\n            $('.r-sort-by').click(function(e) {\n                problemPanel.setSortWays($(this).attr('data-sort-by'), null);\n            });\n            $('.r-sort-order').click(function(e) {\n                problemPanel.setSortWays(null, $(this).attr('data-order'));\n            });\n            $('#r-export-json').click(function(e) {\n                if (!dataManager.crawlResult) return;\n                downloadFile(JSON.stringify(dataManager.crawlResult), UI.userDesc + '.json', 'application/json');\n            });\n            $('#r-export-txt').click(function(e) {\n                if (!dataManager.crawlResult) return;\n                downloadFile(resultTextMaker.make(dataManager.crawlResult), UI.userDesc + '.txt', 'text/plain');\n            });\n            $('.r-difficulty-bar').on('mouseover', '.r-difficulty-bar-range', function(e) {\n                UI.emit('difficulty.mouseOver', parseInt($(this).attr('data-id')));\n            }).on('mouseout', '.r-difficulty-bar-range', function(e) {\n                UI.emit('difficulty.mouseOut', parseInt($(this).attr('data-id')));\n            }).on('click', '.r-difficulty-bar-range', function(e) {\n                UI.emit('difficulty.click', parseInt($(this).attr('data-id')));\n            });\n            $('.r-difficulty-list').on('mouseover', '.r-difficulty-item', function(e) {\n                UI.emit('difficulty.mouseOver', parseInt($(this).attr('data-id')));\n            }).on('mouseout', '.r-difficulty-item', function(e) {\n                UI.emit('difficulty.mouseOut', parseInt($(this).attr('data-id')));\n            }).on('click', '.r-difficulty-item', function(e) {\n                UI.emit('difficulty.click', parseInt($(this).attr('data-id')));\n            });\n            $('.r-algorithm-list').on('click', '.r-algorithm-item', function(e) {\n                UI.emit('algorithm.click', parseInt($(this).attr('data-id')));\n            });\n        }\n    };\n    \n    let problemPanel = {\n        $list: $('.r-problems'),\n        $items: {},\n        problems: [],\n        currentPage: 0,\n        totalPages: 0,\n        problemsPerPage: 25,\n        sortWays: {\n            keyword: 'pid',\n            order: 'asc'\n        },\n        sortFn: {\n            'pid': function(a, b) {\n                if (a.pid.startsWith('P') && !b.pid.startsWith('P')) return -1;\n                if (b.pid.startsWith('P') && !a.pid.startsWith('P')) return 1;\n                if (a.pid > b.pid) return 1;\n                if (a.pid < b.pid) return -1;\n                return 0;\n            },\n            'diff': function(a, b) {\n                if (a.diff_id > b.diff_id) return 1;\n                if (a.diff_id < b.diff_id) return -1;\n                return problemPanel.sortFn['pid'](a, b);\n            }\n        },\n        setPage(page) {\n            if (!this.totalPages) return;\n            if (typeof page === 'string') {\n                switch (page) {\n                    case 'first': page = 1; break;\n                    case 'last': page = this.totalPages; break;\n                    case 'prev': page = this.currentPage - 1; break;\n                    case 'next': page = this.currentPage + 1; break;\n                    default: return;\n                }\n            }\n            if (page < 1) page = 1;\n            if (page > this.totalPages) page = this.totalPages;\n            if (page === this.currentPage) return;\n            this.currentPage = page;\n            this.updateInfo();\n            this.draw();\n        },\n        setSortWays(keyword, order) {\n            if (keyword) this.sortWays.keyword = keyword;\n            if (order) this.sortWays.order = order;\n            this.sort();\n            this.updateInfo();\n            this.draw();\n        },\n        sort() {\n            let fn = this.sortFn[this.sortWays.keyword];\n            let rev = this.sortWays.order === 'des';\n            this.problems.sort(function(a, b) {\n                let t = fn(a, b);\n                return rev ? -t : t;\n            });\n        },\n        updateProblems(problems) {\n            this.problems = problems.slice(0);\n            if (!this.problems.length) {\n                this.currentPage = 0;\n                this.totalPages = 0;\n            } else {\n                this.currentPage = 1;\n                this.totalPages = Math.ceil(this.problems.length / this.problemsPerPage);\n            }\n            this.sort();\n            this.updateInfo();\n            this.draw();\n        },\n        draw() {\n            let self = this;\n            this.$list.html('');\n            this.$items = {};\n            let diffTags = dataManager.difficultyTags;\n            let algoTags = dataManager.algorithmTags;\n            this.problems\n            .slice((this.currentPage - 1) * this.problemsPerPage, this.currentPage * this.problemsPerPage)\n            .forEach(function(prob) {\n                let $item = $('<div class=\"r-panel r-problem\">');\n                $item.append($('<span class=\"r-problem-name\">')\n                    .append($('<a target=\"_blank\">')\n                        .prop('href', 'https://www.luogu.org/problemnew/show/' + prob.pid)\n                        .text(prob.pid + ' ' + prob.name)));\n                let $tags = $('<span class=\"r-panel-right\">');\n                let diffRow = diffTags.rowData(diffTags.lookupRow('id', prob.diff_id));\n                $tags.append($('<span class=\"r-problem-tag r-problem-tag-difficulty\">')\n                    .attr('data-id', prob.diff_id)\n                    .text(diffRow.name)\n                    .css('backgroundColor', diffRow.color));\n                prob.algo_ids.split(',').forEach(function(algo_id) {\n                    if (!algo_id) return;\n                    $tags.append($('<span class=\"r-problem-tag r-problem-tag-algorithm\">')\n                        .attr('data-id', algo_id)\n                        .text(algoTags.lookup('id', parseInt(algo_id), 'name')));\n                });\n                self.$list.append($item.append($tags));\n                self.$items[prob.pid] = $item;\n            });\n        },\n        updateInfo() {\n            let self = this;\n            $('#r-filtered-count').text(this.problems.length);\n            $('.r-page-num').text(this.totalPages ? '第' + this.currentPage + '/' + this.totalPages + '页' : '---');\n            $('.r-sort-by').each(function(i, a) {\n                let $a = $(a);\n                if ($a.attr('data-sort-by') === self.sortWays.keyword) {\n                    $a.addClass('selected');\n                } else {\n                    $a.removeClass('selected');\n                }\n            });\n            $('.r-sort-order').each(function(i, a) {\n                let $a = $(a);\n                if ($a.attr('data-order') === self.sortWays.order) {\n                    $a.addClass('selected');\n                } else {\n                    $a.removeClass('selected');\n                }\n            });\n        }\n    };\n    \n    let difficultyPanel = {\n        $bar: $('.r-difficulty-bar'),\n        $list: $('.r-difficulty-list'),\n        $ranges: {},\n        $items: {},\n        draw() {\n            let self = this;\n            let ranges = [];\n            let total = dataManager.solved.length;\n            this.$bar.html('');\n            this.$list.html('');\n            this.$ranges = {};\n            this.$items = {};\n            dataManager.difficultyTags.forEach(function(row) {\n                let cnt = dataManager.difficultyCount[row.id];\n                if (!cnt) return;\n                ranges.push({\n                    id: row.id,\n                    name: row.name,\n                    count: cnt,\n                    color: row.color\n                });\n            });\n            ranges.push({\n                id: -1,\n                name: '总计',\n                count: total,\n                color: 'transparent'\n            });\n            ranges.forEach(function(range) {\n                let percent = range.count / total * 100;\n                if (range.id !== -1) {\n                    let $range = $('<span class=\"r-difficulty-bar-range\">');\n                    $range.attr('data-id', range.id)\n                        .css('width', percent + '%')\n                        .css('backgroundColor', range.color);\n                    self.$bar.append($range);\n                    self.$ranges[range.id] = $range;\n                }\n                let $item = $('<div class=\"r-difficulty-item\">');\n                $item.attr('data-id', range.id)\n                    .append($('<span class=\"r-difficulty-item-icon\">')\n                        .css('backgroundColor', range.color))\n                    .append($('<span class=\"r-panel-left\">')\n                        .text(range.name))\n                    .append($('<span class=\"r-panel-right\">')\n                        .text(range.count));\n                self.$list.append($item);\n                self.$items[range.id] = $item;\n            });\n        }\n    };\n    \n    let algorithmPanel = {\n        $list: $('.r-algorithm-list'),\n        $items: {},\n        draw() {\n            let self = this;\n            let list = [];\n            this.$list.html('');\n            this.$items = {};\n            let total = dataManager.solved.length;\n            dataManager.algorithmTags.forEach(function(row) {\n                if (!dataManager.algorithmCount[row.id]) return;\n                list.push({\n                    id: row.id,\n                    name: row.name,\n                    count: dataManager.algorithmCount[row.id]\n                });\n            });\n            list.push({\n                id: -1,\n                name: '总计',\n                count: total\n            });\n            list.sort(function(a, b) {\n                return b.count - a.count;\n            });\n            list.forEach(function(item) {\n                let percent = item.count / total * 100;\n                let $item = $('<div class=\"r-algorithm-item\">');\n                $item.attr('data-id', item.id)\n                    .append($('<span class=\"r-panel-left\">').text(item.name))\n                    .append($('<span class=\"r-panel-right r-algorithm-bar\">')\n                        .append($('<span class=\"r-algorithm-bar-fill\">')\n                            .css('width', percent + '%'))\n                        .append($('<span class=\"r-algorithm-bar-text\">').text(item.count)));\n                self.$list.append($item);\n                self.$items[item.id] = $item;\n            });\n        }\n    };\n    \n    let resultTextMaker = {\n    \n        // Copied from crawler\n    \n        generateSummaryResult(sections, res) {\n            let date = new Date();\n            date.setTime(res.time);\n            sections.push({\n                title: `U${res.uid} ${res.username}`,\n                detail: [\n                    `提交总数: ${res.submitTotal}`,\n                    `通过总数: ${res.solvedTotal}`,\n                    `统计时间: ${date.toLocaleString()}`\n                ]\n            });\n        },\n        generateDifficultyResult(sections, solved) {\n        \n            let names = [], lists = [];\n        \n            solved.forEach((prob) => {\n                let p = names.indexOf(prob.difficulty);\n                if (p === -1) {\n                    p = names.length;\n                    names.push(prob.difficulty);\n                    lists.push([]);\n                }\n                let desc = prob.pid + ' ' + prob.name;\n                if (prob.algorithms.length) {\n                    desc += ` (${prob.algorithms.join(';')})`;\n                }\n                lists[p].push(desc);\n            });\n        \n            sections.push({\n                title: '难度总览',\n                detail: names.map((name, i) => `${name}: ${lists[i].length}`)\n            });\n        \n            names.forEach((name, i) => {\n                sections.push({\n                    title: '难度: ' + name,\n                    detail: lists[i]\n                });\n            });\n        },\n        generateAlgorithmResult(sections, solved) {\n        \n            let names = [], lists = [];\n        \n            solved.forEach((prob) => {\n                let desc = prob.pid + ' ' + prob.name + ` (难度: ${prob.difficulty})`;\n                prob.algorithms.forEach((algorithm) => {\n                    let p = names.indexOf(algorithm);\n                    if (p === -1) {\n                        p = names.length;\n                        names.push(algorithm);\n                        lists.push([]);\n                    }\n                    lists[p].push(desc);\n                });\n            });\n        \n            sections.push({\n                title: '算法总览',\n                detail: names.map((name, i) => `${name}: ${lists[i].length}`)\n            });\n        \n            names.forEach((name, i) => {\n                sections.push({\n                    title: '算法标签: ' + name,\n                    detail: lists[i]\n                });\n            });\n        },\n        generateUnknownResult(sections, arr) {\n            if (!arr.length) return;\n        \n            sections.push({\n                title: '未知题目',\n                detail: arr\n            });\n        },\n        make(res) {\n        \n            const SEPARATOR = '--------------------';\n            const CRLF = '\\r\\n';\n        \n            let sections = [];\n        \n            this.generateSummaryResult(sections, res);\n            this.generateDifficultyResult(sections, res.solved);\n            this.generateAlgorithmResult(sections, res.solved);\n            this.generateUnknownResult(sections, res.solvedUnknown);\n        \n            return [].concat(...sections.map((section) => [section.title, SEPARATOR].concat(section.detail).join(CRLF))).join(CRLF + CRLF);\n        }\n    };\n    \n    UI.selfInit();\n    problemPanel.setSortWays(null, null);\n    \n    (function(crawlResult) {\n        dataManager.init(crawlResult);\n        UI.init();\n    })(<%- JSON.stringify(crawlResult) %>);\n\n    </script>\n</body>\n</html>",
    make(res) {
        return ejs.render(this.template, { crawlResult: res });
    }
};

UI.selfInit();
problemPanel.setSortWays(null, null);

function initView(crawlResult) {
    dataManager.init(crawlResult);
    UI.init();
}