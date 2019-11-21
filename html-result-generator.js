
'use strict';

const fs = require('fs-extra');
const Path = require('path');
const os = require('os');

const VIEW_DIR = Path.join(__dirname, 'view');
const TEMPLATE_FILE = Path.join(VIEW_DIR, 'index.html');
const JQUERY_FILE = Path.join(VIEW_DIR, 'jquery.min.js');
const SCRIPT_FILE = Path.join(VIEW_DIR, 'script.js');
const STYLE_FILE = Path.join(VIEW_DIR, 'style.css');

module.exports = async (res) => {

    let template = await fs.readFile(TEMPLATE_FILE, 'utf-8');
    
    // #delete ~ #/delete
    const delBegin = '<!-- #delete -->', delEnd = '<!-- #/delete -->'
    let begin = 0;
    while (true) {
        begin = template.indexOf(delBegin, begin);
        if (begin === -1) break;
        let end = template.indexOf(delEnd, begin + delBegin.length);
        if (end === -1) break;
        template = template.slice(0, begin) + template.slice(end + delEnd.length);
    }

    // @param
    let params = {
        jquery: [
            '<script type="text/javascript">',
            await fs.readFile(JQUERY_FILE, 'utf-8'),
            '</script>'
        ].join(os.EOL),
        script: [
            '<script type="text/javascript">',
            await fs.readFile(SCRIPT_FILE, 'utf-8'),
            '</script>',
            '<!-- #inject_data -->',
            '<script type="text/javascript">',
            'initView(' + JSON.stringify(res) + ');',
            '</script>',
            '<!-- #/inject_data -->'
        ].join(os.EOL),
        style: [
            '<style type="text/css">',
            await fs.readFile(STYLE_FILE, 'utf-8'),
            '</style>'
        ].join(os.EOL)
    };
    template = template.replace(/<!-- @(\S+) -->/g, (match, p1) => params[p1] || match);

    return template;
};
