'use strict';
/**
 * 入口：一个 Express 进程同时提供静态网页和 WebSocket 服务。
 * 只需要一个端口（默认 3000），部署到任何云平台都很方便。
 */
var path = require('path');
var http = require('http');
var express = require('express');
var socketio = require('socket.io');
var rooms = require('./rooms');

var app = express();
var server = http.createServer(app);
var io = socketio(server, { pingInterval: 10000, pingTimeout: 20000 });

var PORT = Number(process.env.PORT) || 3000;

app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: 0 }));
app.get('/health', function (req, res) { res.json({ ok: true, rooms: rooms.rooms.size }); });
// 游戏目录：首页用它渲染「选择游戏」，新增游戏后这里会自动多出一项
app.get('/api/games', function (req, res) {
  var list = Object.keys(rooms.GAMES).map(function (k) {
    var g = rooms.GAMES[k];
    return { id: g.id, name: g.name, min: g.minPlayers, max: g.maxPlayers };
  });
  res.json(list);
});
// 直接访问 /ABCD 也能进房间（前端会读取这个房间号自动填入）
app.get('/:roomId([A-Z0-9]{4})', function (req, res) {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

require('./socket')(io);
rooms.startCleanup();

server.listen(PORT, function () {
  console.log('==============================================');
  console.log('  好友棋牌房已启动');
  console.log('  本机访问： http://localhost:' + PORT);
  console.log('  同一 WiFi 下的手机/电脑访问： http://<你的电脑内网IP>:' + PORT);
  console.log('==============================================');
});
