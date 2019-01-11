
'use strict';

const fs = require('fs');
const Path = require('path');
const { EventEmitter } = require('events');

const Lock = require('./lock');

class Block {
    constructor({ width, height, bgColor = 0, data }) {
        this.width = width;
        this.height = height;
        this.data = data || Buffer.alloc(width * height, bgColor);
    }
    pos(x, y) {
        if (x < 0 || y < 0 || x >= this.width || y >= this.height) return -1;
        return x + y * this.width;
    }
    get(x, y) {
        let pos = this.pos(x, y);
        return pos === -1 ? this.bgColor : this.data[pos];
    }
    set(x, y, color) {
        let pos = this.pos(x, y);
        if (pos !== -1) this.data[pos] = color;
    }
    fromBlock(block, dx = 0, dy = 0, sx = 0, sy = 0, cx = block.width, cy = block.height) {
        for (let x = 0; x < cx; ++x) {
            for (let y = 0; y < cy; ++y) {
                this.set(dx + x, dy + y, block.get(sx + x, sy + y));
            }
        }
    }
    static async fromFile(filename, width, height) {
        return new Block({
            width, height,
            data: await fs.promises.readFile(filename)
        });
    }
    async readFrom(filename, width, height, dx = 0, dy = 0, sx = 0, sy = 0, cx = width, cy = height) {
        let block = await Block.fromFile(filename, width, height);
        this.fromBlock(block, dx, dy, sx, sy, cx, cy);
    }
    async writeTo(filename, sx = 0, sy = 0, cx = this.width, cy = this.height) {
        let block = new Block({
            width: cx,
            height: cy
        });
        block.fromBlock(this, 0, 0, sx, sy, cx, cy);
        await fs.promises.writeFile(filename, block.data);
    }
}

class BoardManager extends EventEmitter {

    constructor({ width, height, blockSize, colors, bgColor, dir }) {

        if (colors.length > 256) throw new Error('too many colors');

        super();

        this.version = '1.0';
        this.width = width;
        this.height = height;
        this.blockSize = blockSize;
        this.colors = colors.slice(0);
        this.bgColor = bgColor;
        this.dir = dir;
    }

    async init() {

        let blockSize = this.blockSize;

        await this.makeDir();

        this.cxBlocks = Math.ceil(this.width / blockSize);
        this.cyBlocks = Math.ceil(this.height / blockSize);

        this.blockX = [];
        for (let x = 0; x < this.cxBlocks; ++x) {
            this.blockX[x] = blockSize * x;
        }
        this.blockX[this.cxBlocks] = this.width;

        this.blockY = [];
        for (let y = 0; y < this.cyBlocks; ++y) {
            this.blockY[y] = blockSize * y;
        }
        this.blockY[this.cyBlocks] = this.height;

        this.f_manifest = Path.join(this.dir, 'board.json');

        this.board = new Block({
            width: this.width,
            height: this.height,
            bgColor: this.bgColor
        });
        try {
            await this.loadBoard();
        } catch (err) {}

        this.blockSaved = [];
        for (let x = 0; x < this.cxBlocks; ++x) {
            this.blockSaved[x] = [];
            for (let y = 0; y < this.cyBlocks; ++y) {
                this.blockSaved[x][y] = false;
            }
        }

        this.manifestLock = new Lock();
        
        this.blockLocks = [];
        for (let x = 0; x < this.cxBlocks; ++x) {
            this.blockLocks[x] = [];
            for (let y = 0; y < this.cyBlocks; ++y) {
                this.blockLocks[x][y] = new Lock();
            }
        }

        await this.saveAll();
    }

    async makeDir() {
        try {
            await fs.promises.stat(this.dir);
        } catch (err) {
            await fs.promises.mkdir(this.dir);
        }
    }

    getBlockFile(x, y) {
        return Path.join(this.dir, `block-${x}-${y}`);
    }

    async loadBoard() {
        let data = JSON.parse(await fs.promises.readFile(this.f_manifest, 'utf8'));
        if (data.version !== this.version) throw new Error('version does not match');
        if (this.colors.join(',').indexOf(data.colors.join(',')) !== 0) throw new Error('colors do not match');

        let { width, height, cxBlocks, cyBlocks, blockX, blockY } = data;

        for (let x = 0; x < cxBlocks; ++x) {
            for (let y = 0; y < cyBlocks; ++y) {
                let fn = this.getBlockFile(x, y);
                await this.board.readFrom(fn,
                    blockX[x + 1] - blockX[x], blockY[y + 1] - blockY[y],
                    blockX[x], blockY[y]);
                if (x >= this.cxBlocks || y >= this.cyBlocks) {
                    await fs.promises.unlink(fn);
                }
            }
        }
    }

    async saveManifest() {
        let data = {
            version:  this.version,
            width:    this.width,
            height:   this.height,
            cxBlocks: this.cxBlocks,
            cyBlocks: this.cyBlocks,
            blockX:   this.blockX,
            blockY:   this.blockY,
            colors:   this.colors
        };
        await this.manifestLock.exec(async () => {
            await fs.promises.writeFile(this.f_manifest, JSON.stringify(data, null, "  "), 'utf8');
        });
    }
    async saveBlock(x, y, force = false) {
        if (!force && this.blockSaved[x][y]) return;
        this.blockSaved[x][y] = true;
        await this.blockLocks[x][y].exec(async () => {
            await this.board.writeTo(this.getBlockFile(x, y),
                this.blockX[x], this.blockY[y],
                this.blockX[x + 1] - this.blockX[x],
                this.blockY[y + 1] - this.blockY[y]);
        });
    }
    async saveBlocks(force = false) {
        for (let x = 0; x < this.cxBlocks; ++x) {
            for (let y = 0; y < this.cyBlocks; ++y) {
                await this.saveBlock(x, y, force);
            }
        }
    }
    async saveAll(force = true) {
        await this.saveManifest();
        await this.saveBlocks(force);
    }

    getBlockId(x, y) {
        return [Math.floor(x / this.blockSize), Math.floor(y / this.blockSize)];
/*      let X, Y;
        for (X = 0; this.blockX[X] > x; ++X);
        for (Y = 0; this.blockY[Y] > y; ++Y);
        return [X, Y];*/
    }

    getPixel(x, y) {
        return this.board.get(x, y);
    }
    setPixel(x, y, color, save = false) {
        this.board.set(x, y, color);
        let [X, Y] = this.getBlockId(x, y);
        this.blockSaved[X][Y] = false;
        this.emit('pixelUpdate', x, y, color);
        if (save) {
            return this.saveBlock(X, Y);
        }
    }
    getBoard() {
        return this.board.data;
    }
    getBoardArea(x, y, cx, cy) {
        let block = new Block({
            width: cx,
            height: cy,
            bgColor: this.bgColor
        });
        block.fromBlock(this.board, 0, 0, x, y, cx, cy);
        return block.data;
    }

}

module.exports = BoardManager;
