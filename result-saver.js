
'use strict';

const fs   = require('fs');
const Path = require('path');

const { asyncWork, mkdirEx, existsAsync, parseString } = require('./utility.js');

const BASENAME = 'U<uid>(<username>)_<cnt>';
const RESULTS = [
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
];

function getSaveFile(basename, item) {
    return Path.join(__dirname, item.saveDir,
        parseString(item.filename, { basename }));
}

async function saveItem(res, maker, filename) {
    let content = await maker(res);
    await mkdirEx(filename);
    await asyncWork(fs.writeFile, filename, content, "utf-8");
}

module.exports = {

    get resultTypes() {
        return RESULTS.map((a) => a.name);
    },

    async getContent(res, name) {
        let tmp = RESULTS.find((a) => a.name === name);
        if (!tmp) return null;
        return await tmp.maker(res);
    },

    async save(res, options) {

        let basename;
        
        options = options || {};

        for (let cnt = 1; ; ++cnt) {

            basename = parseString(BASENAME, {
                uid: res.uid,
                username: res.username,
                cnt: cnt
            });

            if (!await existsAsync(getSaveFile(basename, RESULTS[0]))) break;
        }

        for (let i = 0; i < RESULTS.length; ++i) {

            let obj = RESULTS[i];
            let filename;

            try {
                filename = getSaveFile(basename, obj);
                await saveItem(res, obj.maker, filename);
            } catch (err) {
                if (typeof options.onerror === 'function') {
                    options.onerror({
                        name: obj.name,
                        basename: basename,
                        filename: filename,
                        error: err
                    });
                }
            }

        }

        if (typeof options.onend === 'function') {
            options.onend({
                basename: basename
            });
        }
    }
};
