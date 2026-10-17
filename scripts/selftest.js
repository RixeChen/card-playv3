/* 自检脚本：node scripts/selftest.js
 * 不需要起服务器，直接把四款游戏的规则跑很多遍，检查有没有崩溃 / 死循环 / 明显错误。
 */
'use strict';
var Cards = require('../public/shared/cards.js');
var Poker = require('../public/shared/poker.js');
var Combos = require('../public/shared/combos.js');
var SJ = require('../public/shared/shengji-rules.js');

var pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + name); } }
function section(t) { console.log('\n== ' + t + ' =='); }
/** 取一张牌；港式五张牌牌组已剔除 2~7，所以这里默认只从 8~A + 王里取 */
function card(suit, rank) {
  var shoe = Cards.createShoe(1, true, ['8', '9', '10', 'J', 'Q', 'K', 'A', 'BJ', 'RJ']);
  for (var i = 0; i < shoe.length; i++) {
    if (shoe[i].suit === suit && shoe[i].rank === rank) return shoe[i];
  }
  return null;
}
/** 从完整牌组里取一张牌（保皇/升级等仍用满牌堆） */
function anyCard(suit, rank) {
  var shoe = Cards.createShoe(1, true);
  for (var i = 0; i < shoe.length; i++) {
    if (shoe[i].suit === suit && shoe[i].rank === rank) return shoe[i];
  }
  return null;
}

/* ---------- 0. 五张牌专用牌组 ---------- */
section('港式五张牌 · 牌组只保留 8~A');
(function () {
  var deck = Cards.createShoe(1, false, ['8', '9', '10', 'J', 'Q', 'K', 'A']);
  ok(deck.length === 28, '牌组共 28 张（7 点数 × 4 花色），实际 ' + deck.length);
  ok(deck.every(function (c) { return ['8', '9', '10', 'J', 'Q', 'K', 'A'].indexOf(c.rank) >= 0; }), '不含 2~7');
  ok(deck.every(function (c) { return !c.joker; }), '不含大小王');
  var uniq = {};
  deck.forEach(function (c) { uniq[c.id] = 1; });
  ok(Object.keys(uniq).length === 28, '28 张牌 id 均不重复');
})();

/* ---------- 1. 五张牌牌力 ---------- */
section('港式五张牌 · 牌力评估（8~A 牌组）');
function ev(list) { return Poker.evaluate(list.map(function (x) { return card(x[0], x[1]); })); }
ok(ev([['S', 'A'], ['S', 'K'], ['S', 'Q'], ['S', 'J'], ['S', '10']]).cat === 8, '黑桃 AKQJ10 = 同花顺（最大）');
ok(ev([['S', '8'], ['S', '9'], ['S', '10'], ['S', 'J'], ['S', 'Q']]).cat === 8, '黑桃 89 10 JQ = 同花顺');
ok(ev([['S', '8'], ['H', '8'], ['D', '8'], ['C', '8'], ['S', 'K']]).cat === 7, '四条 8');
ok(ev([['S', '9'], ['H', '9'], ['D', '9'], ['C', 'K'], ['S', 'K']]).cat === 6, '葫芦');
ok(ev([['S', '8'], ['S', '10'], ['S', 'J'], ['S', 'Q'], ['S', 'K']]).cat === 5, '同花');
ok(ev([['S', '8'], ['H', '9'], ['D', '10'], ['C', 'J'], ['S', 'Q']]).cat === 4, '顺子 8~Q');
ok(ev([['S', 'K'], ['H', 'Q'], ['D', 'J'], ['C', '10'], ['S', '9']]).cat === 4, '顺子 9~K');
ok(ev([['S', 'A'], ['H', 'K'], ['D', 'Q'], ['C', 'J'], ['S', '10']]).cat === 4, '顺子 10~A');
ok(ev([['S', '8'], ['H', '8'], ['D', '8'], ['C', 'J'], ['S', 'Q']]).cat === 3, '三条');
ok(ev([['S', '9'], ['H', '9'], ['D', 'J'], ['C', 'J'], ['S', 'K']]).cat === 2, '两对');
ok(ev([['S', '9'], ['H', '9'], ['D', 'J'], ['C', 'Q'], ['S', 'K']]).cat === 1, '一对');
ok(ev([['S', '9'], ['H', 'J'], ['D', 'Q'], ['C', 'K'], ['S', '8']]).cat === 0, '散牌');
ok(Poker.compare(ev([['S', '9'], ['H', '9'], ['D', '9'], ['C', '9'], ['S', '8']]),
  ev([['S', '8'], ['H', '8'], ['D', '8'], ['C', '8'], ['S', 'K']])) > 0, '四条 9 > 四条 8');
ok(Poker.compare(ev([['S', 'A'], ['S', 'K'], ['S', 'Q'], ['S', 'J'], ['S', '10']]),
  ev([['S', '8'], ['S', '9'], ['S', '10'], ['S', 'J'], ['S', 'Q']])) > 0, 'AKQJ10 同花顺 > 89 10JQ 同花顺');
ok(Poker.compare(ev([['S', '8'], ['H', '9'], ['D', '10'], ['C', 'J'], ['S', 'Q']]),
  ev([['S', '9'], ['H', 'J'], ['D', 'Q'], ['C', 'K'], ['S', '8']])) > 0, '顺子 8~Q > 散牌');

/* ---------- 2. 保皇牌型 ---------- */
section('保皇 · 牌型识别');
/** 保皇用 4 副满牌堆（含 2~7 和王），所以这里从完整牌组取牌 */
function bh(list) { return Combos.analyze(list.map(function (x) { return anyCard(x[0], x[1]); })); }
ok(bh([['S', '8']]).type === 'single', '单张');
ok(bh([['S', '8'], ['H', '8']]).type === 'pair', '对子');
ok(bh([['S', '8'], ['H', '8'], ['D', '8']]).type === 'trio', '三张');
ok(bh([['S', '8'], ['H', '8'], ['D', '8'], ['C', 'J']]).type === 'trio1', '三带一');
ok(bh([['S', '8'], ['H', '8'], ['D', '8'], ['C', 'J'], ['S', 'J']]).type === 'trio2', '三带二');
ok(bh([['S', '8'], ['H', '9'], ['D', '10'], ['C', 'J'], ['S', 'Q']]).type === 'straight', '顺子 8~Q');
ok(bh([['S', '8'], ['H', '8'], ['D', '9'], ['C', '9'], ['S', '10'], ['H', '10']]).type === 'dstraight', '连对');
ok(bh([['S', 'A'], ['H', '2'], ['D', '3'], ['C', '4'], ['S', '5']]) === null, '含 2 不是顺子（完整牌组里 2 存在，但不与 3~A 连续）');
ok(bh([['S', '8'], ['H', '8'], ['D', '8'], ['C', '8']]).type === 'bomb', '炸弹');
ok(bh([['J', 'BJ'], ['J', 'RJ']]).type === 'jbomb', '双王 = 王炸');
ok(Combos.beats(bh([['S', '9']]), bh([['S', '8']])), '9 压 8');
ok(Combos.beats(bh([['S', '8'], ['H', '8'], ['D', '8'], ['C', '8']]), bh([['S', 'A']])), '炸弹压单张');
ok(!Combos.beats(bh([['S', '8']]), bh([['S', '9']])), '8 压不过 9');

