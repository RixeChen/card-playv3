/* =====================================================================
 * 唬牌（吹牛 / 骗牌）—— 新版规则
 *
 * 采用的玩法版本（用户指定；歧义处的取舍均在下方注明）：
 *   1) 牌具：默认 1 副牌 52 张全部发完（可选加 2 张王当万能牌）。
 *      先手：持有「♠A」的玩家先喊牌（原版即如此，保留）。
 *   2) 喊牌（发牌阶段）：轮到的玩家从手牌里扣下「至少 1 张」牌，背面朝下放进本圈，
 *      并公布声称的牌型，例如「两张 7」。喊的张数 = 实际扣下的张数，点数可以撒谎。
 *   3) 下家响应三选一：
 *      一、质疑：除喊牌者本人外「任何玩家」都可以发起（不限于下家，谁先点谁获得资格）。
 *         翻开底牌验证。这里要把「收牌」和「出牌权」分开：
 *           A) 收牌方（本圈所有牌归谁）：喊的假 → 归喊牌者；喊的真 → 归质疑者。
 *           B) 出牌权（接下来由谁喊牌）：交给「判断正确」的一方——
 *              喊的假 → 质疑方；喊的真 → 喊牌者。
 *              （规则原文「胜者继续出牌喊牌」，胜者即判断正确的一方。
 *                旧实现把两者混为一个 winnerId，导致质疑成功时出牌权错给了喊牌者。）
 *      二、跟牌：至少跟 1 张。
 *          - 喊「相同点数」→ **张数不限**，可跟任意数量的相同点数牌；
 *          - 喊「不同点数」→ 必须张数更多，或张数相同但点数更大。
 *          例：上家「两张 7」→ 可跟「一张 7」「三张 7」（同点数，张数不限），
 *          也可跟「两张 9」（同张数点数更大）或「三张 5」（张数更多）。
 *      三、放弃：信任上家，跳过。若除喊牌者外**所有其他玩家都放弃**，
 *         本圈累积的牌作为「淘汰牌」永久移除、不再翻开；
 *         **出牌权交给本轮最后一个出牌/跟牌的玩家**，由他开启全新一轮
 *         （牌型基准与比较状态全部重置，可宣布任意合法新牌型）。
 *   4) 点数大小：A > K > Q > J > 10 > … > 4 > 3 > 2 > 小王 > 大王。
 *      （A 是最大的普通牌、2 最小，这是吹牛类游戏的通行排序。）
 *   5) 胜负判定：率先出完手牌者获胜，游戏立即结束。
 *      ※ 歧义取舍：出完手牌的那一手仍可能是在吹牛，所以本实现加了一个
 *        「质疑确认窗口」（默认 15 秒，可调）：窗口内任何人可质疑，
 *        无人质疑才判定获胜；若被质疑且属实 → 质疑者收牌但出完者依然获胜
 *        （因为"率先出完手牌"这一胜利条件已达成）；若被质疑且是假 →
 *        出完者收走本圈所有牌，游戏继续。
 *   6) 计分：输家按「剩余手牌每张牌的点数」扣分，赢家获得全部输家的分数。
 *      每张牌的分值 = 该牌点数（A=14、K=13、…、2=2、小王=15、大王=16）。
 *      ※ 歧义取舍："每张牌对应分数"按点数实现；想改成"每张固定 1 分"，
 *        只改下面 remainingScore() 一处即可。
 *   7) 超时处理：玩家 30 秒无响应时代理操作——该放弃就自动放弃；
 *      该领出（本圈第一手）时自动出手里最小的 1 张并如实喊出。
 * ===================================================================== */
'use strict';
var Cards = require('../../public/shared/cards.js');

var DEFAULTS = { turnSeconds: 30, confirmSeconds: 15, useJokers: false };

var OPTION_FIELDS = [
  { key: 'turnSeconds', label: '无响应自动放弃（秒）', type: 'number', min: 10, max: 120, step: 5 },
  { key: 'confirmSeconds', label: '出完手牌后的质疑窗口（秒）', type: 'number', min: 5, max: 60, step: 5 },
  { key: 'useJokers', label: '加入 2 张王当万能牌', type: 'bool' }
];

