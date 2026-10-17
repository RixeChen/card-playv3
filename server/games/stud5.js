/* =====================================================================
 * 港式五张牌（梭哈 / Show Hand）
 *
 * 采用的玩法版本（有歧义处按港式通行做法，均已在下方注明）：
 *   1) 牌组点数只保留 8、9、10、J、Q、K、A（2~7 已剔除），共 7 点数 × 4 花色 = 28 张。
 *      这是刻意选择：牌更少 → 下注轮次更少、成牌更快、一局时间更短。
 *      代价是「28 张 ÷ 每人 5 张 → 最多 5 人」，所以本游戏上限是 5 人。
 *   2) 发牌结构：每家 **1 张暗牌（底牌）+ 4 张明牌**，共 5 张。
 *      ※ 玩法版本说明：港式五张牌有「末张暗牌（1 暗 + 3 明 + 1 暗）」和
 *        「末张明牌（1 暗 + 4 明）」两种通行做法。本实现采用后者：
 *        这样任何一轮下注时都只有一张暗牌，且每轮都能按明牌牌面决定谁先说话，
 *        与「每发一张牌后由牌面大者先下注」的规则完全自洽。
 *   3) 下注顺序：每发一张明牌后进入一轮下注，共 4 轮。
 *      **每一轮的起始位都是「明牌牌面最大」的玩家**（从发第 2 张牌起即是如此）。
 *      明牌强弱按 四条>三条>两对>一对>散牌，再比单张大小；完全相同则座位靠前者先。
 *   4) 下注动作：弃牌 / 让牌(过) / 跟注 / 加注 / 全下。每轮加注次数有上限（默认 3 次）。
 *   5) 有底注（ante）。底注不算在「本轮下注额」里，因此第一轮人人都可让牌。
 *   6) 牌力：同花顺 > 四条 > 葫芦 > 同花 > 顺子 > 三条 > 两对 > 一对 > 散牌。
 *      因 2~7 已剔除，A2345 小顺子不可能出现；最大顺子为 A K Q J 10。
 *   7) 平局：若开启「比花色」（默认开），按 ♠>♥>♦>♣ 依次比每张牌；否则并列平分彩池。
 *   8) 支持边池（all-in 时按投入额分层结算），未被跟注的下注会退还。
 *   9) 筹码归零的玩家视为出局，不再参与下一局。
 *  10) 连局机制：每局结束后点「继续游戏」进入下一局，筹码累计；
 *      当只剩一名玩家还有筹码时自动结束，结束界面显示最终排名，
 *      房主可点「重新开始」把所有人恢复成初始筹码、重新开局。
 * ===================================================================== */
'use strict';
var Cards = require('../../public/shared/cards.js');
var Poker = require('../../public/shared/poker.js');

/** 港式五张牌专用牌组：只留 8~A（2~7 已剔除） */
var STUD_RANKS = ['8', '9', '10', 'J', 'Q', 'K', 'A'];

var DEFAULTS = { startChips: 1000, ante: 10, betUnit: 20, maxRaises: 3, suitTie: true };

var OPTION_FIELDS = [
  { key: 'startChips', label: '初始筹码', type: 'number', min: 100, max: 100000, step: 100 },
  { key: 'ante', label: '每局底注', type: 'number', min: 0, max: 2000, step: 5 },
  { key: 'betUnit', label: '加注单位', type: 'number', min: 5, max: 2000, step: 5 },
  { key: 'maxRaises', label: '每轮最多加注次数', type: 'number', min: 1, max: 10, step: 1 },
  { key: 'suitTie', label: '完全同点时比花色 ♠>♥>♦>♣（港式）', type: 'bool' }
];

var RULES = [
  '牌组只保留 8、9、10、J、Q、K、A，共 28 张，因此最多 5 人。',
  '每家 5 张：1 张暗牌（底牌）+ 4 张明牌。',
  '每发一张明牌后下注一轮，共 4 轮。',
  '每一轮都由「明牌牌面最大」的玩家先说话（四条>三条>两对>一对>散牌，再比单张）。',
  '动作：弃牌 / 让牌 / 跟注 / 加注 / 全下。',
  '牌型：同花顺 > 四条 > 葫芦 > 同花 > 顺子 > 三条 > 两对 > 一对 > 散牌。',
  '最大顺子是 A K Q J 10；完全同点默认比花色 ♠>♥>♦>♣。',
  '筹码输光即出局；每局结束可继续，只剩一位有筹码时结束并可重新开始。'
];

