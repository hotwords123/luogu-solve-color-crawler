
'use strict';

console.log('Loading modules...');

const fs       = require('fs');
const url      = require('url');
const Path     = require('path');
const readline = require('readline');
const https    = require('https');
const ejs      = require('ejs');
const cheerio  = require('cheerio');

const SAVE_FILE_DIR = Path.join(__dirname, 'results/');
const SAVE_FILE_JSON_DIR = Path.join(__dirname, 'results_raw/');
const SAVE_FILE_HTML_DIR = Path.join(__dirname, 'results_html/');

const SAVE_FILE_BASENAME = 'U<uid>(<username>)_<cnt>';

const SAVE_FILE = Path.join(SAVE_FILE_DIR, '<basename>.txt');
const SAVE_FILE_JSON = Path.join(SAVE_FILE_JSON_DIR, '<basename>.json');
const SAVE_FILE_HTML = Path.join(SAVE_FILE_HTML_DIR, '<basename>.html');

const HTML_TEMPLATE_FILE = Path.join(__dirname, 'template.ejs');

const PAGE_URL = {
	problem: 'https://www.luogu.org/problemnew/show/<pid>',
	profile: 'https://www.luogu.org/space/show?uid=<uid>'
};

const SELECTORS = {
	userProfile: {
		username: '.lg-toolbar>h1',
		submitTotal: 'li:first-child .lg-bignum-num',
		solvedTotal: 'li:last-child .lg-bignum-num',
		solvedListItem: '.am-u-md-4.lg-right .lg-article.am-hide-sm:nth-child(2) a'
	},
	problemInfo: {
		problemName: '.lg-toolbar>h1',
		tagAlgorithm: '.lg-tag.lg-bg-pink.am-hide',
		tagDifficulty: '.lg-summary-content ul>li:nth-child(5)>span>span'
	}
};

const TIMEOUT = {
	request: 2000,
	response: 2000
};

const CRLF = '\r\n';
const RETRY_COUNT = 3;
const USER_AGENT = 'luogu-solve-color-crawler/1.0';

function asyncWork(fn, ...arg) {
	return new Promise((resolve, reject) => {
		fn.call(this, ...arg, (err, data) => {
			if (err) reject(err);
			else resolve(data);
		});
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

function httpsRequest(options, data) {
	return new Promise((resolve, reject) => {
		let req = https.request(options, (res) => {
			if (res.statusCode === 200) {
				resolve(res);
			} else {
				reject(new Error(`HTTP Error ${res.statusCode}`));
			}
		});
		req.on('error', (err) => reject(err));
		req.on('timeout', () => reject(new Error("Request timeout")));
		if (data) req.write(data);
		req.end();
	});
}

async function requestPage(dest, method, headers) {
	let options = Object.assign({}, url.parse(dest));
	options.method = method || 'GET';
	options.headers = Object.assign({}, headers);
	options.timeout = TIMEOUT.request;
	return await httpsRequest(options);
}

function requestPageContent(dest, method, headers, encoding) {
	return new Promise(async function(resolve, reject) {
		try {
			let resp = await requestPage(dest, method, headers);
			let res = '';
			let timeout;
			resp.setEncoding(encoding || 'utf-8');
			resp.on('data', (chunk) => { res += chunk; });
			resp.on('end', () => {
				resolve(res);
				clearTimeout(timeout);
			});
			timeout = setTimeout(() => reject(new Error("Response timeout")), TIMEOUT.response);
		} catch (err) {
			reject(err);
		}
	});
}

async function getUserProfile(uid) {
	let content = await requestPageContent(
		parseString(PAGE_URL.profile, {
			uid: uid
		}), 'GET', {
			'User-Agent': USER_AGENT
		});
	let $ = cheerio.load(content);
	let res = {};
	res.username = $(SELECTORS.userProfile.username).text().match(/^U-?\d+ (.+)$/)[1];
	res.submitTotal = $(SELECTORS.userProfile.submitTotal).text();
	res.solvedTotal = $(SELECTORS.userProfile.solvedTotal).text();
	res.solved = [];
	$(SELECTORS.userProfile.solvedListItem)
		.each((i, a) => res.solved.push($(a).text()));
	return res;
}

async function getProblemInfo(pid) {
	let content = await requestPageContent(
		parseString(PAGE_URL.problem, {
			pid: pid
		}), 'GET', {
			'User-Agent': USER_AGENT
		});
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

function generateSummaryResult(sections, res) {
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

function generateDifficultyResult(sections, solved) {

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

function generateAlgorithmResult(sections, solved) {

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

function generateUnknownResult(sections, arr) {
	
	if (!arr.length) return;

	sections.push({
		title: '未知题目',
		detail: arr
	});
}

function generateResult(res) {

	const SEPARATOR = '--------------------';

	let sections = [];

	generateSummaryResult(sections, res);
	generateDifficultyResult(sections, res.solved);
	generateAlgorithmResult(sections, res.solved);
	generateUnknownResult(sections, res.solvedUnknown);

	return [].concat(...sections.map((section) => [section.title, SEPARATOR].concat(section.detail).join(CRLF))).join(CRLF + CRLF);
}

async function crawlUser(uid) {

	let res = {};

	uid = parseInt(uid);
	if (isNaN(uid)) throw new Error("Invalid UID");

	console.log('Crawling user profile...');
	let userProfile = await getUserProfile(uid);
	let solved_list = userProfile.solved;

	res.time = Date.now();
	res.uid = uid;
	res.username = userProfile.username;
	res.submitTotal = userProfile.submitTotal;
	res.solvedTotal = userProfile.solvedTotal;
	res.solved = [];
	res.solvedUnknown = [];

	for (let i = 0; i < solved_list.length; ++i) {
		let pid = solved_list[i];
		console.log(`Crawling problem ${pid} (${i+1} of ${solved_list.length})...`);
		let cnt = 0;
		for (;;) {
			try {
				let info = await getProblemInfo(pid);
				if (!info.difficulty) throw new Error("Unknown difficulty");
				res.solved.push(info);
				break;
			} catch (err) {
				console.log(err.toString());
				if (cnt++ < RETRY_COUNT) {
					console.log(`Retry ${cnt}/${RETRY_COUNT}...`);
				} else {
					console.log(`Could not get data for ${pid}!`);
					res.solvedUnknown.push(pid);
					break;
				}
			}
		}
	}

	let str = generateResult(res);
	let basename, pathname, cnt = 0;
	await mkdirEx(SAVE_FILE_DIR);
	await mkdirEx(SAVE_FILE_JSON_DIR);
	await mkdirEx(SAVE_FILE_HTML_DIR);
	do {
		basename = parseString(SAVE_FILE_BASENAME, {
			uid: uid,
			username: res.username,
			cnt: ++cnt
		});
		pathname = parseString(SAVE_FILE, { basename: basename });
	} while (await existsAsync(pathname));
	await asyncWork(fs.writeFile, pathname, str, 'utf-8');
	pathname = parseString(SAVE_FILE_JSON, { basename: basename });
	await asyncWork(fs.writeFile, pathname, JSON.stringify(res), 'utf-8');
	pathname = parseString(SAVE_FILE_HTML, { basename: basename });
	let content = await asyncWork.call(ejs, ejs.renderFile, HTML_TEMPLATE_FILE, {
		crawlResult: res
	}, {});
	await asyncWork(fs.writeFile, pathname, content, 'utf-8');
	console.log('Results saved to ' + basename);
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
			await crawlUser(await rlQuestion(rl, 'User id: '));
		} catch (err) {
			console.log('Failed to crawl.');
			console.log(err);
		}
	}

})();