var RULES = [
  '一副牌全部发完（可选加 2 张万能王）。持有 ♠A 的人先喊牌。',
  '轮到你：扣下至少 1 张牌背面朝下放进圈里，并喊出牌型，例如「两张 7」。',
  '质疑：除喊牌者外任何人都可以掀牌。假 → 圈里所有牌归喊牌者；真 → 归质疑者。',
  '出牌权交给判断正确的一方：质疑成功 → 质疑方接着喊牌；质疑失败 → 喊牌者接着喊牌。',
  '跟牌：至少跟 1 张。喊相同点数时张数不限；喊不同点数需张数更多，或同张数点数更大。',
  '放弃：信任上家并跳过。除喊牌者外所有人都放弃时，本圈牌作为淘汰牌不再翻开，',
  '并由本轮最后一个出牌/跟牌的玩家开出全新一轮（牌型基准重置，可喊任意合法新牌型）。',
  '点数大小：A > K > Q > J > 10 > … > 3 > 2 > 小王 > 大王。',
  '出完手牌后有质疑窗口，窗口内无人质疑即获胜。',
  '计分：输家按剩余手牌扣分（A=14、K=13、…、2=2、小王=15、大王=16），赢家获得全部输家分数。',
  '30 秒无响应会自动放弃；需要领出时自动出最小的 1 张并如实喊。'
];

function log(st, s) { st.log.push(s); if (st.log.length > 80) st.log.shift(); }
function byId(st, id) { for (var i = 0; i < st.players.length; i++) if (st.players[i].id === id) return st.players[i]; return null; }

/** 点数标签：BJ/RJ 显示成小王/大王 */
function rankLabel(rank) { return rank === 'BJ' ? '小王' : (rank === 'RJ' ? '大王' : rank); }
/** 牌型文案，例如「两张 7」 */
function claimText(play) { return Cards.rankValue(play.rank) >= 15 ? ('一张' + rankLabel(play.rank)) : (play.count + '张' + rankLabel(play.rank)); }
function cnNum(n) { return ['一', '两', '三', '四', '五', '六', '七', '八', '九', '十'][n - 1] || String(n); }
function claimTextCN(play) { return (Cards.rankValue(play.rank) >= 15 ? '一张' : cnNum(play.count) + '张') + rankLabel(play.rank); }

/**
 * 新喊牌能否压过上家。
 *   - 喊「相同点数」→ 张数不限（跟任意数量的相同点数牌都可以）
 *   - 喊「不同点数」→ 必须张数更多，或者张数相同但点数更大
 * 例：上家「两张 7」→ 可以跟「一张 7」「三张 7」（同点数，张数不限），
 *     也可以跟「两张 9」（同张数、点数更大）或「三张 5」（张数更多）。
 */
function beats(prev, count, rank) {
  if (Cards.rankValue(rank) === Cards.rankValue(prev.rank)) return true;   // 同点数：张数不限
  if (count > prev.count) return true;                                    // 张数更多
  if (count === prev.count && Cards.rankValue(rank) > Cards.rankValue(prev.rank)) return true; // 同张数点数更大
  return false;
}
/** 声称是否属实（王算万能） */
function isFake(play) {
  return play.cards.some(function (c) { return !c.joker && c.rank !== play.rank; });
}
/** 剩余手牌总扣分 */
function remainingScore(hand) {
  return hand.reduce(function (s, c) { return s + Cards.rankValue(c.rank); }, 0);
}
/** 下一个还有手牌的玩家 */
function nextActive(st, from) {
  var n = st.players.length;
  for (var i = 1; i <= n; i++) {
    var idx = (from + i) % n;
    if (st.players[idx].hand.length > 0) return idx;
  }
  return from;
}
function smallestCard(hand) {
  var best = hand[0];
  for (var i = 1; i < hand.length; i++) {
    if (Cards.rankValue(hand[i].rank) < Cards.rankValue(best.rank)) best = hand[i];
  }
  return best;
}

function init(room) {
  var opts = {};
  for (var k in DEFAULTS) opts[k] = (room.options && room.options[k] !== undefined) ? room.options[k] : DEFAULTS[k];
  room.state = { ui: 'cheat', opts: opts, players: [], stage: 'idle' };
  return room.state;
}

