
'use strict';

module.exports = {

    log(s) {
        let str = `[${new Date().toLocaleString()}] ${s}`;
        console.log(str);
    },

    error(err) {
        let str = `[${new Date().toLocaleString()}] ${err.stack}`;
        console.error(str);
    }
    
};
