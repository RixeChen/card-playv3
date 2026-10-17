/* =====================================================================
 * 升级（拖拉机）
 *
 * 采用的玩法版本（规则有歧义处按通行做法，详见 public/shared/shengji-rules.js 顶部注释）：
 *   - 2 副牌 108 张，固定 4 人，座位 0/2 一队、1/3 一队（对家结队）。
 *   - 每人 25 张，8 张底牌给庄家；庄家先选主花色，再扣回 8 张底牌。
 *   - 首局庄家 = 座位 0；之后若闲家上台，由原庄家的下家接庄（保证两队的庄家交替）。
 *   - 庄家先出牌，每轮每人出相同张数，赢者下一轮领出。
 *   - 分数：5=5 分、10=10 分、K=10 分，归本轮赢家所在队。
 *   - 底牌分：若闲家方赢下最后一轮（抠底），底牌分 ×2；若抠底那手用的是主牌，再 ×2（共 ×4）。
 *   - 升级表（闲家得分 D）：
 *       D=0        庄家方升 3 级（大光）
 *       0<D<40     庄家方升 2 级
 *       40≤D<80    庄家方升 1 级
 *       80≤D<120   闲家方上台，升 1 级
 *       120≤D<160  闲家方上台，升 2 级
 *       D≥160      闲家方上台，升 3 级
 *   - 级数走到 A 之后再升级即「通关」，游戏结束。
 *   - 未实现：亮主/反主抢庄、无主、五主等变体（本实现由庄家直接选主）。
 * ===================================================================== */
'use strict';
var Cards = require('../../public/shared/cards.js');
var SJ = require('../../public/shared/shengji-rules.js');

var DEFAULTS = { startLevel: '2', allowThrow: true, bottomDouble: true };

var OPTION_FIELDS = [
  { key: 'startLevel', label: '起始级数', type: 'select', options: SJ.LEVELS },
  { key: 'allowThrow', label: '允许甩牌', type: 'bool' },
  { key: 'bottomDouble', label: '抠底翻倍', type: 'bool' }
];

var RULES = [
  '2 副牌 108 张，4 人，对家结队（0/2 vs 1/3）。',
  '每人 25 张，8 张底牌；庄家先选主花色，再扣回 8 张。',
  '主牌 = 大小王 + 所有级牌 + 主花色全部牌。',
  '牌型：单张 / 对子 / 拖拉机 / 甩牌（甩牌必须不被别人压住）。',
  '跟牌张数必须相同；有该门牌必须先出该门，不够可用主牌毙。',
  '5=5 分、10=10 分、K=10 分；闲家得分 ≥80 即上台。',
  '闲家赢最后一轮 = 抠底，底牌分翻倍。'
];

function log(st, s) { st.log.push(s); if (st.log.length > 80) st.log.shift(); }
function bySeat(st, s) { for (var i = 0; i < st.players.length; i++) if (st.players[i].seat === s) return st.players[i]; return null; }
function byId(st, id) { for (var i = 0; i < st.players.length; i++) if (st.players[i].id === id) return st.players[i]; return null; }
function ctxOf(st) { return { level: st.level, trumpSuit: st.trumpSuit }; }

function init(room) {
  var opts = {};
  for (var k in DEFAULTS) opts[k] = (room.options && room.options[k] !== undefined) ? room.options[k] : DEFAULTS[k];
  room.state = {
    ui: 'shengji', opts: opts, players: [], stage: 'idle',
    levels: { 0: SJ.LEVELS.indexOf(opts.startLevel), 1: SJ.LEVELS.indexOf(opts.startLevel) },
    bankerSeat: 0, round: 0, log: [], result: null
  };
  return room.state;
}

