
'use strict';

const fs   = require('fs');
const Path = require('path');

module.exports = {

    dir: Path.join(__dirname, 'modules'),
    list: [],

    load() {
        let files = fs.readdirSync(this.dir);
        files.forEach((filename) => {
            let tmp = filename.match(/^(.+)\.js$/);
            if (tmp) {
                let name = tmp[1];
                let path = Path.join(this.dir, filename);
                let inst = require(path);
                this.list.push({ name, path, inst });
            }
        });
    },

    get(name) {
        return require(Path.join(this.dir, name));
    }

};
