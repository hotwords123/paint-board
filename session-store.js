
const fs   = require('fs');
const Path = require('path');

class SessionStore {
    constructor(dir) {
        this.dir = dir;
        this.cache = new Map();
        try {
            fs.statSync(this.dir);
        } catch (err) {
            fs.mkdirSync(this.dir);
        }
    }
    getPath(sid) {
        return Path.join(this.dir, sid.replace(/\./g, '_') + '.json');
    }
    async get(sid) {
        if (sid in this.cache) return this.cache[sid];
        try {
            let session = JSON.parse(await fs.promises.readFile(this.getPath(sid), 'utf8'));
            this.cache[sid] = session;
            return session;
        } catch (err) {
            return null;
        }
    }
    async set(sid, session) {
        this.cache[sid] = session;
        await fs.promises.writeFile(this.getPath(sid), JSON.stringify(session), 'utf8');
    }
    async destroy(sid) {
        this.cache[sid] = null;
        await fs.promises.unlink(this.getPath(sid));
    }
}

module.exports = SessionStore;
