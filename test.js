
var Painter = {

    W: 1600,
    H: 800,
    destStr: localStorage.getItem('dest') || '', // 这里填图片信息

    ws: null,
    board: null,
    dest: null,
    queue: [],

    async init() {
        this.board = this.createBoard(null);
        await this.initWS();
        this.initTimer();
        console.log('Painter loaded.');
    },
    async initWS() {
        this.ws = window.socket;
        socket.on('update', (x, y, color) => {
            this.onUpdate({x, y, color});
        });
        await this.fetchBoard();
    },
    createBoard(val = null) {
        var res = [];
        for (let i = 0; i < this.W; ++i) {
            res[i] = [];
            for (let j = 0; j < this.H; ++j) {
                res[i][j] = val;
            }
        }
        return res;
    },
    loadBoardFromBuffer(buf) {
        var arr = new Uint8Array(buf);
        for (var x = 0; x < width; ++x) {
            for (var y = 0; y < height; ++y) {
                this.board[x][y] = arr[x + y * width];
            }
        }
    },
    fetchBoard() {
        return new Promise((resolve) => {
            socket.emit('get board', (buf) => {
                this.loadBoardFromBuffer(buf);
                console.log("Board loaded.");
                resolve();
            });
        });
    },
    async paintTile(x, y, color) {
        socket.emit('paint', x, y, color);
    },
    posInQueue(x, y) {
        return this.queue.findIndex((o) => o.x === x && o.y === y);
    },
    onUpdate({x, y, color}) {
        x = +x; y = +y; color = +color;
        var old = this.board[x][y];
        if (old === color) return;
        this.board[x][y] = color;
        if (!this.dest) return;
        var dest = this.dest[x][y];
        if (dest === null) return;
        //console.log(`Updated: ${x},${y} = ${color} ${color === dest ? 'ok' : 'no'}`);
        var pos = this.posInQueue(x, y);
        if (color === dest) {
            if (pos !== -1) this.queue.splice(pos, 1);
        } else {
            if (pos === -1) {
                this.queue.push({x, y});
            }
        }
    },
    async onPaintTile() {
        var cnt = 0;
        while (this.queue.length) {
            var pos = Math.floor(Math.random() * this.queue.length);
            var {x, y} = this.queue[pos];
            var dest = this.dest[x][y];
            if (this.board[x][y] === dest) {
                this.queue.splice(pos, 1);
                continue;
            }
            try {
                //console.log(`Painting: ${x},${y} = ${dest}`);
                await this.paintTile(x, y, dest);
                //console.log(`Painted: ${x},${y} = ${dest}`);
            } catch (err) {}
            if (++cnt > 500) break;
        }
        if (!this.queue.length) {
            console.log("queue empty, paint ok");
        }
    },
    loadDestFromString(str) {
        this.dest = this.createBoard(null);
        this.queue = [];
        str.replace(/\s/g, '').split(';').forEach((a) => {
            var tmp = a.match(/^(\d+),(\d+)=(\d+)$/);
            if (!tmp) return;
            var [, x, y, color] = tmp;
            x = +x; y = +y; color = +color;
            this.dest[x][y] = color;
            if (this.board[x][y] !== color) {
                this.queue.push({ x, y });
            }
        });
    },
    initTimer() {
        this.tPaintTile = setInterval(this.onPaintTile.bind(this), 0);
        //this.tFetchDest = setInterval(this.onFetchDest.bind(this), 20000);
        //this.onFetchDest();
        this.loadDestFromString(this.destStr);
    }

};

Painter.init();