function start(room, ctx) {
  var st = room.state;
  if (!st) st = init(room);
  var ps = room.activePlayers();
  if (ps.length !== 4) return;

  st.round += 1;
  st.players = ps.map(function (p, i) {
    return { id: p.id, name: p.name, seat: i, team: i % 2, hand: [], tricksWon: 0 };
  });
  var bankerTeam = st.bankerSeat % 2;
  st.level = SJ.LEVELS[st.levels[bankerTeam]];
  st.trumpSuit = null;
  st.bottom = [];
  st.bottomScore = 0;
  st.trick = [];
  st.turnSeat = st.bankerSeat;
  st.teamScore = { 0: 0, 1: 0 };
  st.lastTrick = null;
  st.result = null;

  var deck = Cards.shuffle(Cards.createShoe(2, true)); // 108 张
  st.players.forEach(function (p) { for (var i = 0; i < 25; i++) p.hand.push(deck.pop()); });
  var banker = bySeat(st, st.bankerSeat);
  while (deck.length) banker.hand.push(deck.pop()); // 庄家收 8 张底牌
  log(st, '第 ' + st.round + ' 局开始，庄家：' + banker.name + '，打 ' + st.level);
  st.stage = 'chooseTrump';
}

function handle(room, playerId, action, ctx) {
  var st = room.state;
  if (!st || st.stage === 'idle') return { ok: false, error: '牌局尚未开始' };
  var me = byId(st, playerId);
  if (!me) return { ok: false, error: '你不在本局中' };

  if (st.stage === 'chooseTrump') {
    if (me.seat !== st.bankerSeat) return { ok: false, error: '等庄家选主' };
    var suit = action.suit;
    if (['S', 'H', 'D', 'C'].indexOf(suit) < 0) return { ok: false, error: '请选择主花色' };
    st.trumpSuit = suit;
    var sctx = ctxOf(st);
    st.players.forEach(function (p) { p.hand = SJ.sortHand(p.hand, sctx); });
    log(st, '主花色确定为 ' + SJ.groupName(suit, sctx));
    st.stage = 'discard';
    return { ok: true };
  }

  if (st.stage === 'discard') {
    if (me.seat !== st.bankerSeat) return { ok: false, error: '等庄家扣底牌' };
    var ids = action.cardIds || [];
    if (action.auto) {
      // 自动扣牌：按「分数最低、点数最小」挑 8 张
      var sctx2 = ctxOf(st);
      var sorted = me.hand.slice().sort(function (a, b) {
        var da = (SJ.isTrump(a, sctx2) ? 0 : 1) * 1000 + SJ.scoreOf(a) * 100 - a.value;
        var db = (SJ.isTrump(b, sctx2) ? 0 : 1) * 1000 + SJ.scoreOf(b) * 100 - b.value;
        return db - da;
      });
      ids = sorted.slice(0, 8).map(function (c) { return c.id; });
    }
    if (ids.length !== 8) return { ok: false, error: '请选择 8 张底牌' };
    var uq = {};
    for (var z = 0; z < ids.length; z++) { if (uq[ids[z]]) return { ok: false, error: '选牌重复' }; uq[ids[z]] = 1; }
    var taken = Cards.takeByIds(me.hand, ids);
    if (taken.length !== 8) { me.hand = me.hand.concat(taken); return { ok: false, error: '所选牌不在手里' }; }
    st.bottom = taken;
    st.bottomScore = SJ.scoreOfCards(taken);
    log(st, '庄家扣下 8 张底牌（' + st.bottomScore + ' 分）');
    st.stage = 'play';
    st.turnSeat = st.bankerSeat;
    return { ok: true };
  }

  if (st.stage === 'play') {
    if (me.seat !== st.turnSeat) return { ok: false, error: '还没轮到你' };
    var cids = action.cardIds || [];
    if (!cids.length) return { ok: false, error: '请选择要出的牌' };
    var uniq = {};
    for (var q = 0; q < cids.length; q++) { if (uniq[cids[q]]) return { ok: false, error: '选牌重复' }; uniq[cids[q]] = 1; }
    var cards = Cards.takeByIds(me.hand, cids);
    if (cards.length !== cids.length) { me.hand = me.hand.concat(cards); return { ok: false, error: '所选牌不在手里' }; }

    var sctx3 = ctxOf(st);
    var lead = st.trick.length ? st.trick[0].combo : null;
    if (!lead) {
      var combo = SJ.analyze(cards, sctx3);
      if (!combo) { me.hand = me.hand.concat(cards); return { ok: false, error: '牌型不合法：必须全是主牌或同一门副牌' }; }
      if (combo.kind === 'throw') {
        var others = st.players.filter(function (p) { return p.id !== playerId; }).map(function (p) { return p.hand; });
        var tv = SJ.throwValid(cards, sctx3, others, st.opts.allowThrow);
        if (!tv.ok) { me.hand = me.hand.concat(cards); return { ok: false, error: tv.msg }; }
      }
      st.trick.push({ seat: me.seat, id: me.id, cards: cards, combo: combo });
      log(st, me.name + ' 首出 ' + labelOf(combo, sctx3));
    } else {
      var fc = SJ.followCheck(me.hand.concat(cards), cards, lead, sctx3);
      if (!fc.ok) { me.hand = me.hand.concat(cards); return { ok: false, error: fc.msg }; }
      var c2 = SJ.analyze(cards, sctx3);
      st.trick.push({ seat: me.seat, id: me.id, cards: cards, combo: c2 });
      log(st, me.name + ' 出 ' + (c2 ? labelOf(c2, sctx3) : cards.length + ' 张'));
    }

    var alive = st.players.length;
    if (st.trick.length < alive) {
      st.turnSeat = (st.turnSeat + 1) % alive;
      return { ok: true };
    }
    resolveTrick(st, sctx3);
    return { ok: true };
  }

  if (st.stage === 'ended') return { ok: false, error: '本局已结束' };
  return { ok: false, error: '未知动作' };
}

