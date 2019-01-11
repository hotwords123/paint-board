
'use strict';

const Path = require('path');

let router = server.router;
let io = server.io.of('/board/ws');

const BoardManager = require('../board-manager');
const boardConfig = server.config.board;
const logger = require('../logger');
const { ClientError } = require('../utility');

const Board = new BoardManager({
    width: boardConfig.width,
    height: boardConfig.height,
    blockSize: boardConfig.block_size,
    colors: server.config.colors,
    bgColor: server.config.bg_color,
    dir: Path.join(server.rootDir, 'data', 'paint-board')
});

(async () => {
    
    let timeInit = Date.now();
    await Board.init();
    logger.log(`Board initialized (${Date.now() - timeInit}ms).`);

    router.get('/board', async (ctx) => {
        await ctx.render('board', { ctx });
    });
    
    let clients = new Map();
    
    io.on('connection', (socket) => {
        
        let cid = socket.id;
    
        clients.set(cid, socket);
    
        function socket_on(name, fn) {
            return socket.on(name, (...arg) => {
                let cb = arg[arg.length - 1];
                try {
                    let data = fn.apply(this, arg);
                    if (typeof data !== 'undefined') cb(data);
                } catch (err) {
                    socket.emit('error message', {
                        id: err.id,
                        message: err.message
                    });
                }
            });
        }
    
        socket.on('disconnect', () => {
            clients.delete(cid);
            socket = null;
        });
    
        socket.on('error', () => {
            socket.disconnect();
        });

        socket_on('get board', () => {
            return Board.getBoard();
        });
    
        socket_on('get chunk', (x, y, cx, cy) => {
            let flag = !Number.isInteger(x) || !Number.isInteger(y)
                || !Number.isInteger(cx) || !Number.isInteger(cy)
                || cx <= 0 || cy <= 0;
            if (flag) throw new ClientError('base:parameter_error');
            if (cx * cy > 1048576) throw new ClientError('get_chunk:chunk_too_big');
            return Board.getBoardArea(x, y, cx, cy);
        });

        socket_on('paint', (x, y, color) => {

            let flag = !Number.isInteger(x) || !Number.isInteger(y)
                || !Number.isInteger(color)
                || color < 0 || color >= Board.colors.length;
            if (flag) throw new ClientError('base:parameter_error');

            if (x < 0 || y < 0 || x >= Board.width || y >= Board.height) {
                throw new ClientError('paint:out_of_board');
            }

            Board.setPixel(x, y, color);
        });

    });

    Board.on('pixelUpdate', (x, y, color) => {
        clients.forEach((socket) => {
            socket.emit('update', x, y, color);
        });
    });

    async function saveBoard(force) {
        let time = Date.now();
        await Board.saveBlocks(force);
        logger.log(`Board saved (${Date.now() - time}ms).`);
    }

    async function saveAll() {
        let time = Date.now();
        await Board.saveAll();
        logger.log(`Board all saved (${Date.now() - time}ms).`);
    }

    setInterval(() => {
        saveBoard();
    }, 60000);

    server.on('command:board.save', () => {
        saveBoard();
    });
    server.on('command:board.force-save', () => {
        saveBoard(true);
    });
    server.on('command:board.save-all', () => {
        saveAll();
    });

    server.on('beforeStop', () => {
        clients.forEach((socket) => {
            socket.disconnect();
        });
    });

    server.on('afterStop', async () => {
        await saveAll();
    });

})();
