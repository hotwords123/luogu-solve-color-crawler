
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
const { page_url: PAGE_URL } = require("./crawler.json");

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

async function getProblemInfo(pid) {
    await sleep(WAIT_TIME.each_crawl);
    let content = await requestPageContent( parseString(PAGE_URL.problem, { pid }) );
    let data = getInjectedData(content);
    let problem = data.currentData.problem;
    return {
        pid: pid,
        name: problem.title,
        difficulty: lfeConfig.problemDifficulty.find(a => a.id === problem.difficulty).name,
        algorithms: problem.tags.map(id => {
            let tag = lfeConfig.tags[id];
            return tag.type === 'Algorithm' ? tag.name : null
        }).filter(a => !!a)
    };
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

    console.log(`User ID: ${res.uid}\nUsername: ${res.username}`);

    res.solved = [];
    res.solvedUnknown = [];

    let requestCount = 0, cacheCount = 0;

    let tasks = userProfile.passedProblems.map(({ pid, difficulty, title, type }) => {
        return async () => {
            let cnt = 0;
            for (;;) {
                try {
                    let info = ProbCache.get(pid);
                    if (!info) {
                        ++requestCount;
                        info = await getProblemInfo(pid);
                        if (!info.difficulty) throw new Error("Unknown difficulty");
                        ProbCache.set(pid, info);
                    } else {
                        ++cacheCount;
                    }
                    return info;
                } catch (err) {
                    console.log(err.toString());
                    if (cnt++ < RETRY_COUNT) {
                        console.log(`Retry ${cnt}/${RETRY_COUNT} for problem ${pid}...`);
                    } else {
                        console.log(`Failed to crawl problem ${pid}!`);
                        return null;
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
        };
    });

    let tasks_result = await Tasks.run(tasks, {
        max_parallel_tasks: MAX_PARALLEL_TASKS,
        ontaskend({ finished, total }) {
            console.log(`Crawling: ${finished}/${total} (${(finished / total * 100).toFixed(1)}%)...`);
        }
    });

    tasks_result.forEach((data, i) => {
        if (data) {
            res.solved.push(data);
        } else {
            res.solvedUnknown.push(userProfile.passedProblems[i].pid);
        }
    });

    console.log(`Crawling took ${((Date.now() - res.time) / 1000).toFixed(2)}s.`);
    console.log(`Request count: ${requestCount}`);
    console.log(`Cache count: ${cacheCount}`);
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