function labelOf(combo, sctx) {
  if (!combo) return '垫牌';
  var map = { single: '单张', pair: '对子', set: '刻子', tractor: combo.len + '连拖拉机', throw: combo.size + '张甩牌' };
  return (map[combo.kind] || combo.size + '张') + '（' + SJ.groupName(combo.group, sctx) + '）';
}

function resolveTrick(st, sctx) {
  var lead = st.trick[0].combo;
  var bestIdx = 0, bestScore = SJ.trickScore(st.trick[0].cards, lead, sctx);
  for (var i = 1; i < st.trick.length; i++) {
    var sc = SJ.trickScore(st.trick[i].cards, lead, sctx);
    if (SJ.cmpTrick(sc, bestScore) > 0) { bestScore = sc; bestIdx = i; }
  }
  var win = st.trick[bestIdx];
  var gained = 0;
  st.trick.forEach(function (t) { gained += SJ.scoreOfCards(t.cards); });
  var winPlayer = bySeat(st, win.seat);
  winPlayer.tricksWon += 1;
  st.teamScore[winPlayer.team] += gained;
  st.lastTrick = {
    winnerId: win.id, winnerName: winPlayer.name, gained: gained,
    plays: st.trick.map(function (t) {
      return { id: t.id, name: bySeat(st, t.seat).name, cards: t.cards, label: labelOf(t.combo, sctx) };
    })
  };
  log(st, winPlayer.name + ' 拿下本轮，得 ' + gained + ' 分');
  st.trick = [];
  st.turnSeat = win.seat;

  // 是否打完
  var allDone = st.players.every(function (p) { return p.hand.length === 0; });
  if (allDone) endRound(st, sctx, winPlayer);
}

