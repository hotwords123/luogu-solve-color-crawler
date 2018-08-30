
'use strict';

module.exports.run = function(tasks, options) {

    return new Promise((resolve) => {

        options = Object.assign({
            max_parallel_tasks: 1,
            ontaskstart: () => {},
            ontaskend: () => {},
        }, options || {});
    
        let cur = 0, cnt = 0;
        let results = new Array(tasks.length);
    
        function nextTask() {
            if (cur === tasks.length) {
                if (cnt === tasks.length) resolve(results);
                return;
            }
            let i = cur;
            tasks[cur++]().then((data) => {
                results[i] = data;
                options.ontaskend({
                    current: i,
                    success: true,
                    result: data,
                    finished: ++cnt,
                    total: tasks.length
                });
                nextTask();
            }).catch((err) => {
                options.ontaskend({
                    current: i,
                    success: false,
                    result: null,
                    finished: ++cnt,
                    total: tasks.length
                });
                nextTask();
            });
            options.ontaskstart(i);
        }
    
        for (let i = 0; i < options.max_parallel_tasks; ++i) nextTask();
    });
};
