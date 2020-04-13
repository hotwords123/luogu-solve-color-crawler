
'use strict';

console.log('Loading modules...');

const readline    = require('readline');
const cheerio     = require('cheerio');
const Tasks       = require('./tasks.js');
const ResultSaver = require('./result-saver.js');
const ProbCache   = require('./problem-cache.js');

const { sleep, parseString } = require("./utility.js");
const { HTTPError, TimeoutError, requestPageContent } = require('./request.js');

const { retry_count: RETRY_COUNT, wait_time: WAIT_TIME, max_parallel_tasks: MAX_PARALLEL_TASKS } = require("./options.json");
const PAGE_URL = (({ host, routes }) => {
    let urls = {};
    for (let id in routes) {
        urls[id] = host + routes[id];
    }
    return urls;
})(require("./crawler.json"));

let lfeConfig = null;

async function getUID(keyword) {
    let content = await requestPageContent( parseString(PAGE_URL.getuid, { keyword }) );
    let data = JSON.parse(content);
    let user = data.users[0];
    if (!user) throw new Error("user not found");
    return parseInt(user.uid);
}

function getInjectedData(content) {
    const before = '<script>window._feInjection = JSON.parse(decodeURIComponent("';
    const after = '"));';
    let lpos = content.indexOf(before);
    if (lpos === -1) throw new Error("failed to locate data");
    lpos += before.length;
    let rpos = content.indexOf(after, lpos);
    if (rpos === -1) throw new Error("failed to locate data");
    let data = JSON.parse(decodeURIComponent(content.slice(lpos, rpos)));
    if (data.code !== 200) throw new Error("code is not 200");
    return data;
}

async function getUserProfile(uid) {
    let content = await requestPageContent( parseString(PAGE_URL.profile, { uid }) );
    return getInjectedData(content).currentData;
}

async function getConfig() {
    let content = await requestPageContent( parseString(PAGE_URL.config, {}) );
    return JSON.parse(content);
}

async function getSingleProblemTags(pid) {
    await sleep(WAIT_TIME.each_crawl);
    let content = await requestPageContent( parseString(PAGE_URL.problem, { pid }) );
    let data = getInjectedData(content);
    let problem = data.currentData.problem;
    return problem.tags;
}

function cmp(a, b) {
    while (a.length < b.length) a = '0' + a;
    while (a.length > b.length) b = '0' + b;
    if (a < b) return -1;
    if (a > b) return +1;
    return 0;
}

async function getProblemListPage(type, page) {
    await sleep(WAIT_TIME.each_crawl);
    let content = await requestPageContent( parseString(PAGE_URL.problems, { type, page }) );
    let data = JSON.parse(content);
    return data.currentData.problems;
}

async function getProblemPageCount(type) {
    let data = await getProblemListPage(type, 1);
    return Math.ceil(data.count / data.result.length);
}

function loadProblem({ pid, title, difficulty, tags }) {
    let info = {
        pid, name: title,
        difficulty: lfeConfig.problemDifficulty.find(a => a.id === difficulty).name
    };
    if (tags) {
        info.algorithms = tags.map(id => {
            let tag = lfeConfig.tags[id];
            return tag.type === 'Algorithm' ? tag.name : null
        }).filter(a => !!a);
        ProbCache.set(pid, info);
    } else {
        info.algorithms = [];
    }
    return info;
}

async function buckCrawl(type, list) {
    let requestCount = 0;
    async function binarySearch(arr, lpage, rpage) {
        if (!arr.length || lpage > rpage) return;
        let mid = Math.floor((lpage + rpage) / 2);
        console.log(`Crawling page ${mid} (range = ${lpage} ~ ${rpage}, total = ${arr.length})...`);
        if (1.8 * Math.log2(rpage - lpage + 1) + 1 > arr.length) {
            console.log('Buck crawl backtracking');
            return;
        }
        ++requestCount;
        let data = await getProblemListPage(type, mid);
        data.result.forEach((problem) => loadProblem(problem));
        let first = data.result[0].pid.slice(type.length);
        let last = data.result[data.result.length - 1].pid.slice(type.length);
        let matches = arr.filter(a => cmp(a, first) >= 0 && cmp(a, last) <= 0).length;
        console.log(`Result: ${type + first} ~ ${type + last} (problem = ${data.result.length}, matches = ${matches})`);
        await binarySearch(arr.filter(a => cmp(a, first) < 0), lpage, mid - 1);
        await binarySearch(arr.filter(a => cmp(a, last) > 0), mid + 1, rpage);
    }
    let pageCount = await getProblemPageCount(type);
    console.log(`Crawling type ${type}, page count = ${pageCount}`);
    await binarySearch(list, 1, pageCount);
    return requestCount;
}