function mk(p, chips) {
  return {
    id: p.id, name: p.name, chips: chips,
    hole: [], up: [], folded: false, roundBet: 0, totalBet: 0, acted: false, handInfo: null
  };
}

function init(room) {
  var opts = {};
  for (var k in DEFAULTS) opts[k] = (room.options && room.options[k] !== undefined) ? room.options[k] : DEFAULTS[k];
  room.state = {
    ui: 'stud5', opts: opts, hand: 0, dealerIndex: -1, deck: [],
    players: room.activePlayers().map(function (p) { return mk(p, opts.startChips); }),
    pot: 0, currentBet: 0, raiseCount: 0, turnIndex: -1,
    stage: 'idle', dealStep: 0, orderIds: [], log: [], result: null, gameOver: false
  };
  return room.state;
}

function idxOf(st, id) { for (var i = 0; i < st.players.length; i++) if (st.players[i].id === id) return i; return -1; }
function byId(st, id) { return st.players[idxOf(st, id)]; }
function log(st, s) { st.log.push(s); if (st.log.length > 60) st.log.shift(); }

/** 开始新一局（支持中途加入的新玩家：以初始筹码入座） */
function start(room, ctx) {
  var st = room.state;
  if (!st) { init(room); st = room.state; }
  var opts = st.opts;

  var active = room.activePlayers();
  var known = {};
  st.players.forEach(function (p) { known[p.id] = p; });

  // 新加入的玩家入座（带着初始筹码）
  active.forEach(function (p) {
    if (!known[p.id]) st.players.push(mk(p, opts.startChips));
  });
  // 已离开房间的玩家标记出局
  var presentIds = {};
  active.forEach(function (p) { presentIds[p.id] = 1; });
  st.players.forEach(function (p) { if (!presentIds[p.id]) { p.chips = 0; p.folded = true; } });

  var live = st.players.filter(function (p) { return p.chips > 0; });
  if (live.length < 2) {
    st.gameOver = true; st.stage = 'ended'; st.result = null;
    log(st, '有筹码的玩家不足 2 人，无法开局');
    return;
  }

  st.hand += 1;
  st.deck = Cards.shuffle(Cards.createShoe(1, false, STUD_RANKS));
  st.pot = 0; st.currentBet = 0; st.raiseCount = 0; st.result = null; st.dealStep = 0;
  st.gameOver = false;
  st.players.forEach(function (p) {
    p.hole = []; p.up = []; p.roundBet = 0; p.totalBet = 0; p.acted = false; p.handInfo = null;
  });

  // 底注（扣完之后再把筹码归零的玩家标记为弃牌/出局）
  for (var i = 0; i < live.length; i++) {
    var a = Math.min(opts.ante, live[i].chips);
    live[i].chips -= a; live[i].totalBet += a; st.pot += a;
  }
  if (opts.ante > 0) log(st, '每人下底注 ' + opts.ante);
  st.players.forEach(function (p) { p.folded = (p.chips <= 0); });

  // 轮换庄家：找下一个还有筹码的座位
  var n = st.players.length;
  var d = st.dealerIndex;
  for (var t = 1; t <= n; t++) {
    var cand = (d + t + n) % n;
    if (st.players[cand].chips > 0) { st.dealerIndex = cand; break; }
  }

  // 发牌顺序：庄家下家开始
  var order = [];
  for (var x = 1; x <= n; x++) {
    var pi = (st.dealerIndex + x) % n;
    if (st.players[pi].chips > 0) order.push(st.players[pi]);
  }
  st.orderIds = order.map(function (p) { return p.id; });
  for (var r = 0; r < order.length; r++) order[r].hole.push(st.deck.pop());
  for (var r2 = 0; r2 < order.length; r2++) order[r2].up.push(st.deck.pop());
  log(st, '第 ' + st.hand + ' 局开始，发到底牌 + 1 张明牌');
  startBetting(st);
}

