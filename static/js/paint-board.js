
'use strict';

var colors = convertColors(colorStr);
var currentColor;

function convertColors(c) {
    return c.map(function(s) {
        var tmp = s.match(/^(..)(..)(..)$/);
        return [parseInt(tmp[1], 16), parseInt(tmp[2], 16), parseInt(tmp[3], 16)];
    });
}

var $canvas = $('#board');
var canvas = $canvas.get(0);
var ctx = canvas.getContext('2d');

canvas.width = boardW;
canvas.height = boardH;

var canvasW, canvasH;
var startX = 0, startY = 0;
var scale = 1, scalePos = 0;

var chunkSize = 100;
var chunkX = [];
var chunkY = [];
var cxChunks = Math.ceil(boardW / chunkSize);
var cyChunks = Math.ceil(boardH / chunkSize);
var chunks = [];

for (var x = 0; x < cxChunks; ++x) chunkX[x] = x * chunkSize;
chunkX[cxChunks] = boardW;

for (var y = 0; y < cyChunks; ++y) chunkY[y] = y * chunkSize;
chunkY[cyChunks] = boardH;

for (var x = 0; x < cxChunks; ++x) {
    chunks[x] = [];
    for (var y = 0; y < cyChunks; ++y) {
        chunks[x][y] = {
            x: chunkX[x],
            y: chunkY[y],
            width: chunkX[x + 1] - chunkX[x],
            height: chunkY[y + 1] - chunkY[y],
            data: null,
            state: 'none'
        };
    }
}

function chunkAtPos(x, y) {
    var X = Math.floor(x / chunkSize);
    var Y = Math.floor(y / chunkSize);
    return chunks[X][Y];
}

function posIn(x, y, chunk) {
    return (x - chunk.x) + (y - chunk.y) * chunk.width;
}

function getPixel(x, y) {
    var chunk = chunkAtPos(x, y);
    if (!chunk.data) return null;
    return chunk.data[posIn(x, y, chunk)];
}

function setPixel(x, y, color) {
    var chunk = chunkAtPos(x, y);
    if (chunk.data) chunk.data[posIn(x, y, chunk)] = color;
}

function update(x, y, color) {
    setPixel(x, y, color);
    renderPixel(x, y, color);
}

function toWorldPos(x, y) {
    return {
        x: parseInt((x - startX) / scale),
        y: parseInt((y - startY) / scale)
    };
}

function moveCanvas(x, y) {
    startX += x;
    startY += y;
}

function getScaleRate(cnt) {
    return Math.round(Math.pow(1.4, Math.abs(cnt) + 1));
}

function getScale(pos) {
    if (pos < 0) {
        return 1 / getScaleRate(pos);
    }
    if (pos > 0) {
        return getScaleRate(pos);
    }
    return 1;
}

function scaleCanvas(oldScale, newScale, centerX, centerY) {
    var temp = oldScale - newScale;
    startX += centerX * temp;
    startY += centerY * temp;
}

function updateTransform() {
    $canvas.css({
        left: startX,
        top: startY,
        transform: 'scale(' + scale + ')'
    });
}

function resize() {
    canvasW = $canvas.parent().width();
    canvasH = $canvas.parent().height();
}

$(window).resize(function() {
    resize();
    if (connected) {
        loadChunks();
    }
});
resize();
moveCanvas(-(boardW - canvasW) / 2, -(boardH - canvasH) / 2);
updateTransform();

function renderPixel(x, y, color) {
    ctx.fillStyle = '#' + colorStr[color];
    ctx.fillRect(x, y, 1, 1);
}

function renderChunk(chunk) {
    var width = chunk.width;
    var height = chunk.height;
    var area = width * height;
    var imgData = ctx.createImageData(width, height);
    for (var p = 0; p < area; ++p) {
        var color = colors[chunk.data[p]];
        imgData.data[p * 4 + 0] = color[0];
        imgData.data[p * 4 + 1] = color[1];
        imgData.data[p * 4 + 2] = color[2];
        imgData.data[p * 4 + 3] = 255;
    }
    ctx.putImageData(imgData, chunk.x, chunk.y);
}

function selectColor(id) {
    $('.btn-color.active').removeClass('active');
    currentColor = parseInt(id);
    $('.btn-color[data-id="' + id + '"]').addClass('active');
}

$('.color-buttons').on('click', '.btn-color', function() {
    selectColor($(this).attr('data-id'));
});
selectColor(bg_color);

var mouseX = 0, mouseY = 0;
var mouseClick = false, mouseDrag = false;
var dragDist = 0;

$canvas.mousedown(function(e) {
    mouseClick = true;
    dragDist = 0;
    mouseX = e.clientX;
    mouseY = e.clientY;
}).on('mousewheel', function(e) {
    var delta = e.originalEvent.deltaY;
    var oldScale = scale;
    var x = e.offsetX;
    var y = e.offsetY;
    if (delta < 0) scale = getScale(++scalePos);
    if (delta > 0) scale = getScale(--scalePos);
    if (oldScale !== scale) {
        scaleCanvas(oldScale, scale, x, y);
        updateTransform();
        loadChunks();
    }
    e.preventDefault();
});

$('body').mousemove(function(e) {
    if (mouseClick) {
        if (!mouseDrag && dragDist > 1) {
            mouseDrag = true;
            $canvas.addClass('dragging');
        } else {
            dragDist += Math.abs(e.clientX - mouseX) + Math.abs(e.clientY - mouseY);
        }
        loadChunks();
        moveCanvas(e.clientX - mouseX, e.clientY - mouseY);
        updateTransform();
        mouseX = e.clientX;
        mouseY = e.clientY;
    }
}).mouseup(function(e) {
    if (mouseDrag) {
        $canvas.removeClass('dragging');
        loadChunks();
    } else if (mouseClick) {
        var offset = $canvas.offset();
        console.log
        var x = Math.floor((e.clientX - offset.left) / scale);
        var y = Math.floor((e.clientY - offset.top) / scale);
        if (getPixel(x, y) === null) return;
        socket.emit('paint', x, y, currentColor);
    }
    mouseClick = false;
    mouseDrag = false;
});

var socket = io("/board/ws");
var connected = false;

socket.on('error', function() {
    showError("无法连接至服务器");
});

socket.on('connect', function() {
    connected = true;
    loadChunks();
});

socket.on('disconnect', function(reason) {
    connected = false;
    showError("失去与服务器的连接 (" + reason + ")");
});

socket.on('error message', function(err) {
    showError(err.message);
});

socket.on('update', function(x, y, color) {
    update(x, y, color);
});

function loadChunk(chunk, buf) {
    chunk.data = new Uint8Array(buf);
    chunk.state = 'loaded';
}

function isChunkVisible(chunk) {
    var A = toWorldPos(0, 0);
    var B = toWorldPos(canvasW, canvasH);
    return (
        Math.max(A.x, chunk.x) <= Math.min(B.x, chunk.x + chunk.width) &&
        Math.max(A.y, chunk.y) <= Math.min(B.y, chunk.y + chunk.height)
    );
}

function loadChunks() {
    for (var x = 0; x < cxChunks; ++x) {
        for (var y = 0; y < cyChunks; ++y) {
            let chunk = chunks[x][y];
            if (isChunkVisible(chunk)) {
                if (chunk.state === 'none') {
                    chunk.state = 'loading';
                    socket.emit('get chunk', chunk.x, chunk.y, chunk.width, chunk.height, function(buf) {
                        loadChunk(chunk, buf);
                        renderChunk(chunk);
                    });
                }
            }
        }
    }
}