'use strict';
/**
 * 房间管理：房间号、玩家、房主、开始/结束、掉线重连、定时清理。
 * 所有数据都在内存里（重启即清空），这样部署最简单、不需要数据库。
 */
var GAMES = require('./games');

var ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉易混淆的 I O 0 1
var rooms = new Map();
var MAX_PLAYERS = 8;

function genRoomId() {
  var s = '', tries = 0;
  do {
    s = '';
    for (var i = 0; i < 4; i++) s += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)];
    tries++;
  } while (rooms.has(s) && tries < 50);
  return s;
}
function genPlayerId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function Room(id, gameId) {
  this.id = id;
  this.gameId = gameId;
  this.game = GAMES[gameId];
  this.options = {};
  for (var k in this.game.defaults) this.options[k] = this.game.defaults[k];
  this.players = [];   // { id, name, socketIds:Set, connected }
  this.hostId = null;
  this.phase = 'lobby'; // lobby | playing
  this.state = null;
  this.createdAt = Date.now();
  this.lastActivity = Date.now();
  this.timer = null;
}

Room.prototype.touch = function () { this.lastActivity = Date.now(); };

Room.prototype.activePlayers = function () {
  return this.players.slice();
};

Room.prototype.findPlayer = function (id) {
  for (var i = 0; i < this.players.length; i++) if (this.players[i].id === id) return this.players[i];
  return null;
};

Room.prototype.addPlayer = function (name, existingId) {
  if (existingId) {
    var ex = this.findPlayer(existingId);
    if (ex) { ex.name = name || ex.name; this.touch(); return ex; }
  }
  if (this.players.length >= MAX_PLAYERS) return null;
  var p = { id: genPlayerId(), name: (name || '玩家').slice(0, 12), socketIds: new Set(), connected: true };
  this.players.push(p);
  if (!this.hostId) this.hostId = p.id;
  this.touch();
  return p;
};

Room.prototype.attachSocket = function (playerId, socketId) {
  var p = this.findPlayer(playerId);
  if (!p) return null;
  p.socketIds.add(socketId);
  p.connected = true;
  this.touch();
  return p;
};

Room.prototype.detachSocket = function (playerId, socketId) {
  var p = this.findPlayer(playerId);
  if (!p) return;
  p.socketIds.delete(socketId);
  p.connected = p.socketIds.size > 0;
  this.touch();
};

Room.prototype.removePlayer = function (id) {
  var idx = -1;
  for (var i = 0; i < this.players.length; i++) if (this.players[i].id === id) idx = i;
  if (idx < 0) return;
  this.players.splice(idx, 1);
  if (this.hostId === id) this.hostId = this.players.length ? this.players[0].id : null;
  this.touch();
};

Room.prototype.clearTimer = function () {
  if (this.timer) { clearTimeout(this.timer); this.timer = null; }
};

Room.prototype.ctx = function (broadcast) {
  var self = this;
  return {
    room: self,
    setTimer: function (fn, ms) { self.clearTimer(); self.timer = setTimeout(fn, ms); },
    clearTimer: function () { self.clearTimer(); },
    broadcast: broadcast
  };
};

/** 房主开局 / 下一局 */
Room.prototype.startGame = function (broadcast) {
  var g = this.game;
  var n = this.players.length;
  if (n < g.minPlayers) return { ok: false, error: '至少需要 ' + g.minPlayers + ' 人才能开始' };
  if (n > g.maxPlayers) return { ok: false, error: '本游戏最多 ' + g.maxPlayers + ' 人' };
  if (!this.state) g.init(this);
  // 把房主最新的设置同步进当前局。
  // 否则 state.opts 只在 init 时读一次，大厅里改的设置要到「重新开始」才生效。
  if (this.state && this.state.opts) {
    for (var k in g.defaults) {
      this.state.opts[k] = (this.options && this.options[k] !== undefined) ? this.options[k] : g.defaults[k];
      this.options[k] = this.state.opts[k];
    }
  }
  this.phase = 'playing';
  var ctx = this.ctx(broadcast);
  g.start(this, ctx);
  // 开局后立刻进入结束态（例如筹码不足）时，仍放回大厅
  if (this.state && END_STAGES.indexOf(this.state.stage) >= 0) this.phase = 'lobby';
  this.touch();
  return { ok: true };
};

/** 回合结束类状态：进入这些状态就把房间放回大厅，方便新朋友中途加入 */
var END_STAGES = ['settle', 'ended', 'over'];

Room.prototype.handleAction = function (playerId, action, broadcast) {
  var g = this.game;
  if (!this.state) return { ok: false, error: '牌局尚未开始' };
  var ctx = this.ctx(broadcast);
  var res = g.handle(this, playerId, action || {}, ctx);
  // 一局结束 / 整场结束 → 回到大厅，允许加入
  if (res && res.ok && this.state && END_STAGES.indexOf(this.state.stage) >= 0) {
    this.phase = 'lobby';
  }
  this.touch();
  return res;
};

/** 回合结束后回到 lobby，方便新朋友加入 */
Room.prototype.toLobby = function () { this.phase = 'lobby'; this.touch(); };

Room.prototype.publicInfo = function (forId) {
  var g = this.game;
  return {
    roomId: this.id,
    gameId: this.gameId,
    gameName: g.name,
    minPlayers: g.minPlayers,
    maxPlayers: g.maxPlayers,
    rules: g.rules,
    optionFields: g.optionFields,
    options: this.options,
    hostId: this.hostId,
    phase: this.phase,
    nextLabel: g.nextLabel,
    meId: forId,
    players: this.players.map(function (p) {
      return { id: p.id, name: p.name, connected: p.connected, isHost: p.id === this.hostId };
    }.bind(this))
  };
};

Room.prototype.snapshot = function (playerId) {
  var g = this.game;
  var view = g.view ? g.view(this, playerId) : null;
  return {
    room: this.publicInfo(playerId),
    view: view,
    serverTime: Date.now()
  };
};

function createRoom(gameId) {
  if (!GAMES[gameId]) return null;
  var r = new Room(genRoomId(), gameId);
  rooms.set(r.id, r);
  return r;
}
function getRoom(id) { return rooms.get(String(id || '').toUpperCase()); }
function removeRoom(id) {
  var r = rooms.get(id);
  if (r) { r.clearTimer(); rooms.delete(id); }
}

/** 每小时清理一次超过 6 小时无活动的房间 */
function startCleanup() {
  setInterval(function () {
    var now = Date.now();
    rooms.forEach(function (r, id) {
      if (now - r.lastActivity > 6 * 3600 * 1000) removeRoom(id);
    });
  }, 3600 * 1000);
}

module.exports = {
  rooms: rooms,
  GAMES: GAMES,
  MAX_PLAYERS: MAX_PLAYERS,
  createRoom: createRoom,
  getRoom: getRoom,
  removeRoom: removeRoom,
  startCleanup: startCleanup,
  genPlayerId: genPlayerId
};
