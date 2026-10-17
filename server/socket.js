'use strict';
/**
 * WebSocket（Socket.IO）事件处理。
 * 客户端只做两件事：发动作、收整份房间状态。所有规则判断都在服务端做，
 * 客户端拿到的永远是「为这个玩家裁剪过」的状态（别人的暗牌看不到）。
 */
var M = require('./rooms');

module.exports = function (io) {
  function broadcast(room) {
    room.players.forEach(function (p) {
      if (!p.socketIds.size) return;
      var snap = room.snapshot(p.id);
      p.socketIds.forEach(function (sid) { io.to(sid).emit('state', snap); });
    });
  }

  io.on('connection', function (socket) {
    var cur = { roomId: null, playerId: null };

    function leave() {
      if (!cur.roomId) return;
      var room = M.getRoom(cur.roomId);
      if (!room) return;
      room.detachSocket(cur.playerId, socket.id);
      socket.leave(room.id);
      broadcast(room);
      cur.roomId = null; cur.playerId = null;
    }

    socket.on('createRoom', function (data, cb) {
      cb = cb || function () { };
      var gameId = (data && data.gameId) || 'stud5';
      if (!M.GAMES[gameId]) return cb({ ok: false, error: '没有这款游戏' });
      var room = M.createRoom(gameId);
      var p = room.addPlayer((data && data.name) || '房主');
      room.attachSocket(p.id, socket.id);
      socket.join(room.id);
      cur.roomId = room.id; cur.playerId = p.id;
      cb({ ok: true, roomId: room.id, playerId: p.id });
      broadcast(room);
    });

    socket.on('joinRoom', function (data, cb) {
      cb = cb || function () { };
      var room = M.getRoom(data && data.roomId);
      if (!room) return cb({ ok: false, error: '房间不存在，请检查房间号' });
      if (room.phase === 'playing' && !(data && data.playerId && room.findPlayer(data.playerId))) {
        return cb({ ok: false, error: '牌局进行中，请等本局结束后再加入' });
      }
      if (room.players.length >= M.MAX_PLAYERS && !(data && data.playerId && room.findPlayer(data.playerId))) {
        return cb({ ok: false, error: '房间已满（最多 ' + M.MAX_PLAYERS + ' 人）' });
      }
      var p = room.addPlayer((data && data.name) || '玩家', data && data.playerId);
      if (!p) return cb({ ok: false, error: '加入失败' });
      room.attachSocket(p.id, socket.id);
      socket.join(room.id);
      cur.roomId = room.id; cur.playerId = p.id;
      cb({ ok: true, roomId: room.id, playerId: p.id });
      broadcast(room);
    });

    socket.on('setOptions', function (data, cb) {
      cb = cb || function () { };
      var room = M.getRoom(cur.roomId);
      if (!room) return cb({ ok: false, error: '不在房间里' });
      if (cur.playerId !== room.hostId) return cb({ ok: false, error: '只有房主能改设置' });
      if (room.phase === 'playing') return cb({ ok: false, error: '牌局进行中不能改设置' });
      if (data && data.options) {
        for (var k in room.game.defaults) {
          if (data.options[k] !== undefined) room.options[k] = data.options[k];
        }
      }
      room.touch();
      cb({ ok: true });
      broadcast(room);
    });

    socket.on('startGame', function (data, cb) {
      cb = cb || function () { };
      var room = M.getRoom(cur.roomId);
      if (!room) return cb({ ok: false, error: '不在房间里' });
      if (cur.playerId !== room.hostId) return cb({ ok: false, error: '只有房主能开始' });
      var res = room.startGame(function () { broadcast(room); });
      cb(res);
      broadcast(room);
    });

    socket.on('nextRound', function (data, cb) {
      cb = cb || function () { };
      var room = M.getRoom(cur.roomId);
      if (!room) return cb({ ok: false, error: '不在房间里' });
      if (cur.playerId !== room.hostId) return cb({ ok: false, error: '只有房主能开始下一局' });
      room.toLobby();
      var res = room.startGame(function () { broadcast(room); });
      cb(res);
      broadcast(room);
    });

    socket.on('gameAction', function (data, cb) {
      cb = cb || function () { };
      var room = M.getRoom(cur.roomId);
      if (!room) return cb({ ok: false, error: '不在房间里' });
      var res = room.handleAction(cur.playerId, data && data.action, function () { broadcast(room); });
      cb(res);
      broadcast(room);
    });

    socket.on('kickPlayer', function (data, cb) {
      cb = cb || function () { };
      var room = M.getRoom(cur.roomId);
      if (!room) return cb({ ok: false, error: '不在房间里' });
      if (cur.playerId !== room.hostId) return cb({ ok: false, error: '只有房主能踢人' });
      if (room.phase === 'playing') return cb({ ok: false, error: '牌局进行中不能踢人' });
      var target = data && data.playerId;
      if (target === room.hostId) return cb({ ok: false, error: '不能踢自己' });
      room.removePlayer(target);
      cb({ ok: true });
      broadcast(room);
    });

    socket.on('dissolveRoom', function (data, cb) {
      cb = cb || function () { };
      var room = M.getRoom(cur.roomId);
      if (!room) return cb({ ok: true });
      if (cur.playerId !== room.hostId) return cb({ ok: false, error: '只有房主能解散房间' });
      room.players.forEach(function (p) {
        p.socketIds.forEach(function (sid) { io.to(sid).emit('roomClosed', { reason: '房主解散了房间' }); });
      });
      M.removeRoom(room.id);
      cur.roomId = null; cur.playerId = null;
      cb({ ok: true });
    });

    socket.on('leaveRoom', function (data, cb) {
      var room = M.getRoom(cur.roomId);
      if (room) {
        var pid = cur.playerId;
        room.detachSocket(pid, socket.id);
        socket.leave(room.id);
        // 真正离开（不是刷新页面）才把人移出座位
        if (data && data.leaveSeat && room.phase !== 'playing') room.removePlayer(pid);
        broadcast(room);
      }
      cur.roomId = null; cur.playerId = null;
      cb && cb({ ok: true });
    });

    socket.on('disconnect', function () { leave(); });
  });
};