/* ---------- 3. 升级规则 ---------- */
section('升级 · 主牌与牌型');
var ctx = { level: '2', trumpSuit: 'H' };
/** 升级用 2 副满牌堆（含 2~7 和王），所以这里从完整牌组取牌 */
function sc(suit, rank) { return anyCard(suit, rank); }
ok(SJ.groupOf(sc('J', 'RJ'), ctx) === 'T', '大王是主');
ok(SJ.groupOf(sc('S', '2'), ctx) === 'T', '级牌（打2时所有2）是主');
ok(SJ.groupOf(sc('H', '9'), ctx) === 'T', '主花色是主');
ok(SJ.groupOf(sc('S', '9'), ctx) === 'S', '非主花色非级牌是副牌');
ok(SJ.analyze([sc('H', '9'), sc('D', '9')], ctx) === null, '主9 + 副9 不能凑一对');
ok(SJ.analyze([sc('H', '9'), sc('S', '9')], ctx) === null, '跨门出牌不合法');
var ctxL3 = { level: '3', trumpSuit: 'H' };
ok(SJ.analyze([sc('H', '3'), sc('H', '3')], ctxL3).kind === 'pair', '打3时两张主3（♥3）可成对');
ok(SJ.analyze([sc('H', '9'), sc('H', '9'), sc('H', '10'), sc('H', '10')], ctx).kind === 'tractor', '主牌 ♥99♥1010 是拖拉机');
ok(SJ.analyze([sc('S', '9'), sc('S', '9'), sc('S', '10'), sc('S', '10')], ctx).kind === 'tractor', '副牌 ♠99♠1010 是拖拉机');
ok(SJ.scoreOfCards([sc('S', '5'), sc('H', '10'), sc('D', 'K')]) === 25, '5+10+K = 25 分');

/* ---------- 4~7. 完整对局模拟 ---------- */
function fakeRoom(gameId, n, options) {
  var players = [];
  for (var i = 0; i < n; i++) players.push({ id: 'p' + i, name: '玩家' + i });
  return {
    id: 'TEST', gameId: gameId, options: options || {},
    _players: players,
    activePlayers: function () { return this._players.slice(); }
  };
}
/**
 * 测试用 ctx。setTimer 不真的计时，只是把回调存起来，
 * 需要模拟「超时」时调用 c.fire() 手动触发最近一次定时回调。
 */
function ctxFor(room) {
  var box = { fns: [] };
  return {
    room: room,
    setTimer: function (fn, ms) { box.fns.push({ fn: fn, ms: ms }); },
    clearTimer: function () { box.fns = []; },
    fire: function () { var f = box.fns.shift(); if (f) f.fn(); },
    pending: function () { return box.fns.length; },
    broadcast: function () { }
  };
}

section('港式五张牌 · A：筹码守恒 + 继续游戏');
var stud5 = require('../server/games/stud5.js');
(function () {
  var hands = 0, continues = 0;
  for (var t = 0; t < 120; t++) {
    var room = fakeRoom('stud5', 2 + (t % 4));   // 五张牌牌组只有 28 张，最多 5 人
    stud5.init(room);
    var c = ctxFor(room);
    stud5.start(room, c);

    for (var h = 0; h < 4; h++) {                 // 连打 4 局，验证「继续游戏」与筹码守恒
      var guard = 0;
      while (room.state.stage === 'betting' && guard++ < 4000) {
        var cur = room.state.players[room.state.turnIndex];
        var act = Math.random();
        var type = act < 0.15 ? 'fold' : (act < 0.75 ? 'call' : 'raise');
        var r = stud5.handle(room, cur.id, { type: type }, c);
        if (!r.ok) { stud5.handle(room, cur.id, { type: 'call' }, c); }
      }
      if (room.state.stage !== 'settle') break;
      hands++;
      var total = 0;
      room.state.players.forEach(function (p) { total += p.chips; });
      var expect = room.state.opts.startChips * room.state.players.length;
      if (total !== expect) { console.log('  ✗ 筹码不守恒：' + total + ' != ' + expect); fail++; break; }
      stud5.start(room, c);                       // 「继续游戏」
      continues++;
    }
  }
  ok(hands >= 400, '共完成 ' + hands + ' 局（每局筹码都守恒）');
  ok(continues >= 400, '「继续游戏」成功衔接 ' + continues + ' 次');
})();

