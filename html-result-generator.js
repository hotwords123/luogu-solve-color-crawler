
'use strict';

const Path = require('path');
const ejs  = require('ejs');

const { asyncWork } = require('./utility.js');

const TEMPLATE_FILE = Path.join(__dirname, 'template.ejs');

module.exports = async function(res) {
    return await asyncWork.call(ejs, ejs.renderFile,
        TEMPLATE_FILE, { crawlResult: res }, {});
};