async function crawlUser(user) {
    
    let res = {};

    res.time = Date.now();
    res.uid = await getUID(user);

    console.log('Crawling user profile...');

    let userProfile = await getUserProfile(res.uid);

    res.username = userProfile.user.name;
    res.submitTotal = userProfile.user.submittedProblemCount;
    res.solvedTotal = userProfile.user.passedProblemCount;

    console.log('User ID=uid,Username=username,Submit Count=submitTotal,Solved Count=solvedTotal'
        .split(',').map(a => a.split('=')).map(([title, name]) => title + ': ' + res[name]).join('\n')
    );

    res.solved = [];
    res.solvedUnknown = [];

    let requestCount = 0;

    let not_cached = {};

    userProfile.passedProblems.forEach(({ pid, type }) => {
        if (!ProbCache.has(pid)) {
            if (!(type in not_cached)) {
                not_cached[type] = [];
            }
            not_cached[type].push(pid.slice(type.length));
        }
    });

    for (let type in not_cached) {
        requestCount += await buckCrawl(type, not_cached[type]);
    }

    let lastCrawled = null, lastCatchCount = 0;

    let tasks = userProfile.passedProblems.map((problem) => {
        return async () => {
            try {
                let pid = problem.pid;
                let info = ProbCache.get(pid);
                let isCache = true;
                if (!info) {
                    isCache = false;
                    ++requestCount;
                    for (let cnt = 0; ; ) {
                        try {
                            problem.tags = await getSingleProblemTags(pid);
                            break;
                        } catch (err) {
                            console.log(err);
                            if (cnt++ < RETRY_COUNT) {
                                console.log(`Retry ${cnt}/${RETRY_COUNT} for problem ${pid}...`);
                            } else {
                                console.log(`Failed to crawl problem ${pid}!`);
                                break;
                            }
                            let waitTime = WAIT_TIME.crawl_error["other"];
                            if (err instanceof HTTPError) {
                                waitTime = WAIT_TIME.crawl_error["http_" + err.statusCode] || waitTime;
                            } else if (err instanceof TimeoutError) {
                                waitTime = WAIT_TIME.crawl_error["timeout"] || waitTime;
                            }
                            await sleep(waitTime);
                        }
                    }
                    info = loadProblem(problem);
                }
                if (isCache) {
                    lastCrawled = null;
                    lastCatchCount++;
                } else {
                    lastCrawled = pid;
                }
                return info;
            } catch (err) {
                console.log(err);
                return null;
            }
        };
    });

    let tasks_result = await Tasks.run(tasks, {
        max_parallel_tasks: MAX_PARALLEL_TASKS,
        ontaskend({ finished, total }) {
            if (lastCrawled) {
                if (lastCatchCount) {
                    console.log(`Crawling: cache * ${lastCatchCount}`);
                    lastCatchCount = 0;
                }
                console.log(`Crawling ${lastCrawled}: ${finished}/${total} (${(finished / total * 100).toFixed(1)}%)...`);
            }
        }
    });
    if (lastCatchCount) {
        console.log(`Crawling: cache * ${lastCatchCount}`);
    }

    tasks_result.forEach((data, index) => {
        if (!data.failed) {
            res.solved.push(data);
        } else {
            res.solvedUnknown.push(userProfile.passedProblems[index]);
        }
    });

    console.log(`Crawling took ${((Date.now() - res.time) / 1000).toFixed(2)}s.`);
    console.log(`Request count: ${requestCount}`);
    await ResultSaver.save(res, {
        onerror({ filename, error: err }) {
            console.log(`Could not save ${filename}:`);
            console.log(err.toString());
        },
        onend({ basename }) {
            console.log('Results saved to ' + basename);
        }
    });
}

function rlQuestion(rl, msg) {
    return new Promise((resolve) => {
        rl.question(msg, (str) => resolve(str));
    });
}

async function saveCache() {
    try {
        await ProbCache.save();
    } catch (err) {
        console.log('Failed to save cache.');
        console.log(err);
    }
}

(async () => {
    
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.on('SIGINT', async () => {
        console.log('\n');
        console.log('Saving cache...');
        await saveCache();
        console.log('Exiting');
        process.exit(0);
    });

    await ProbCache.init();

    try {
        console.log('Fetching config...');
        lfeConfig = await getConfig();
    } catch (err) {
        console.log(err);
        console.log('Failed to fetch config. Try restarting this program.');
        rl.close();
        process.exit(0);
    }

    for (;;) {
        try {
            await crawlUser(await rlQuestion(rl, 'User ID / Username: '));
            await saveCache();
        } catch (err) {
            console.log('Failed to crawl.');
            console.log(err);
        }
    }

})();