function startBetting(st) {
  st.stage = 'betting';
  st.currentBet = 0; st.raiseCount = 0;
  st.players.forEach(function (p) { p.roundBet = 0; p.acted = false; });

  // 每一轮的下注起始位都是「明牌牌面最大」的玩家（从发第 2 张牌起即是如此）。
  // 明牌强弱：四条 > 三条 > 两对 > 一对 > 散牌，再依次比单张；完全相同则座位靠前者先。
  var best = null, bestScore = null;
  for (var i = 0; i < st.orderIds.length; i++) {
    var p = byId(st, st.orderIds[i]);
    if (!p || p.folded || p.chips <= 0) continue;
    var sc = Poker.scoreVisible(p.up);
    if (!best || Poker.compareVisible(sc, bestScore) > 0) { best = p; bestScore = sc; }
  }
  var startId = best ? best.id : st.orderIds[0];
  st.turnIndex = idxOf(st, startId);

  if (!anyoneCanAct(st)) endBetting(st);
}

function anyoneCanAct(st) {
  return st.players.some(function (p) { return !p.folded && p.chips > 0; });
}

function advanceTurn(st) {
  var n = st.players.length;
  for (var i = 1; i <= n; i++) {
    var idx = (st.turnIndex + i) % n;
    var p = st.players[idx];
    if (p.folded || p.chips <= 0) continue;
    if (p.roundBet < st.currentBet || !p.acted) { st.turnIndex = idx; return; }
  }
  endBetting(st);
}

function endBetting(st) {
  var alive = st.players.filter(function (p) { return !p.folded; });
  if (alive.length <= 1) { settle(st); return; }
  if (st.dealStep < 3) {
    st.dealStep += 1;
    // 采用「1 暗 + 4 明」：第 3、4、5 张全部明牌，因此任何一轮都只有一张暗牌
    var send = 'up';
    for (var i = 0; i < st.orderIds.length; i++) {
      var p = byId(st, st.orderIds[i]);
      if (p.folded) continue;
      var c = st.deck.pop();
      p.up.push(c);
    }
    log(st, '发第 ' + (st.dealStep + 1) + ' 张牌（明牌）');
    startBetting(st);
  } else {
    settle(st);
  }
}

function resetActedExcept(st, id) {
  st.players.forEach(function (p) { if (p.id !== id) p.acted = false; });
}