function start(room, ctx) {
  init(room);
  var st = room.state;
  var ps = room.activePlayers();
  if (ps.length < 2) return;
  st.players = ps.map(function (p) { return { id: p.id, name: p.name, hand: [] }; });

  var deck = Cards.shuffle(Cards.createShoe(1, !!st.opts.useJokers));
  var i = 0;
  while (deck.length) { st.players[i % st.players.length].hand.push(deck.pop()); i++; }
  st.players.forEach(function (p) { p.hand = Cards.sortPoker(p.hand); });

  // 先手：持有 ♠A 者
  var first = 0;
  for (var k = 0; k < st.players.length; k++) {
    if (st.players[k].hand.some(function (c) { return c.id.indexOf('SA#') === 0; })) { first = k; break; }
  }
  st.turnIndex = first;
  st.pile = [];          // 本圈累积的牌（背面朝下）
  st.lastPlay = null;    // 当前这一手喊牌
  st.passIds = [];       // 本圈内已放弃的玩家
  st.stage = 'play';
  st.winPendingId = null;
  st.turnDeadline = null;
  st.challengeDeadline = null;
  st.reveal = null;
  st.log = [];
  st.result = null;
  log(st, '游戏开始，' + st.players[first].name + '（持有♠A）先喊牌');
  setTurnTimer(st, ctx);
}

/* ---------------- 计时器 ---------------- */
function setTurnTimer(st, ctx) {
  ctx.clearTimer();
  var secs = st.opts.turnSeconds || 30;
  st.turnDeadline = Date.now() + secs * 1000;
  st.challengeDeadline = null;
  var roomRef = ctx.room;
  ctx.setTimer(function () {
    var s = roomRef && roomRef.state;
    if (s !== st || s.stage !== 'play') return;
    autoAct(s, ctx);
    ctx.broadcast();
  }, secs * 1000);
}

function setWinTimer(st, ctx) {
  ctx.clearTimer();
  var secs = st.opts.confirmSeconds || 15;
  st.challengeDeadline = Date.now() + secs * 1000;
  st.turnDeadline = null;
  var roomRef = ctx.room;
  ctx.setTimer(function () {
    var s = roomRef && roomRef.state;
    if (s !== st || s.stage !== 'challenge' || !s.winPendingId) return;
    endGame(s, s.winPendingId);
    ctx.broadcast();
  }, secs * 1000);
}

