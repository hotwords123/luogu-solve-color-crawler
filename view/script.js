
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
        [ 7, "暂无评定", "#bbb" ]
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
        let spaceURL = 'https://www.luogu.org/user/' + dataManager.crawlResult.uid;
        let submitURL = 'https://www.luogu.org/record/list?uid=' + dataManager.crawlResult.uid;
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

UI.selfInit();
problemPanel.setSortWays(null, null);

function initView(crawlResult) {
    dataManager.init(crawlResult);
    UI.init();
}