section('港式五张牌 · B：只剩一位有筹码自动结束 + 重新开始');
(function () {
  var autoEnded = 0, restarts = 0;
  for (var t = 0; t < 120; t++) {
    // 高底注 + 其他人都弃牌 → 几局内就只剩一位有筹码
    var room = fakeRoom('stud5', 3, { startChips: 1000, ante: 250, betUnit: 50, maxRaises: 3, suitTie: true });
    stud5.init(room);
    var c = ctxFor(room);
    stud5.start(room, c);

    var guard2 = 0;
    while (room.state.stage !== 'ended' && guard2++ < 40) {
      var g = 0;
      while (room.state.stage === 'betting' && g++ < 4000) {
        var cur = room.state.players[room.state.turnIndex];
        // 0 号玩家正常跟注，其他人一律弃牌 → 0 号通吃
        var type = (room.state.players.indexOf(cur) === 0) ? 'call' : 'fold';
        var r = stud5.handle(room, cur.id, { type: type }, c);
        if (!r.ok) stud5.handle(room, cur.id, { type: 'call' }, c);
      }
      if (room.state.stage === 'settle') stud5.start(room, c);
    }

    if (room.state.stage !== 'ended') { console.log('  ✗ 未能自动结束'); fail++; continue; }
    autoEnded++;
    if (room.state.gameOver !== true) { console.log('  ✗ 结束标记 gameOver 未置位'); fail++; }
    var fr = stud5.view(room, room.state.players[0].id);
    if (!(fr.finalRanking && fr.finalRanking.length === 3)) { console.log('  ✗ 结束界面缺少最终排名'); fail++; }
    if (fr.stage !== 'ended') { console.log('  ✗ view.stage 应为 ended'); fail++; }
    if (fr.liveCount !== 1) { console.log('  ✗ 结束时应有且仅有 1 位有筹码，实际 ' + fr.liveCount); fail++; }

    var rs = stud5.handle(room, room.state.players[0].id, { type: 'restart' }, c);
    if (!rs.ok) { console.log('  ✗ 重新开始失败：' + rs.error); fail++; continue; }
    restarts++;
    var after = stud5.view(room, room.state.players[0].id);
    if (after.stage !== 'betting' && after.stage !== 'ended') { console.log('  ✗ 重开后阶段异常：' + after.stage); fail++; }
    // 重开会立刻开局并扣底注，所以合法筹码只有「初始值」或「初始值 − 底注」
    var okChips = room.state.opts.startChips;
    var okChips2 = Math.max(0, room.state.opts.startChips - room.state.opts.ante);
    var bad = room.state.players.filter(function (p) {
      return p.chips !== okChips && p.chips !== okChips2;
    });
    if (bad.length) { console.log('  ✗ 重开后筹码未重置：' + bad.map(function (p) { return p.chips; }).join(',')); fail++; }
    if (room.state.hand !== 1) { console.log('  ✗ 重开后局数应从 1 开始，实际 ' + room.state.hand); fail++; }
  }
  ok(autoEnded >= 110, autoEnded + ' 场在只剩一位有筹码时自动结束');
  ok(restarts >= 110, '「重新开始」成功 ' + restarts + ' 次且筹码全部重置');
})();

section('港式五张牌 · C：下注顺序 / 暗牌数量 / 设置项');
(function () {
  function bestVisible(st) {
    var best = null, bs = null;
    st.orderIds.forEach(function (id) {
      var p = st.players.filter(function (x) { return x.id === id; })[0];
      if (!p || p.folded || p.chips <= 0) return;
      var sc = Poker.scoreVisible(p.up);
      if (!best || Poker.compareVisible(sc, bs) > 0) { best = p; bs = sc; }
    });
    return best;
  }

  var orderBad = 0, holeBad = 0, rounds = 0, upSeq = [];
  for (var t = 0; t < 60; t++) {
    var room = fakeRoom('stud5', 2 + (t % 4));
    stud5.init(room);
    var c = ctxFor(room);
    stud5.start(room, c);
    var lastStep = -1, g = 0;
    while (room.state.stage === 'betting' && g++ < 300) {
      var st = room.state;
      if (st.dealStep !== lastStep) {
        lastStep = st.dealStep;
        rounds++;
        if (t === 0) upSeq.push(st.players[0].up.length);
        var exp = bestVisible(st), act = st.players[st.turnIndex];
        if (act !== exp) orderBad++;
        // 每一轮都应当只有 1 张暗牌
        if (!st.players.every(function (p) { return p.hole.length === 1; })) holeBad++;
      }
      var cur = st.players[st.turnIndex];
      var r = stud5.handle(room, cur.id, { type: 'call' }, c);
      if (!r.ok) stud5.handle(room, cur.id, { type: 'fold' }, c);
    }
  }
  ok(orderBad === 0, rounds + ' 轮下注的起始位全部是「明牌牌面最大」的玩家（异常 ' + orderBad + ' 轮）');
  ok(holeBad === 0, '任何一轮下注时暗牌都只有 1 张（异常 ' + holeBad + ' 轮）');
  ok(upSeq.join(',') === '1,2,3,4', '明牌数量按 1→2→3→4 递增，实际 ' + upSeq.join(','));

  /* 明牌强弱：四条 > 三条 > 两对 > 一对 > 散牌，再比单张 */
  var S4 = function (a, b) { return Poker.compareVisible(Poker.scoreVisible(a), Poker.scoreVisible(b)); };
  var mkc = function (r) { return anyCard('S', r); };
  ok(S4([mkc('8'), mkc('8')], [mkc('9'), mkc('9')]) < 0, '明牌：对 8 < 对 9');
  ok(S4([mkc('8'), mkc('8'), mkc('8')], [mkc('A'), mkc('A')]) > 0, '明牌：三条 8 > 对 A');
  ok(S4([mkc('8'), mkc('8'), mkc('9'), mkc('9')], [mkc('A'), mkc('A'), mkc('8')]) > 0, '明牌：两对 > 一对');
  ok(S4([mkc('8'), mkc('8'), mkc('8'), mkc('8')], [mkc('A'), mkc('A'), mkc('A')]) > 0, '明牌：四条 > 三条');
  ok(S4([mkc('8'), mkc('9')], [mkc('8'), mkc('K')]) < 0, '明牌：散牌 8-9 < 8-K');

  /* 设置项：每轮最多加注次数 */
  (function () {
    var room = fakeRoom('stud5', 3, { startChips: 1000, ante: 10, betUnit: 20, maxRaises: 2, suitTie: true });
    stud5.init(room);
    var c = ctxFor(room);
    stud5.start(room, c);
    ok(room.state.opts.maxRaises === 2, 'maxRaises=2 被正确读入');
    var first = room.state.players[room.state.turnIndex];
    ok(stud5.handle(room, first.id, { type: 'raise' }, c).ok, '第 1 次加注允许');
    var second = room.state.players[room.state.turnIndex];
    ok(stud5.handle(room, second.id, { type: 'raise' }, c).ok, '第 2 次加注允许');
    var third = room.state.players[room.state.turnIndex];
    var r3 = stud5.handle(room, third.id, { type: 'raise' }, c);
    ok(!r3.ok && /加注次数/.test(r3.error || ''), '第 3 次加注被拒绝：' + (r3.error || ''));
  })();

  /* 设置项在大厅修改后，下一局立即生效（state.opts 不能停留在 init 时的旧值） */
  (function () {
    var M = require('../server/rooms.js');
    var room = M.createRoom('stud5');
    room.addPlayer('甲'); room.addPlayer('乙'); room.addPlayer('丙');
    var bc = function () { };
    room.startGame(bc);
    ok(room.state.opts.maxRaises === 3, '默认 maxRaises = 3');
    ok(room.state.opts.ante === 10, '默认 ante = 10');
    // 房主在大厅改设置
    room.options.maxRaises = 5;
    room.options.ante = 50;
    room.toLobby();
    room.startGame(bc);
    ok(room.state.opts.maxRaises === 5, '改设置后下一局 maxRaises 生效（5）');
    ok(room.state.opts.ante === 50, '改设置后下一局 ante 生效（50）');
    M.removeRoom(room.id);
  })();

  /* 重新开始也应采用最新设置 */
  (function () {
    var room = fakeRoom('stud5', 3, { startChips: 1000, ante: 10, betUnit: 20, maxRaises: 3, suitTie: true });
    stud5.init(room);
    var c = ctxFor(room);
    stud5.start(room, c);
    room.options.maxRaises = 7;
    room.state.stage = 'ended';
    room.state.gameOver = true;
    stud5.handle(room, room.state.players[0].id, { type: 'restart' }, c);
    ok(room.state.opts.maxRaises === 7, '重新开始后 maxRaises 采用最新设置');
    ok(room.state.hand === 1, '重新开始后局号回到 1');
  })();
})();