/* ---------------- 动作处理 ---------------- */
function handle(room, playerId, action, ctx) {
  var st = room.state;
  if (!st || st.stage === 'idle') return { ok: false, error: '牌局尚未开始' };
  if (st.stage === 'ended') return { ok: false, error: '本局已结束' };
  action = action || {};

  /* 质疑：任何玩家（除喊牌者本人）都可以发起 */
  if (action.type === 'challenge') {
    if (!st.lastPlay) return { ok: false, error: '当前没有可质疑的喊牌' };
    if (st.lastPlay.playerId === playerId) return { ok: false, error: '不能质疑自己' };
    if (st.stage === 'challenge' && st.winPendingId) {
      resolveWinChallenge(st, ctx, playerId);
      return { ok: true };
    }
    if (st.stage !== 'play') return { ok: false, error: '现在不能质疑' };
    resolveChallenge(st, ctx, playerId);
    return { ok: true };
  }

  /* 出牌 / 跟牌 */
  if (action.type === 'play') {
    if (st.stage !== 'play') return { ok: false, error: '现在不能出牌' };
    var cur = st.players[st.turnIndex];
    if (!cur || cur.id !== playerId) return { ok: false, error: '还没轮到你' };
    var ids = action.cardIds || [];
    if (!ids.length) return { ok: false, error: '请至少选 1 张牌' };
    var rank = action.rank;
    if (!rank || Cards.rankValue(rank) === 0) return { ok: false, error: '请选择喊出的点数' };
    var uniq = {};
    for (var z = 0; z < ids.length; z++) {
      if (uniq[ids[z]]) return { ok: false, error: '选牌重复' };
      uniq[ids[z]] = 1;
    }
    var cards = Cards.takeByIds(cur.hand, ids);
    if (cards.length !== ids.length) return { ok: false, error: '所选牌不在你手里' };

    // 跟牌必须压过上家
    if (st.lastPlay && st.lastPlay.playerId !== cur.id && !beats(st.lastPlay, cards.length, rank)) {
      cur.hand = cur.hand.concat(cards);
      return { ok: false, error: '压不过上家的「' + claimTextCN(st.lastPlay) + '」：相同点数张数不限，其他情况需要张数更多或同张数点数更大' };
    }

    st.pile = st.pile.concat(cards);
    st.lastPlay = { playerId: cur.id, count: cards.length, rank: rank, cards: cards };
    st.passIds = [];
    st.reveal = null;
    log(st, cur.name + ' 扣下 ' + cards.length + ' 张，喊「' + claimTextCN(st.lastPlay) + '」');

    if (cur.hand.length === 0) {
      // 出完手牌 → 进入质疑确认窗口
      st.stage = 'challenge';
      st.winPendingId = cur.id;
      st.turnIndex = -1;
      log(st, cur.name + ' 出完了所有牌！等待质疑…');
      setWinTimer(st, ctx);
    } else {
      st.turnIndex = nextActive(st, st.players.indexOf(cur));
      st.stage = 'play';
      setTurnTimer(st, ctx);
    }
    return { ok: true };
  }

  /* 放弃 */
  if (action.type === 'pass') {
    if (st.stage !== 'play') return { ok: false, error: '现在不能放弃' };
    var cur2 = st.players[st.turnIndex];
    if (!cur2 || cur2.id !== playerId) return { ok: false, error: '还没轮到你' };
    if (!st.lastPlay || st.lastPlay.playerId === playerId) return { ok: false, error: '你是本圈第一家，必须出牌' };
    doPass(st, ctx);
    return { ok: true };
  }

  return { ok: false, error: '未知动作' };
}

function doPass(st, ctx) {
  var cur = st.players[st.turnIndex];
  if (!cur || !st.lastPlay || st.lastPlay.playerId === cur.id) return;
  if (st.passIds.indexOf(cur.id) < 0) st.passIds.push(cur.id);
  log(st, cur.name + ' 放弃');

  var leaderId = st.lastPlay.playerId;   // 本轮最后一个出牌/跟牌的玩家
  var others = st.players.filter(function (p) { return p.id !== leaderId && p.hand.length > 0; });
  var allPassed = others.length > 0 && others.every(function (p) { return st.passIds.indexOf(p.id) >= 0; });

  if (allPassed) {
    // 其他所有玩家都放弃 → 本圈累积的牌作为淘汰牌，不再翻开
    var dead = st.pile.length;
    st.pile = [];
    st.lastPlay = null;   // 重置牌型基准（新一轮无基准，任何合法牌型都能喊）
    st.passIds = [];      // 重置比较状态
    // 出牌权交给「本轮最后一个出牌/跟牌的玩家」，由他开启全新一轮。
    // 注意：必须是 leaderIdx 本身，不是他的下一位——否则最后一个出牌者
    // 反而拿不到先手权，会被下一位抢先开新一轮。
    var leaderIdx = st.players.indexOf(byId(st, leaderId));
    st.turnIndex = (st.players[leaderIdx] && st.players[leaderIdx].hand.length > 0)
      ? leaderIdx
      : nextActive(st, leaderIdx);   // 兜底：理论上不会走到（出牌阶段人人有牌）
    log(st, '其他人都放弃，本圈 ' + dead + ' 张牌作为淘汰牌不再翻开；' +
      st.players[st.turnIndex].name + ' 开出全新一轮');
  } else {
    st.turnIndex = nextActive(st, st.turnIndex);
  }
  st.stage = 'play';
  setTurnTimer(st, ctx);
}