function endRound(st, sctx, lastWinner) {
  st.stage = 'ended';
  var bankerTeam = st.bankerSeat % 2;
  var otherTeam = 1 - bankerTeam;
  var D = st.teamScore[otherTeam];

  // 抠底：闲家方赢下最后一轮
  var bottomExtra = 0;
  if (st.opts.bottomDouble && lastWinner.team === otherTeam && st.bottomScore > 0) {
    var usedTrump = st.lastTrick && st.lastTrick.plays.some(function (p) {
      return p.id === lastWinner.id && p.cards.some(function (c) { return SJ.isTrump(c, sctx); });
    });
    bottomExtra = st.bottomScore * (usedTrump ? 4 : 2);
    st.teamScore[otherTeam] += bottomExtra;
    D = st.teamScore[otherTeam];
    log(st, '闲家抠底！底牌 ' + st.bottomScore + ' 分 ×' + (usedTrump ? 4 : 2) + ' = ' + bottomExtra);
  }

  var up, winnerIsBanker;
  if (D === 0) { up = 3; winnerIsBanker = true; }
  else if (D < 40) { up = 2; winnerIsBanker = true; }
  else if (D < 80) { up = 1; winnerIsBanker = true; }
  else if (D < 120) { up = 1; winnerIsBanker = false; }
  else if (D < 160) { up = 2; winnerIsBanker = false; }
  else { up = 3; winnerIsBanker = false; }

  var upTeam = winnerIsBanker ? bankerTeam : otherTeam;
  st.levels[upTeam] = Math.min(st.levels[upTeam] + up, SJ.LEVELS.length - 1);
  var champion = st.levels[upTeam] >= SJ.LEVELS.length - 1;

  var oldBankerSeat = st.bankerSeat;
  if (!winnerIsBanker) st.bankerSeat = (oldBankerSeat + 1) % 4;

  st.result = {
    round: st.round,
    defenderScore: D,
    bottomExtra: bottomExtra,
    teamScore: { 0: st.teamScore[0], 1: st.teamScore[1] },
    bankerTeam: bankerTeam,
    winnerIsBanker: winnerIsBanker,
    upTeam: upTeam, up: up,
    levels: { 0: SJ.LEVELS[st.levels[0]], 1: SJ.LEVELS[st.levels[1]] },
    champion: champion, championTeam: champion ? upTeam : null,
    bottom: st.bottom.slice(),
    newBankerSeat: st.bankerSeat
  };
  log(st, (winnerIsBanker ? '庄家方' : '闲家方') + '胜，升 ' + up + ' 级；闲家得分 ' + D);
}

function view(room, playerId) {
  var st = room.state;
  if (!st || st.stage === 'idle') return { ui: 'shengji', stage: 'idle' };
  var sctx = ctxOf(st);
  var me = null;
  var players = st.players.map(function (p) {
    if (p.id === playerId) me = p;
    return {
      id: p.id, name: p.name, seat: p.seat, team: p.team,
      handCount: p.hand.length, tricksWon: p.tricksWon, isBanker: p.seat === st.bankerSeat
    };
  });
  var mine = me ? { seat: me.seat, team: me.team } : null;
  return {
    ui: 'shengji', stage: st.stage, round: st.round,
    level: st.level, trumpSuit: st.trumpSuit,
    levels: { 0: SJ.LEVELS[st.levels[0]], 1: SJ.LEVELS[st.levels[1]] },
    bankerSeat: st.bankerSeat,
    players: players, meId: playerId, me: mine,
    myHand: me ? me.hand.slice() : [],
    turnId: (st.stage === 'play') ? bySeat(st, st.turnSeat).id : null,
    trick: st.trick.map(function (t) {
      return { id: t.id, name: bySeat(st, t.seat).name, cards: t.cards, label: labelOf(t.combo, sctx), count: t.cards.length };
    }),
    leadSize: st.trick.length ? st.trick[0].cards.length : 0,
    lastTrick: st.lastTrick,
    teamScore: st.teamScore,
    bottomScore: st.bottomScore,
    bottom: st.stage === 'ended' ? st.bottom.slice() : [],
    log: st.log.slice(-16),
    result: st.result,
    opts: st.opts
  };
}

module.exports = {
  id: 'shengji', name: '升级（拖拉机）', minPlayers: 4, maxPlayers: 4,
  defaults: DEFAULTS, optionFields: OPTION_FIELDS, rules: RULES,
  init: init, start: start, handle: handle, view: view, nextLabel: '下一局'
};