section('唬牌 · 模拟 200 局');
var cheat = require('../server/games/cheat.js');
(function () {
  var done = 0, challenges = 0, follows = 0, deadCircles = 0;

  /** 唬牌机器人：该领出就领出，能压过就有一半概率跟牌（有时吹牛），否则放弃 */
  function botAct(st, useJokers) {
    var cur = st.players[st.turnIndex];
    if (!cur) return null;
    var mustLead = (!st.lastPlay || st.lastPlay.playerId === cur.id);
    if (mustLead) {
      // 出最小的 1 张，如实喊
      var c = cur.hand[0];
      for (var i = 1; i < cur.hand.length; i++) {
        if (Cards.rankValue(cur.hand[i].rank) < Cards.rankValue(c.rank)) c = cur.hand[i];
      }
      return { type: 'play', cardIds: [c.id], rank: c.rank };
    }
    var prev = st.lastPlay;
    var higher = Cards.BS_RANKS.filter(function (r) { return Cards.rankValue(r) > Cards.rankValue(prev.rank); });
    if (useJokers) higher = higher.concat(['BJ', 'RJ']);

    // 方案零：跟相同点数，张数不限
    var sameRank = cur.hand.filter(function (x) { return x.rank === prev.rank; });
    if (sameRank.length && Math.random() < 0.35) {
      var k = 1 + Math.floor(Math.random() * sameRank.length);
      return { type: 'play', cardIds: sameRank.slice(0, k).map(function (x) { return x.id; }), rank: prev.rank };
    }
    // 方案一：同张数、点数更大
    var same = cur.hand.filter(function (x) { return Cards.rankValue(x.rank) > Cards.rankValue(prev.rank); });
    if (same.length >= prev.count && higher.length && Math.random() < 0.6) {
      var take = same.slice(0, prev.count);
      var rank = (Math.random() < 0.5 && higher.length) ? higher[higher.length - 1] : take[0].rank;
      return { type: 'play', cardIds: take.map(function (x) { return x.id; }), rank: rank };
    }
    // 方案二：张数更多
    if (cur.hand.length > prev.count && Math.random() < 0.5) {
      var take2 = cur.hand.slice(0, prev.count + 1);
      var rank2 = (Math.random() < 0.4 && higher.length) ? higher[higher.length - 1] : take2[0].rank;
      return { type: 'play', cardIds: take2.map(function (x) { return x.id; }), rank: rank2 };
    }
    return null; // 放弃
  }

  for (var t = 0; t < 200; t++) {
    var n = 2 + (t % 7);
    var useJ = (t % 5 === 0);
    var room = fakeRoom('cheat', n, { turnSeconds: 30, confirmSeconds: 15, useJokers: useJ });
    cheat.init(room);
    var c = ctxFor(room);
    cheat.start(room, c);
    var guard = 0;
    while (room.state.stage !== 'ended' && guard++ < 30000) {
      var st = room.state;
      if (st.stage === 'play') {
        var act = botAct(st, useJ);
        if (act) {
          var r = cheat.handle(room, st.players[st.turnIndex].id, act, c);
          if (!r.ok) { console.log('  ✗ 出牌失败：' + r.error); fail++; break; }
          follows++;
        } else {
          // 放弃前记录本轮最后一个出牌者
          var prevLeader = st.lastPlay ? st.lastPlay.playerId : null;
          var rp = cheat.handle(room, st.players[st.turnIndex].id, { type: 'pass' }, c);
          if (!rp.ok) { console.log('  ✗ 放弃失败：' + rp.error); fail++; break; }
          // 不变量：因全放弃而导致本圈结束时，出牌权必须还给最后一个出牌/跟牌的人
          if (prevLeader && st.stage === 'play' && st.lastPlay === null) {
            if (st.players[st.turnIndex].id !== prevLeader) {
              console.log('  ✗ 全放弃后出牌权未交给最后一个出牌者：应是 ' + prevLeader +
                '，实际 ' + st.players[st.turnIndex].id); fail++;
            }
          }
        }
      } else if (st.stage === 'challenge' && st.winPendingId) {
        // 出完手牌的质疑窗口：随机质疑或等超时
        if (Math.random() < 0.4) {
          var others = st.players.filter(function (p) { return p.id !== st.winPendingId; });
          var ch = others[Math.floor(Math.random() * others.length)];
          var play0 = st.lastPlay;
          var rc = cheat.handle(room, ch.id, { type: 'challenge' }, c);
          if (!rc.ok) { console.log('  ✗ 质疑失败：' + rc.error); fail++; }
          challenges++;
          // 不变量：质疑成功（是假）→ 出牌权必须归质疑方
          if (rc.ok && st.stage === 'play') {
            var fake0 = cheat._test.isFake(play0);
            var expectLeader = fake0 ? ch.id : play0.playerId;
            if (st.players[st.turnIndex].id !== expectLeader) {
              console.log('  ✗ 质疑后出牌权错误：应是 ' + expectLeader + '，实际 ' + st.players[st.turnIndex].id); fail++;
            }
          }
        } else {
          // 不等 15 秒，直接触发超时逻辑
          c.fire();
        }
      } else break;
    }
    if (room.state.stage === 'ended') {
      done++;
      var res = room.state.result;
      var sum = 0;
      res.ranking.forEach(function (r) { sum += r.score; });
      if (Math.abs(sum) > 0.001) { console.log('  ✗ 分数总和不为 0：' + sum); fail++; }
      if (res.ranking.length !== n) { console.log('  ✗ 排名人数不对'); fail++; }
      if (res.ranking[0].id !== res.winnerId) { console.log('  ✗ 第一名不是赢家'); fail++; }
      if (res.ranking[0].left !== 0) { console.log('  ✗ 赢家还有剩牌'); fail++; }
      // 赢家得分 = 输家剩余分总和
      var expect = 0;
      res.ranking.forEach(function (r) { if (r.id !== res.winnerId) expect += r.leftScore; });
      if (res.total !== expect) { console.log('  ✗ 赢家通吃分数不等于输家剩余分总和'); fail++; }
    }
  }
  ok(done >= 190, '200 局中 ' + done + ' 局正常结束');
  ok(follows > 500, '跟牌动作执行了 ' + follows + ' 次');
  ok(challenges > 30, '质疑动作执行了 ' + challenges + ' 次');
})();