/** 30 秒无响应的代理操作 */
function autoAct(st, ctx) {
  var cur = st.players[st.turnIndex];
  if (!cur) return;
  var mustLead = (!st.lastPlay || st.lastPlay.playerId === cur.id);
  if (mustLead && cur.hand.length > 0) {
    // 必须领出 → 自动出最小的 1 张并如实喊
    var c = smallestCard(cur.hand);
    for (var i = 0; i < cur.hand.length; i++) {
      if (cur.hand[i].id === c.id) { cur.hand.splice(i, 1); break; }
    }
    st.pile = st.pile.concat([c]);
    st.lastPlay = { playerId: cur.id, count: 1, rank: c.rank, cards: [c] };
    st.passIds = [];
    log(st, cur.name + ' 超时，自动出 ' + c.text + ' 并喊「一张' + rankLabel(c.rank) + '」');
    if (cur.hand.length === 0) {
      st.stage = 'challenge';
      st.winPendingId = cur.id;
      st.turnIndex = -1;
      log(st, cur.name + ' 出完了所有牌！等待质疑…');
      setWinTimer(st, ctx);
    } else {
      st.turnIndex = nextActive(st, st.players.indexOf(cur));
      st.stage = 'play';
      setTurnTimer(st, ctx);
    }
  } else {
    log(st, cur.name + ' 超时，自动放弃');
    doPass(st, ctx);
  }
}

/**
 * 普通质疑：翻开最后一手喊牌。
 *
 * 这里要把两件事分开（这是之前出 bug 的地方）：
 *   A) 「收牌方」——本圈所有牌归谁：
 *        假 → 归喊牌者（发牌者）；真 → 归质疑者。（按规则原文）
 *   B) 「出牌权」——接下来由谁喊牌：
 *        交给「判断正确」的一方，即 假 → 质疑方；真 → 喊牌者。
 *        （规则原文「胜者继续出牌喊牌」，胜者 = 判断正确的一方）
 * 旧实现把两者混为一个 winnerId，导致质疑成功时出牌权错给了喊牌者，
 * 质疑方拿到牌却无法继续出牌。
 */
function resolveChallenge(st, ctx, challengerId) {
  ctx.clearTimer();
  var play = st.lastPlay;
  var fake = isFake(play);
  var cardTakerId = fake ? play.playerId : challengerId;   // A) 收牌方
  var nextLeaderId = fake ? challengerId : play.playerId;  // B) 出牌权
  var taker = byId(st, cardTakerId);
  var taken = st.pile.length;
  taker.hand = Cards.sortPoker(taker.hand.concat(st.pile));
  st.pile = [];
  st.lastPlay = null;
  st.passIds = [];
  st.winPendingId = null;
  st.reveal = {
    cards: play.cards, byPlayer: play.playerId, declared: play.rank,
    fake: fake, winnerId: nextLeaderId, cardTakerId: cardTakerId,
    loserId: fake ? play.playerId : challengerId, taken: taken
  };
  if (fake) log(st, byId(st, challengerId).name + ' 质疑成功！' + byId(st, play.playerId).name + ' 喊的「' + claimTextCN(play) + '」是假的');
  else log(st, byId(st, challengerId).name + ' 质疑失败，对方喊的确实是「' + claimTextCN(play) + '」');
  log(st, byId(st, cardTakerId).name + ' 收走本圈 ' + taken + ' 张牌；' + byId(st, nextLeaderId).name + ' 获得出牌权，继续喊牌');
  st.turnIndex = st.players.indexOf(byId(st, nextLeaderId));
  st.stage = 'play';
  setTurnTimer(st, ctx);
}

