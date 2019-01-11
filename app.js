
'use strict';

const http     = require('http');
const Path     = require('path');
const readline = require('readline');
const Util     = require('util');

const Koa        = require('koa');
const Router     = require('koa-router');
const IO         = require('socket.io');

const logger       = require('./logger');
const SessionStore = require('./session-store');
const util         = require('./utility');
const {
    ClientError, NotFoundError, UnknownError, InternalServerError
} = util;

let User = null;

module.exports = {

    initEvents() {
        this._events = {};
    },
    on(name, fn) {
        if (typeof fn !== 'function') {
            throw new TypeError('fn must be a function');
        }
        if (!this._events[name]) {
            this._events[name] = [];
        }
        this._events[name].push(fn);
    },
    off(name, fn) {
        let arr = this._events[name];
        if (arr) {
            if (fn) {
                let p = arr.indexOf(fn);
                if (p) arr.splice(p, 1);
            } else {
                arr.splice(0, arr.length);
            }
        }
    },
    async emit(name, ...arg) {
        let arr = this._events[name];
        if (arr && arr.length) {
            for (let i = 0; i < arr.length; ++i) {
                try {
                    await arr[i].apply(this, arg);
                } catch (err) {
                    await this.emit('error', err);
                }
            }
            return true;
        }
        if (name === 'error') throw arg[0];
        return false;
    },

    initCommands() {
        this.on('command:stop', () => {
            this.stop();
        });
        this.on('command:force-stop', () => {
            this.emit('afterStop').then(() => {
                process.exit(0);
            });
        });
        this.on('command:stop!!!', () => {
            process.exit(0);
        });
    },

    /**
     * Server startup function.
     */
    
    async startup() {

        this.rootDir = __dirname;

        const config = this.config = require('./config.json');
        if (typeof config.bg_color === 'string') {
            let pos = config.colors.indexOf(config.bg_color);
            if (pos === -1) pos = 0;
            config.bg_color = pos;
        }

        this.util = util;

        this.production = process.env.NODE_ENV === 'production';
        if (this.production) {
            logger.log('Server is running in production mode.');
        }

        /* EventEmitter Extended */
        this.initEvents();

        /* Console Commander */
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: ''
        });
        this.rl.on('line', (str) => {
            let tmp = str.split(/\s+/);
            let command = tmp[0];
            let options = tmp.slice(1);
            this.emit('command:' + command, ...options).then((ret) => {
                if (!ret) {
                    logger.log('Unknown command: ' + command);
                }
            });
        });
        
        this.initCommands();

        /* Koa Instance */
        let app = this.app = new Koa();

        /* Using logger to report error */
        app.silent = true;
        
        /* Logger & Response Time */
        app.use(async (ctx, next) => {
            let timeStart = Date.now();
            await next();
            let timeUsed = Date.now() - timeStart;
            ctx.set('X-Response-Time', timeUsed);
            logger.log(`${ctx.method} ${ctx.url} - ${ctx.status} ${http.STATUS_CODES[ctx.status] || 'Unknown'} (${timeUsed}ms)`);
        });
        
        /* API Judging */
        app.use(async (ctx, next) => {
            ctx.state.isAPI = ctx.url.toLowerCase().startsWith('/api/');
            await next();
        });
        
        /* REST API */
        app.use(async (ctx, next) => {
            if (ctx.state.isAPI) {
                ctx.rest = (err, data, data2) => {
                    ctx.status = 200;
                    ctx.response.type = 'application/json';
                    if (err) {
                        ctx.response.body = {
                            error: err,
                            message: data || err.message,
                            result: data2 || null
                        };
                    } else {
                        ctx.response.body = {
                            error: null,
                            result: data
                        };
                    }
                };
            }
            await next();
        });
        
        /* ejs */
        app.use(require('koa-views')(Path.join(__dirname, 'views'), {
            extension: 'ejs'
        }));
        
        /* Error Handling */
        app.use(async (ctx, next) => {
            try {
                await next();
            } catch (err) {

                let isAPI = ctx.state.isAPI;
                let isClientError = err instanceof ClientError;

                let err_user = err;
                
                if (!isClientError) {
                    logger.error(err);
                    err_user = new InternalServerError(err);
                }

                if (isAPI) {
                    ctx.rest(err_user.id, err_user.message, err_user.data);
                } else {
                    ctx.status = err_user.statusCode;
                    if (err_user.statusCode === 404) {
                        await ctx.render('404', { ctx, message: err_user.message });
                    } else {
                        await ctx.render('error', { ctx, err: err_user });
                    }
                }

            }
        });
        
        /* Static Files */
        app.use(require('koa-static')(Path.join(__dirname, 'static'), {
            maxAge: this.production ? 3600 * 24 * 3 : 0
        }));

        /* POST Body Parser */
        app.use(require('koa-body')({
            text: false,
            urlencoded: true,
            json: true,
            jsonStrict: true,
            jsonLimit: '64kb',
            formLimit: '4mb'
        }));

        this.sessions = new SessionStore(Path.join(__dirname, 'sessions'));

        /* Session */
        app.use(async (ctx, next) => {
            let sid = ctx.ip;
            ctx.state.sid = sid;
            ctx.state.session = await this.sessions.get(sid);
            await next();
        });
        
        /* Router */
        
        this.router = new Router();
        this.router_api = new Router({
            prefix: '/api'
        });
        
        app.use(this.router.middleware());
        app.use(this.router_api.middleware());
        
        /* 404 Handler */
        app.use(async (ctx, next) => {
            throw new NotFoundError();
        });
        
        /* Final Error Handling */
        app.on('error', (err, ctx) => {
            logger.error(err);
        });

        /* Create HTTP Server */
        this.server = http.createServer(this.app.callback());
        this.server.setTimeout(20000);

        /* Load socket.io */
        this.io = IO(this.server);
        
        /* Init Modules */
        this.modules = require('./modules');

        /* Load Modules */
        this.modules.load();
    },

    async work() {

        let { hostname, port } = this.config;

        /* Start listening */
        this.server.listen(parseInt(port), hostname, () => {
            logger.log(`Server is listening on ${ hostname || '*' }:${ port }...`);
        });
    },

    stop(reason, data) {
        logger.log('emit: beforeStop');
        this.emit('beforeStop', reason, data).then(() => {
            logger.log('Server stopping...');
            this.server.close(() => {
                logger.log('emit: afterStop');
                this.emit('afterStop', reason, data).then(() => {
                    logger.log('Server stopped.');
                    process.exit(0);
                });
            });
        });
    }

};