section('唬牌 · 跟牌压牌规则');
(function () {
  var T = cheat._test;
  var mk = function (count, rank) { return { count: count, rank: rank }; };
  // 相同点数 → 张数不限
  ok(T.beats(mk(2, '7'), 1, '7'), '一张7 可以跟 两张7（同点数张数不限）');
  ok(T.beats(mk(2, '7'), 2, '7'), '两张7 可以跟 两张7（同点数张数不限）');
  ok(T.beats(mk(2, '7'), 3, '7'), '三张7 可以跟 两张7（同点数张数不限）');
  ok(T.beats(mk(2, '7'), 5, '7'), '五张7 可以跟 两张7（同点数张数不限）');
  ok(T.beats(mk(1, 'A'), 3, 'A'), '三张A 可以跟 一张A（同点数张数不限）');
  // 不同点数 → 张数更多，或同张数点数更大
  ok(T.beats(mk(2, '7'), 2, '9'), '两张9 压过 两张7（同张数点数更大）');
  ok(T.beats(mk(2, '7'), 3, '2'), '三张2 压过 两张7（张数更多）');
  ok(!T.beats(mk(2, '7'), 2, '5'), '两张5 压不过 两张7');
  ok(!T.beats(mk(2, '7'), 1, 'A'), '一张A 压不过 两张7（张数更少）');
  ok(!T.beats(mk(1, 'A'), 1, 'K'), '一张K 压不过 一张A');
  ok(!T.beats(mk(1, 'A'), 1, '2'), '一张2 压不过 一张A（A 是最大的普通牌）');
  ok(T.beats(mk(1, '2'), 1, 'BJ'), '小王 压过 2');
  ok(T.beats(mk(1, 'BJ'), 1, 'RJ'), '大王 压过 小王');
  ok(Cards.rankValue('A') === 14 && Cards.rankValue('2') === 2, '点数：A=14、2=2');
  ok(Cards.rankValue('BJ') === 15 && Cards.rankValue('RJ') === 16, '点数：小王=15、大王=16');
  ok(T.claimTextCN(mk(2, '7')) === '两张7', '文案「两张7」');
  ok(T.claimTextCN(mk(1, 'BJ')) === '一张小王', '文案「一张小王」');
  var hand = [anyCard('S', 'A'), anyCard('H', 'K'), anyCard('D', '5')];
  ok(T.remainingScore(hand) === 14 + 13 + 5, '剩余手牌计分 = 各张点数之和');
})();

