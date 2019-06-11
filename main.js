
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
const { page_url: PAGE_URL, selectors: SELECTORS } = require("./crawler.json");

async function getUID(user) {
    let content = await requestPageContent( parseString(PAGE_URL.getuid, { user: user }) );
    return JSON.parse(content);
}

async function getUserProfile(uid) {
    let content = await requestPageContent( parseString(PAGE_URL.profile, { uid: uid }) );
    let $ = cheerio.load(content);
    let res = {};
    let tmp = $(SELECTORS.userProfile.username).text().match(/^U-?\d+ (.+)$/);
    res.username = tmp ? tmp[1] : "";
    res.submitTotal = $(SELECTORS.userProfile.submitTotal).text();
    res.solvedTotal = $(SELECTORS.userProfile.solvedTotal).text();
    res.solved = [];
    let $h2 = $('h2');
    let $solvedBox = null;
    $h2.each((i, a) => {
        if ($(a).text() === '通过题目') {
            $solvedBox = $(a).parent();
            return false;
        }
        return true;
    });
    $solvedBox.find('div>a')
        .each((i, a) => res.solved.push($(a).text()));
    return res;
}

async function getProblemInfo(pid, callback) {
    await sleep(WAIT_TIME.each_crawl);
    let content = await requestPageContent( parseString(PAGE_URL.problem, { pid: pid }) );
    let $ = cheerio.load(content);
    let algorithms = [];
    $(SELECTORS.problemInfo.tagAlgorithm).each((i, a) => algorithms.push($(a).text()));
    return {
        pid: pid,
        name: $(SELECTORS.problemInfo.problemName).text().trim().slice(pid.length + 1),
        difficulty: $(SELECTORS.problemInfo.tagDifficulty).text(),
        algorithms: algorithms
    };
}

async function crawlUser(user) {

    let uid_data = await getUID(user);

    if (uid_data.code !== 200) {
        console.log("Cannot get uid: " + uid_data["message"]);
        return;
    }

    let uid = parseInt(uid_data["more"].uid);
    
    let res = {};

    res.time = Date.now();
    res.uid = uid;

    console.log('Crawling user profile...');

    let userProfile = await getUserProfile(uid);
    let solved_list = userProfile.solved;

    res.username = userProfile.username;
    res.submitTotal = userProfile.submitTotal;
    res.solvedTotal = userProfile.solvedTotal;

    console.log(`User ID: ${uid}\nUsername: ${userProfile.username}`);

    res.solved = [];
    res.solvedUnknown = [];

    let requestCount = 0, cacheCount = 0;

    let tasks = solved_list.map((pid) => {
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
            res.solvedUnknown.push(solved_list[i]);
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

(async () => {
    
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    await ProbCache.init();

    for (;;) {
        try {
            await crawlUser(await rlQuestion(rl, 'User ID / Username: '));
        } catch (err) {
            console.log('Failed to crawl.');
            console.log(err);
        }
    }

})();