/** 「出完手牌」后的质疑 */
function resolveWinChallenge(st, ctx, challengerId) {
  ctx.clearTimer();
  var play = st.lastPlay;
  var fake = isFake(play);
  var challenger = byId(st, challengerId);
  var taken = st.pile.length;

  if (!fake) {
    // 喊的是真的 → 圈牌归质疑者；出完手牌者已达成胜利条件，游戏结束
    challenger.hand = Cards.sortPoker(challenger.hand.concat(st.pile));
    st.pile = [];
    st.reveal = {
      cards: play.cards, byPlayer: play.playerId, declared: play.rank,
      fake: false, winnerId: play.playerId, cardTakerId: challengerId,
      loserId: challengerId, taken: taken
    };
    log(st, byId(st, challengerId).name + ' 质疑失败，对方喊的确实是「' + claimTextCN(play) + '」，收走 ' + taken + ' 张牌');
    endGame(st, play.playerId);
  } else {
    // 吹牛被抓 → 圈牌归喊牌者，出牌权归质疑方，游戏继续
    var pl = byId(st, play.playerId);
    pl.hand = Cards.sortPoker(pl.hand.concat(st.pile));
    st.pile = [];
    st.lastPlay = null;
    st.passIds = [];
    st.winPendingId = null;
    st.reveal = {
      cards: play.cards, byPlayer: play.playerId, declared: play.rank,
      fake: true, winnerId: challengerId, cardTakerId: play.playerId,
      loserId: play.playerId, taken: taken
    };
    log(st, byId(st, challengerId).name + ' 质疑成功！' + pl.name + ' 用最后几张牌吹牛，收走本圈 ' + taken + ' 张牌；' +
      byId(st, challengerId).name + ' 获得出牌权');
    st.turnIndex = st.players.indexOf(challenger);
    st.stage = 'play';
    setTurnTimer(st, ctx);
  }
}

/** 结算：率先出完手牌者获胜，赢家获得全部输家分数 */
function endGame(st, winnerId) {
  var winner = byId(st, winnerId);
  var total = 0;
  var rows = st.players.filter(function (p) { return p.id !== winnerId; }).map(function (p) {
    var s = remainingScore(p.hand);
    total += s;
    return { id: p.id, name: p.name, left: p.hand.length, leftScore: s, score: -s };
  });
  rows.push({ id: winner.id, name: winner.name, left: 0, leftScore: 0, score: total });
  rows.sort(function (a, b) { return b.score - a.score; });
  st.result = { winnerId: winnerId, winnerName: winner.name, total: total, ranking: rows };
  st.stage = 'ended';
  st.turnIndex = -1;
  st.winPendingId = null;
  log(st, winner.name + ' 率先出完手牌，获得 ' + total + ' 分！');
}

function view(room, playerId) {
  var st = room.state;
  if (!st || st.stage === 'idle') return { ui: 'cheat', stage: 'idle' };
  var me = null;
  var players = st.players.map(function (p) {
    if (p.id === playerId) me = p;
    return {
      id: p.id, name: p.name, handCount: p.hand.length,
      passed: st.passIds.indexOf(p.id) >= 0
    };
  });
  var turnPlayerId = (st.stage === 'play' && st.turnIndex >= 0) ? st.players[st.turnIndex].id : null;
  var myTurn = (turnPlayerId === playerId);
  return {
    ui: 'cheat', stage: st.stage,
    players: players, meId: playerId,
    myHand: me ? me.hand.slice() : [],
    pileCount: st.pile.length,
    lastPlay: st.lastPlay ? {
      playerId: st.lastPlay.playerId, count: st.lastPlay.count,
      rank: st.lastPlay.rank, label: claimTextCN(st.lastPlay)
    } : null,
    turnPlayerId: turnPlayerId,
    myTurn: myTurn,
    mustLead: myTurn && (!st.lastPlay || st.lastPlay.playerId === playerId),
    canPass: myTurn && !!st.lastPlay && st.lastPlay.playerId !== playerId,
    // 质疑资格：只要当前有一手喊牌且不是自己喊的，任何时候都能质疑
    canChallenge: !!st.lastPlay && st.lastPlay.playerId !== playerId && st.stage !== 'ended',
    winPendingId: st.winPendingId,
    turnDeadline: st.turnDeadline,
    challengeDeadline: st.challengeDeadline,
    reveal: st.reveal,
    log: st.log.slice(-16),
    result: st.result,
    opts: st.opts
  };
}

module.exports = {
  id: 'cheat', name: '唬牌（吹牛）', minPlayers: 2, maxPlayers: 8,
  defaults: DEFAULTS, optionFields: OPTION_FIELDS, rules: RULES,
  init: init, start: start, handle: handle, view: view, nextLabel: '再来一局',
  // 供自检脚本使用的内部函数
  _test: { beats: beats, isFake: isFake, remainingScore: remainingScore, claimTextCN: claimTextCN, rankLabel: rankLabel }
};