section('唬牌 · 定向流程（全放弃淘汰 / 出完手牌三种结局）');
(function () {
  function scenario(n, opts) {
    var room = fakeRoom('cheat', n, opts || { turnSeconds: 30, confirmSeconds: 15, useJokers: false });
    cheat.init(room);
    var c = ctxFor(room);
    cheat.start(room, c);
    return { room: room, c: c };
  }
  function setHands(st, hands) {
    st.players.forEach(function (p, i) { p.hand = hands[i].slice(); });
    st.turnIndex = 0;
  }
  function act(s, idx, a) { return cheat.handle(s.room, s.room.state.players[idx].id, a, s.c); }

  /* 1) 其他所有玩家都放弃 → 圈牌作废，出牌权交给本轮最后一个出牌者 */
  (function () {
    var s = scenario(2);
    setHands(s.room.state, [[anyCard('S', '7'), anyCard('H', '8')], [anyCard('S', '9'), anyCard('H', '10')]]);
    ok(act(s, 0, { type: 'play', cardIds: [s.room.state.players[0].hand[0].id], rank: '7' }).ok, 'A 先喊「一张7」');
    ok(s.room.state.pile.length === 1, '圈里有 1 张牌');
    ok(act(s, 1, { type: 'pass' }).ok, 'B 放弃');
    ok(s.room.state.pile.length === 0, '圈牌被清空（淘汰牌不再翻开）');
    ok(s.room.state.lastPlay === null, '本圈喊牌基准已重置');
    ok(s.room.state.passIds.length === 0, '放弃记录已重置');
    ok(s.room.state.turnIndex === 0, '两人局：出牌权回到 A（最后一个出牌者）');
    var total = 0;
    s.room.state.players.forEach(function (p) { total += p.hand.length; });
    ok(total === 3, '两家手牌共 3 张（淘汰的那 1 张已离开游戏）');
  })();

  /* 1b) 4 人连续放弃：出牌权交给最后一个出牌/跟牌的人，而不是他的下一位 */
  (function () {
    var s = scenario(4);
    setHands(s.room.state, [
      [anyCard('S', '7'), anyCard('H', '8')],
      [anyCard('S', '9'), anyCard('H', '10')],
      [anyCard('S', 'K'), anyCard('H', 'Q')],
      [anyCard('S', 'A'), anyCard('H', 'J')]
    ]);
    act(s, 0, { type: 'play', cardIds: [s.room.state.players[0].hand[0].id], rank: '7' });
    ok(s.room.state.turnIndex === 1, 'A 领出后轮到 B');
    act(s, 1, { type: 'pass' });
    ok(s.room.state.turnIndex === 2, 'B 放弃后轮到 C');
    act(s, 2, { type: 'pass' });
    ok(s.room.state.turnIndex === 3, 'C 放弃后轮到 D');
    act(s, 3, { type: 'pass' });
    ok(s.room.state.lastPlay === null, '全部放弃 → 牌型基准重置');
    ok(s.room.state.turnIndex === 0, '全部放弃 → 出牌权回到 A（最后一个出牌者，而非下一位 B）');
    // A 现在必须领出，且可以喊任意合法新牌型
    var v = cheat.view(s.room, s.room.state.players[0].id);
    ok(v.mustLead === true, 'A 处于领出状态（无基准）');
    ok(v.canPass === false, '领出时不能放弃');
  })();

  /* 1c) 中间有人跟牌：最后一个跟牌者获得新轮先手权 */
  (function () {
    var s = scenario(4);
    setHands(s.room.state, [
      [anyCard('S', '7'), anyCard('H', '8')],
      [anyCard('S', '7'), anyCard('H', '9')],
      [anyCard('S', 'K'), anyCard('H', 'Q')],
      [anyCard('S', 'A'), anyCard('H', 'J')]
    ]);
    act(s, 0, { type: 'play', cardIds: [s.room.state.players[0].hand[0].id], rank: '7' });
    act(s, 1, { type: 'play', cardIds: [s.room.state.players[1].hand[0].id], rank: '7' });  // B 跟牌
    act(s, 2, { type: 'pass' });
    act(s, 3, { type: 'pass' });
    act(s, 0, { type: 'pass' });
    ok(s.room.state.lastPlay === null, '全部放弃 → 牌型基准重置');
    ok(s.room.state.turnIndex === 1, '全部放弃 → 出牌权回到 B（最后一个跟牌者）');
  })();

  /* 1d) 最后出牌者连续开新轮：每次都由同一个人领出，圈牌持续作废 */
  (function () {
    var s = scenario(3);
    setHands(s.room.state, [
      [anyCard('S', '7'), anyCard('H', '8'), anyCard('D', '9'), anyCard('C', '10')],
      [anyCard('S', 'K'), anyCard('H', 'Q')],
      [anyCard('S', 'A'), anyCard('H', 'J')]
    ]);
    var totalBefore = 0;
    s.room.state.players.forEach(function (p) { totalBefore += p.hand.length; });

    for (var round = 1; round <= 3; round++) {
      // A 领出 1 张
      var a = s.room.state.players[0];
      ok(act(s, 0, { type: 'play', cardIds: [a.hand[0].id], rank: a.hand[0].rank }).ok, '第 ' + round + ' 轮：A 领出');
      ok(s.room.state.stage === 'play' && s.room.state.turnIndex === 1, '第 ' + round + ' 轮：A 领出后轮到 B');
      // B、C 都放弃
      act(s, 1, { type: 'pass' });
      act(s, 2, { type: 'pass' });
      ok(s.room.state.lastPlay === null, '第 ' + round + ' 轮：全部放弃后基准重置');
      ok(s.room.state.turnIndex === 0, '第 ' + round + ' 轮：出牌权仍归 A（连续开新轮）');
      ok(s.room.state.pile.length === 0, '第 ' + round + ' 轮：圈牌已作废');
      ok(s.room.state.stage === 'play', '第 ' + round + ' 轮：仍处于出牌阶段');
    }
    // 每轮作废 1 张，3 轮共 3 张离开游戏
    var totalAfter = 0;
    s.room.state.players.forEach(function (p) { totalAfter += p.hand.length; });
    ok(totalAfter === totalBefore - 3, '连续 3 轮各作废 1 张（' + totalBefore + ' → ' + totalAfter + '）');
    ok(s.room.state.players[0].hand.length === 1, 'A 还剩 1 张（未出完，游戏继续）');
  })();

  /* 1e) 新轮里可以宣布任意合法新牌型（不再受上一轮基准约束） */
  (function () {
    var s = scenario(3);
    setHands(s.room.state, [
      [anyCard('S', '3'), anyCard('H', '4'), anyCard('D', '5'), anyCard('C', '6'), anyCard('S', '8')],
      [anyCard('S', 'K'), anyCard('H', 'Q')],
      [anyCard('S', 'A'), anyCard('H', 'J')]
    ]);
    // 第一轮：A 喊「一张3」（最小点数）
    var a = s.room.state.players[0];
    act(s, 0, { type: 'play', cardIds: [a.hand[0].id], rank: '3' });
    act(s, 1, { type: 'pass' });
    act(s, 2, { type: 'pass' });
    ok(s.room.state.lastPlay === null && s.room.state.turnIndex === 0, '全部放弃，A 开新轮');
    // 新轮里 A 直接喊「三张5」—— 上一轮基准是「一张3」，按旧逻辑会因张数/点数被拒
    var a2 = s.room.state.players[0];
    var three = a2.hand.slice(0, 3);
    var r = act(s, 0, { type: 'play', cardIds: three.map(function (x) { return x.id; }), rank: '5' });
    ok(r.ok, '新轮中可宣布全新牌型「三张5」（不受上一轮「一张3」约束）');
    ok(s.room.state.lastPlay && s.room.state.lastPlay.count === 3 && s.room.state.lastPlay.rank === '5',
      '新牌型已生效：三张5');
    ok(s.room.state.stage === 'play', 'A 未出完，仍处于出牌阶段');
    // 新基准生效后，其他人必须按新基准压牌
    var ti = s.room.state.turnIndex;
    var b = s.room.state.players[ti];
    var bad = act(s, ti, { type: 'play', cardIds: [b.hand[0].id], rank: '4' });
    ok(!bad.ok, '新基准下「一张4」压不过「三张5」');
  })();

  /* 2) 跟牌：同点数张数不限；不同点数需张数更多或同张数点数更大 */
  (function () {
    var s = scenario(3);
    setHands(s.room.state, [
      [anyCard('S', '7'), anyCard('H', '8'), anyCard('D', '9')],
      [anyCard('S', '7'), anyCard('H', '7'), anyCard('D', '5')],
      [anyCard('S', 'K'), anyCard('C', 'K')]
    ]);
    act(s, 0, { type: 'play', cardIds: [s.room.state.players[0].hand[0].id], rank: '7' });
    // 同点数：张数不限 —— 只跟 1 张 7 也应该允许
    var sameOne = act(s, 1, { type: 'play', cardIds: [s.room.state.players[1].hand[0].id], rank: '7' });
    ok(sameOne.ok, '上家「一张7」时跟 1 张 7 允许（同点数张数不限）');
    ok(s.room.state.lastPlay.count === 1, '新喊牌张数为 1');
    // 不同点数、张数不占优 → 拒绝
    var st = s.room.state;
    var cur = st.players[st.turnIndex];
    var bad = cheat.handle(s.room, cur.id, { type: 'play', cardIds: [cur.hand[0].id], rank: '5' }, s.c);
    ok(!bad.ok, '不同点数且张数不占优 → 被拒绝');
    // 不同点数、同张数点数更大 → 允许
    var okc = cheat.handle(s.room, cur.id, { type: 'play', cardIds: [cur.hand[0].id], rank: 'K' }, s.c);
    ok(okc.ok, '不同点数、点数更大 → 允许');
    // 张数更多（哪怕点数更小）→ 允许
    var st2 = s.room.state;
    var cur2 = st2.players[st2.turnIndex];
    ok(cur2.hand.length >= 2, '当前玩家有至少 2 张牌可跟');
    var two = cur2.hand.slice(0, 2);
    var r2 = cheat.handle(s.room, cur2.id, { type: 'play', cardIds: two.map(function (x) { return x.id; }), rank: '3' }, s.c);
    ok(r2.ok, '张数更多 → 允许（哪怕点数更小）');
    ok(st2.lastPlay.count === 2, '新喊牌张数为 2');
  })();

  /* 3) 出完手牌 + 无人质疑 → 获胜 */
  (function () {
    var s = scenario(2);
    setHands(s.room.state, [[anyCard('S', '7')], [anyCard('S', '9'), anyCard('H', 'K')]]);
    ok(act(s, 0, { type: 'play', cardIds: [s.room.state.players[0].hand[0].id], rank: '7' }).ok, 'A 打出最后一张');
    ok(s.room.state.stage === 'challenge' && s.room.state.winPendingId === s.room.state.players[0].id, '进入质疑确认窗口');
    s.c.fire();   // 超时无人质疑
    ok(s.room.state.stage === 'ended', '超时后游戏结束');
    ok(s.room.state.result.winnerId === s.room.state.players[0].id, 'A 获胜');
    ok(s.room.state.result.total === 9 + 13, '赢家通吃 = 输家剩余分（9 + K = 22）');
    ok(s.room.state.result.ranking[0].score === 22, '赢家得 22 分');
    ok(s.room.state.result.ranking[1].score === -22, '输家扣 22 分');
  })();

  /* 4) 出完手牌 + 被质疑但属实 → 质疑者收牌，出完者依然获胜 */
  (function () {
    var s = scenario(2);
    setHands(s.room.state, [[anyCard('S', '7')], [anyCard('S', '9')]]);
    act(s, 0, { type: 'play', cardIds: [s.room.state.players[0].hand[0].id], rank: '7' });
    var r = act(s, 1, { type: 'challenge' });
    ok(r.ok, 'B 发起质疑');
    ok(s.room.state.players[1].hand.length === 2, '声称属实 → 圈牌归质疑者');
    ok(s.room.state.stage === 'ended', '出完手牌者依然获胜');
    ok(s.room.state.result.winnerId === s.room.state.players[0].id, 'A 获胜');
  })();

  /* 5) 出完手牌 + 被质疑且是假 → 圈牌归喊牌者，出牌权归质疑方，游戏继续 */
  (function () {
    var s = scenario(2);
    setHands(s.room.state, [[anyCard('S', '7')], [anyCard('S', '9')]]);
    act(s, 0, { type: 'play', cardIds: [s.room.state.players[0].hand[0].id], rank: '9' }); // 吹牛
    var r = act(s, 1, { type: 'challenge' });
    ok(r.ok, 'B 发起质疑');
    ok(s.room.state.players[0].hand.length === 1, '吹牛被抓 → 圈牌归喊牌者（回到 1 张）');
    ok(s.room.state.players[1].hand.length === 1, '质疑方不收牌');
    ok(s.room.state.stage === 'play', '游戏继续');
    ok(s.room.state.turnIndex === 1, '出牌权移交给质疑方（bug1 修复点）');
    // 质疑方现在真的能出牌
    var rr = act(s, 1, { type: 'play', cardIds: [s.room.state.players[1].hand[0].id], rank: '9' });
    ok(rr.ok, '质疑方获得出牌权后可以立即喊牌');
  })();

  /* 6) 普通质疑：假 → 圈牌归喊牌者、出牌权归质疑方；真 → 圈牌归质疑者、出牌权归喊牌者 */
  (function () {
    var s = scenario(2);
    setHands(s.room.state, [[anyCard('S', '7'), anyCard('H', '8')], [anyCard('S', '9')]]);
    act(s, 0, { type: 'play', cardIds: [s.room.state.players[0].hand[0].id], rank: '9' }); // 吹牛
    act(s, 1, { type: 'challenge' });
    ok(s.room.state.players[0].hand.length === 2, '假 → 圈牌归喊牌者');
    ok(s.room.state.turnIndex === 1, '质疑成功 → 出牌权归质疑方');
    // 质疑方立刻能出牌
    var rr = act(s, 1, { type: 'play', cardIds: [s.room.state.players[1].hand[0].id], rank: '9' });
    ok(rr.ok, '质疑方接着喊牌成功');

    var s2 = scenario(2);
    setHands(s2.room.state, [[anyCard('S', '7'), anyCard('H', '8')], [anyCard('S', '9')]]);
    act(s2, 0, { type: 'play', cardIds: [s2.room.state.players[0].hand[0].id], rank: '7' }); // 属实
    act(s2, 1, { type: 'challenge' });
    ok(s2.room.state.players[1].hand.length === 2, '真 → 圈牌归质疑者');
    ok(s2.room.state.turnIndex === 0, '质疑失败 → 出牌权归喊牌者');
    var rr2 = act(s2, 0, { type: 'play', cardIds: [s2.room.state.players[0].hand[0].id], rank: '8' });
    ok(rr2.ok, '喊牌者接着喊牌成功');
  })();

  /* 7) 30 秒无响应 → 自动放弃；必须领出时自动出最小的 1 张并如实喊 */
  (function () {
    var s = scenario(2);
    setHands(s.room.state, [[anyCard('S', '7'), anyCard('H', '8')], [anyCard('S', '9')]]);
    act(s, 0, { type: 'play', cardIds: [s.room.state.players[0].hand[0].id], rank: '7' });
    s.c.fire();   // B 超时
    ok(s.room.state.lastPlay === null && s.room.state.turnIndex === 0,
      '超时自动放弃，两人局随即全放弃 → 淘汰牌清空，出牌权回到 A（最后一个出牌者）');

    var s2 = scenario(2);
    setHands(s2.room.state, [[anyCard('S', 'K'), anyCard('H', '3')], [anyCard('S', '9')]]);
    ok(s2.room.state.lastPlay === null, '开局无人喊牌，A 必须领出');
    s2.c.fire();  // A 超时
    ok(s2.room.state.lastPlay !== null, '必须领出时自动出了牌');
    ok(s2.room.state.lastPlay.count === 1 && s2.room.state.lastPlay.rank === '3',
      '自动出手里最小的 1 张（3）并如实喊');
  })();

  /* 8) 万能王 */
  (function () {
    var s = scenario(2, { turnSeconds: 30, confirmSeconds: 15, useJokers: true });
    ok(s.room.state.players.reduce(function (n, p) { return n + p.hand.length; }, 0) === 54,
      '开启万能牌时共发 54 张');
    var st = s.room.state;
    setHands(st, [[anyCard('J', 'BJ'), anyCard('S', '3')], [anyCard('S', '9')]]);
    act(s, 0, { type: 'play', cardIds: [st.players[0].hand[0].id], rank: '7' });
    ok(cheat._test.isFake(st.lastPlay) === false, '小王当万能牌，喊 7 也不算假');

    var s2 = scenario(2, { turnSeconds: 30, confirmSeconds: 15, useJokers: false });
    var noJoker = s2.room.state.players.every(function (p) {
      return p.hand.every(function (c) { return !c.joker; });
    });
    ok(noJoker, '未开启万能牌时牌堆里没有王');
    ok(s2.room.state.players.reduce(function (n, p) { return n + p.hand.length; }, 0) === 52, '共发 52 张');
  })();
})();
var baohuang = require('../server/games/baohuang.js');
(function () {
  var done = 0;
  for (var t = 0; t < 100; t++) {
    var n = 4 + (t % 2);
    var room = fakeRoom('baohuang', n);
    baohuang.init(room);
    var c = ctxFor(room);
    baohuang.start(room, c);
    baohuang.handle(room, room.state.emperorId, { type: 'choose', solo: (t % 3 === 0), guardKey: 'BJ' }, c);
    if (room.state.stage === 'guardChoose') {
      baohuang.handle(room, room.state.guardId, { type: 'choose', open: (t % 2 === 0) }, c);
    }
    var guard = 0;
    while (room.state.stage === 'play' && guard++ < 20000) {
      var st = room.state;
      var cur = null;
      for (var i = 0; i < st.players.length; i++) if (st.players[i].id === st.turnId) cur = st.players[i];
      if (!cur) break;
      var mustLead = (!st.lastCombo || st.lastPlayerId === cur.id);
      var played = false;
      if (mustLead) {
        var one = [cur.hand[cur.hand.length - 1]];
        played = baohuang.handle(room, cur.id, { type: 'play', cardIds: [one[0].id] }, c).ok;
      } else {
        var beat = Combos.findBeat(cur.hand, st.lastCombo);
        if (beat) {
          played = baohuang.handle(room, cur.id, { type: 'play', cardIds: beat.map(function (x) { return x.id; }) }, c).ok;
        }
        if (!played) {
          var rp = baohuang.handle(room, cur.id, { type: 'pass' }, c);
          if (!rp.ok) { console.log('  ✗ 过牌失败：' + rp.error); break; }
        }
      }
      if (!played && mustLead) { console.log('  ✗ 领出失败'); break; }
    }
    if (room.state.stage === 'ended') {
      done++;
      var res = room.state.result;
      var sum = 0;
      res.ranking.forEach(function (r) { sum += r.delta; });
      if (Math.abs(sum) > 0.001) { console.log('  ✗ 分数总和不为 0：' + sum); fail++; }
      if (res.ranking.some(function (r) { return !isFinite(r.delta) || r.delta % 1 !== 0; })) {
        console.log('  ✗ 出现非整数分数'); fail++;
      }
    }
  }
  ok(done >= 90, '100 局中 ' + done + ' 局正常结束');
})();