function handle(room, playerId, action, ctx) {
  var st = room.state;
  if (!st) return { ok: false, error: '牌局尚未开始' };
  action = action || {};

  // 「重新开始」：所有人恢复初始筹码，立刻重新开局
  if (action.type === 'restart') {
    init(room);
    st = room.state;
    ctx.room.phase = 'lobby';
    if (room.activePlayers().length >= 2) {
      start(room, ctx);
      ctx.room.phase = 'playing';
      return { ok: true };
    }
    log(st, '已重置为初始状态，人数够 2 人后由房主点「开始游戏」');
    return { ok: true };
  }

  if (st.stage === 'settle') return { ok: false, error: '本局已结束，请房主点「继续游戏」' };
  if (st.stage === 'ended') return { ok: false, error: '游戏已结束，请房主点「重新开始」' };
  if (st.stage !== 'betting') return { ok: false, error: '当前不是下注阶段' };

  var cur = st.players[st.turnIndex];
  if (!cur || cur.id !== playerId) return { ok: false, error: '还没轮到你' };
  var p = cur;

  if (action.type === 'fold') {
    p.folded = true; log(st, p.name + ' 弃牌');
  } else if (action.type === 'call') {
    var need = st.currentBet - p.roundBet;
    var pay = Math.min(need, p.chips);
    p.chips -= pay; p.roundBet += pay; p.totalBet += pay;
    log(st, p.name + (pay > 0 ? (' 跟注 ' + pay) : ' 让牌'));
  } else if (action.type === 'raise') {
    if (st.raiseCount >= st.opts.maxRaises) return { ok: false, error: '本轮加注次数已用完，只能跟注或弃牌' };
    var want = st.currentBet + st.opts.betUnit - p.roundBet;
    if (p.chips <= want) return { ok: false, error: '筹码不足，请选择「全下」' };
    p.chips -= want; p.roundBet += want; p.totalBet += want;
    st.currentBet = p.roundBet; st.raiseCount++;
    resetActedExcept(st, p.id);
    log(st, p.name + ' 加注到 ' + st.currentBet);
  } else if (action.type === 'allin') {
    var payAll = p.chips;
    p.chips = 0; p.roundBet += payAll; p.totalBet += payAll;
    if (p.roundBet > st.currentBet) { st.currentBet = p.roundBet; st.raiseCount++; resetActedExcept(st, p.id); }
    log(st, p.name + ' 全下 ' + payAll);
  } else {
    return { ok: false, error: '未知动作' };
  }

  p.acted = true;
  advanceTurn(st);
  return { ok: true };
}

  /**
   * 分层彩池（边池）。
   * 关键点：只统计到「还没折叠的玩家中最大投入额」为止，
   * 超出这个额度的部分是「没人跟注的下注」，必须退还给下注者本人，
   * 否则筹码会凭空消失（这是实现时最容易漏的一处）。
   */
  function buildPots(players) {
    var active = players.filter(function (p) { return !p.folded; });
    var maxActive = 0;
    active.forEach(function (p) { if (p.totalBet > maxActive) maxActive = p.totalBet; });

    var levels = [];
    players.forEach(function (p) {
      if (p.totalBet > 0 && p.totalBet <= maxActive && levels.indexOf(p.totalBet) < 0) levels.push(p.totalBet);
    });
    levels.sort(function (a, b) { return a - b; });

    var pots = [], prev = 0;
    levels.forEach(function (lv) {
      var amount = 0, elig = [];
      players.forEach(function (p) {
        if (p.totalBet >= lv) {
          amount += lv - prev;
          if (!p.folded && elig.indexOf(p.id) < 0) elig.push(p.id);
        }
      });
      if (amount > 0 && elig.length) pots.push({ amount: amount, eligible: elig });
      prev = lv;
    });

    // 未被跟注的部分退还
    var returned = {};
    players.forEach(function (p) {
      if (p.totalBet > maxActive) returned[p.id] = p.totalBet - maxActive;
    });
    return { pots: pots, returned: returned };
  }

