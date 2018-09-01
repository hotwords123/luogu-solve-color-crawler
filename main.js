
'use strict';

console.log('Loading modules...');

const fs       = require('fs');
const Path     = require('path');
const readline = require('readline');

const cheerio  = require('cheerio');

const Tasks    = require('./tasks.js');

const { asyncWork, sleep, existsAsync, mkdirEx, parseString } = require("./utility.js");
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
	$(SELECTORS.userProfile.solvedListItem)
		.each((i, a) => res.solved.push($(a).text()));
	return res;
}

async function getProblemInfo(pid) {
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

let ResultSaver = {
	
	BASENAME: 'U<uid>(<username>)_<cnt>',
	RESULTS: [
		{
			name: "JSON",
			saveDir: "results_raw",
			filename: "<basename>.json",
			maker: (data) => JSON.stringify(data)
		},
		{
			name: "Text",
			saveDir: "results",
			filename: "<basename>.txt",
			maker: require('./text-result-generator.js')
		},
		{
			name: "HTML",
			saveDir: "results_html",
			filename: "<basename>.html",
			maker: require('./html-result-generator.js')
		},
		{
			name: "Markdown",
			saveDir: "results_markdown",
			filename: "<basename>.md",
			maker: require('./markdown-result-generator.js')
		}
	],

	getSaveFile(basename, item) {
		return Path.join(__dirname, item.saveDir,
			parseString(item.filename, { basename }));
	},

	async _save(res, maker, filename) {
		let content = await maker(res);
		await mkdirEx(filename);
		await asyncWork(fs.writeFile, filename, content, "utf-8");
	},

	async saveType(res, name, basename) {
		let tmp = this.RESULTS.findIndex((a) => a.name === name);
		let filename = this.getSaveFile(basename, tmp);
		this._save(res, tmp.maker, filename);
	},

	async save(res) {

		let basename;

		for (let cnt = 1; ; ++cnt) {

			basename = parseString(this.BASENAME, {
				uid: res.uid,
				username: res.username,
				cnt: cnt
			});

			if (!await existsAsync(this.getSaveFile(basename, this.RESULTS[0]))) break;
		}

		for (let i = 0; i < this.RESULTS.length; ++i) {

			try {
				let filename = this.getSaveFile(basename, this.RESULTS[i]);
				this._save(res, this.RESULTS[i].maker, filename);
			} catch (err) {
				console.log(`Could not save ${Path.basename(filename)}:`);
				console.log(err.toString());
			}

		}

		console.log('Results saved to ' + basename);
	}
};

async function crawlUser(user) {

	let uid_data = await getUID(user);

	if (uid_data.code !== 200) {
		console.log("Cannot get uid: " + uid_data["message"]);
		return;
	}

	let uid = uid_data["more"].uid;
	
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

	let tasks = solved_list.map((pid) => {
		return async () => {
			let cnt = 0;
			await sleep(WAIT_TIME.each_crawl);
			for (;;) {
				try {
					let info = await getProblemInfo(pid);
					if (!info.difficulty) throw new Error("Unknown difficulty");
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
	await ResultSaver.save(res);
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

	for (;;) {
		try {
			await crawlUser(await rlQuestion(rl, 'User ID / Username: '));
		} catch (err) {
			console.log('Failed to crawl.');
			console.log(err);
		}
	}

})();