section('升级 · 模拟 30 局');
var shengji = require('../server/games/shengji.js');
(function () {
  var done = 0;
  for (var t = 0; t < 30; t++) {
    var room = fakeRoom('shengji', 4, { startLevel: '2', allowThrow: true, bottomDouble: true });
    shengji.init(room);
    var c = ctxFor(room);
    shengji.start(room, c);
    shengji.handle(room, bySeatId(room), { type: 'chooseTrump', suit: ['S', 'H', 'D', 'C'][t % 4] }, c);
    shengji.handle(room, bySeatId(room), { type: 'discard', auto: true }, c);
    var guard = 0;
    var ctx2 = { level: room.state.level, trumpSuit: room.state.trumpSuit };
    while (room.state.stage === 'play' && guard++ < 5000) {
      var st = room.state;
      var cur = null;
      for (var i = 0; i < st.players.length; i++) if (st.players[i].seat === st.turnSeat) cur = st.players[i];
      if (!cur) break;
      var ids;
      if (!st.trick.length) {
        ids = [cur.hand[cur.hand.length - 1].id];
      } else {
        var lead = st.trick[0].combo;
        var lg = lead.group;
        var same = cur.hand.filter(function (x) { return SJ.groupOf(x, ctx2) === lg; });
        var need = Math.min(same.length, lead.size);
        var pick = same.slice(same.length - need);
        if (pick.length < lead.size) {
          var rest = cur.hand.filter(function (x) { return pick.indexOf(x) < 0; });
          pick = pick.concat(rest.slice(0, lead.size - pick.length));
        }
        ids = pick.map(function (x) { return x.id; });
      }
      var r = shengji.handle(room, cur.id, { type: 'play', cardIds: ids }, c);
      if (!r.ok) { console.log('  ✗ 升级出牌失败：' + r.error); break; }
    }
    if (room.state.stage === 'ended') done++;
  }
  ok(done >= 25, '30 局中 ' + done + ' 局正常打完');
  function bySeatId(room) {
    var st = room.state;
    for (var i = 0; i < st.players.length; i++) if (st.players[i].seat === st.bankerSeat) return st.players[i].id;
    return st.players[0].id;
  }
})();

console.log('\n---------------------------------------');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