function settle(st) {
  st.stage = 'settle';
  st.turnIndex = -1;
  // 只让「拿到完整 5 张牌且没弃牌」的玩家参与比大小（防御性过滤）
  var alive = st.players.filter(function (p) { return !p.folded && (p.hole.length + p.up.length) === 5; });
  if (!alive.length) alive = st.players.filter(function (p) { return !p.folded; });
  var hands = {};
  alive.forEach(function (p) {
    p.handInfo = Poker.evaluate(p.hole.concat(p.up));
    hands[p.id] = p.handInfo;
  });

  var payouts = {};
  st.players.forEach(function (p) { payouts[p.id] = 0; });

  if (alive.length === 1) {
    var total = 0;
    st.players.forEach(function (p) { total += p.totalBet; });
    alive[0].chips += total;
    payouts[alive[0].id] = total;
    log(st, alive[0].name + ' 收下彩池 ' + total);
  } else {
    var pr = buildPots(st.players);
    pr.pots.forEach(function (pot) {
      var cands = pot.eligible.map(function (id) { return byId(st, id); }).filter(Boolean);
      if (!cands.length) return;
      cands.sort(function (a, b) {
        var d = Poker.compare(hands[b.id], hands[a.id]);
        if (d) return d;
        if (st.opts.suitTie) return Poker.compareSuit(hands[b.id], hands[a.id]);
        return 0;
      });
      var winners = [cands[0]];
      for (var i = 1; i < cands.length; i++) {
        var d2 = Poker.compare(hands[cands[0].id], hands[cands[i].id]);
        if (d2 !== 0) break;
        if (st.opts.suitTie && Poker.compareSuit(hands[cands[0].id], hands[cands[i].id]) !== 0) break;
        winners.push(cands[i]);
      }
      var share = Math.floor(pot.amount / winners.length);
      var rem = pot.amount - share * winners.length;
      winners.forEach(function (w, k) { w.chips += share + (k < rem ? 1 : 0); payouts[w.id] += share + (k < rem ? 1 : 0); });
      log(st, winners.map(function (w) { return w.name + '(' + w.handInfo.name + ')'; }).join(' / ') + ' 赢得 ' + pot.amount);
    });
    // 未被跟注的下注退还
    for (var rid in pr.returned) {
      var rp = byId(st, rid);
      if (rp) { rp.chips += pr.returned[rid]; payouts[rid] = (payouts[rid] || 0) + pr.returned[rid]; }
    }
  }

  st.result = {
    hand: st.hand,
    players: st.players.map(function (p) {
      return {
        id: p.id, name: p.name, folded: p.folded,
        cards: p.hole.concat(p.up),
        handName: p.handInfo ? p.handInfo.name : '',
        delta: payouts[p.id] - p.totalBet,
        chips: p.chips
      };
    })
  };
  st.pot = 0;
  log(st, '第 ' + st.hand + ' 局结束');

  // 只剩一位玩家还有筹码 → 整场游戏结束（自动结束，无需房主操作）
  var live = st.players.filter(function (p) { return p.chips > 0; });
  if (live.length <= 1) {
    st.gameOver = true;
    st.stage = 'ended';
    st.champion = live[0] ? { id: live[0].id, name: live[0].name, chips: live[0].chips } : null;
    log(st, live.length ? (live[0].name + ' 赢下全部筹码，游戏结束！') : '所有人都输光了，游戏结束');
  }
}

function view(room, playerId) {
  var st = room.state;
  if (!st) return { ui: 'stud5', stage: 'idle' };
  var reveal = (st.stage === 'settle' || st.stage === 'ended');
  var me = null;
  var players = st.players.map(function (p) {
    if (p.id === playerId) me = p;
    var hole = p.hole.map(function (c) {
      if (p.id === playerId || reveal) return c;
      return { hidden: true, id: 'h' + c.id };
    });
    return {
      id: p.id, name: p.name, chips: p.chips, roundBet: p.roundBet, totalBet: p.totalBet,
      folded: p.folded, busted: p.chips <= 0, hole: hole, up: p.up.slice(),
      handName: p.handInfo ? p.handInfo.name : ''
    };
  });
  var turnPlayer = (st.turnIndex >= 0 && st.stage === 'betting') ? st.players[st.turnIndex].id : null;
  var callAmount = me ? Math.max(0, st.currentBet - me.roundBet) : 0;
  var liveCount = st.players.filter(function (p) { return p.chips > 0; }).length;
  return {
    ui: 'stud5', stage: st.stage, hand: st.hand, pot: st.pot, currentBet: st.currentBet,
    dealStep: st.dealStep, turnPlayerId: turnPlayer, dealerIndex: st.dealerIndex,
    players: players, meId: playerId, log: st.log.slice(-14), result: st.result,
    gameOver: st.gameOver, liveCount: liveCount, champion: st.champion || null,
    myTurn: turnPlayer === playerId,
    callAmount: callAmount,
    canCheck: me ? (st.currentBet === me.roundBet) : false,
    canRaise: me ? (st.raiseCount < st.opts.maxRaises && me.chips > callAmount) : false,
    myCards: me ? me.hole.concat(me.up) : [],
    // 最终排名（按筹码从多到少），仅在 gameOver 时有意义
    finalRanking: st.gameOver ? st.players.slice().sort(function (a, b) { return b.chips - a.chips; })
      .map(function (p) { return { id: p.id, name: p.name, chips: p.chips }; }) : null,
    opts: st.opts
  };
}

module.exports = {
  id: 'stud5', name: '港式五张牌', minPlayers: 2, maxPlayers: 5,
  defaults: DEFAULTS, optionFields: OPTION_FIELDS, rules: RULES,
  init: init, start: start, handle: handle, view: view,
  nextLabel: '继续游戏'
};
