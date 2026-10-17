/* =====================================================================
 * 保皇（山东保皇 · 简化通行版）
 *
 * 采用的玩法版本（有歧义处按通行做法，均已在下方注明）：
 *   1) 牌具：4 副牌共 216 张（含 8 张王）。人数 4~5 人。
 *      5 人时每人 43 张，剩余的 1 张归皇帝（皇帝 44 张，其余 43 张）；
 *      4 人时每人 54 张。
 *   2) 皇帝：发牌前随机指定一张「大王」为皇牌，拿到皇牌的人即皇帝。
 *      （传统做法是在一张大王上做记号，本实现用程序内部编号实现，效果一致。）
 *      本实现中皇帝先出牌，因此皇帝身份视为公开；「明暗」只针对保子。
 *   3) 保子：皇帝可选择
 *        - 独保：1 打 N，基础分 24；
 *        - 叫保：指定一张「保子牌」（如小王、♠3…），服务器从该种牌里随机挑一张
 *          （排除皇帝手里的）作为保子牌，拿到它的人就是保子，基础分 12。
 *      保子可以选择「明保」（公开身份，基础分 ×2）或「暗保」。
 *   4) 阵营：皇帝 + 保子 = 保皇派；其余 = 革命派。
 *   5) 出牌：斗地主式。皇帝先出，逆时针轮转。上家出牌后，下家必须出更大的
 *      同类型同长度牌，或选择「过」。所有人都过则由上家重新领出。
 *   6) 牌型：单张 / 对子 / 三张 / 三带一 / 三带二 / 顺子(≥5) / 连对(≥3对) /
 *      飞机(≥2 组连续三张) / 炸弹(≥4 张同点) / 王炸(≥2 张王)。
 *      牌点：3<4<…<A<2<小王<大王。王只能单出或凑王炸。
 *   7) 结束：独保时皇帝出完 = 保皇派胜，任一革命派出完 = 革命派胜；
 *      有保子时保皇派两人全部出完 = 保皇派胜，革命派全部出完 = 革命派胜。
 *      结束瞬间未出完的人按剩余牌数从少到多名次靠前。
 *   8) 计分：基础分 base（独保 24，叫保 12，明保再 ×2），
 *      胜方每人 +base/胜方人数，负方每人 -base/负方人数（本实现保证整除）。
 * ===================================================================== */
'use strict';
var Cards = require('../../public/shared/cards.js');
var Combos = require('../../public/shared/combos.js');

var DEFAULTS = { };
var OPTION_FIELDS = [];
var RULES = [
  '4 副牌 216 张，5 人时皇帝 44 张、其余 43 张；4 人时每人 54 张。',
  '拿到「皇牌」（随机一张大王）的是皇帝，皇帝先出牌。',
  '皇帝可选「独保」（1 打 N）或「叫保」（指定保子牌）。',
  '保子可「明保」（身份公开、分数翻倍）或「暗保」。',
  '牌型：单/对/三/三带一/三带二/顺子/连对/飞机/炸弹/王炸。',
  '牌点：3<4<…<A<2<小王<大王，王只能单出或当王炸。',
  '保皇派全出完 = 保皇派胜；革命派全出完 = 革命派胜。'
];

// 皇帝可叫的保子牌
var GUARD_CHOICES = [
  { key: 'BJ', label: '小王' }, { key: 'RJ', label: '大王' },
  { key: 'S3', label: '♠3' }, { key: 'H3', label: '♥3' }, { key: 'D3', label: '♦3' }, { key: 'C3', label: '♣3' },
  { key: 'SA', label: '♠A' }, { key: 'HA', label: '♥A' }, { key: 'DA', label: '♦A' }, { key: 'CA', label: '♣A' },
  { key: 'S2', label: '♠2' }, { key: 'H2', label: '♥2' }, { key: 'D2', label: '♦2' }, { key: 'C2', label: '♣2' }
];

function log(st, s) { st.log.push(s); if (st.log.length > 80) st.log.shift(); }
function byId(st, id) { for (var i = 0; i < st.players.length; i++) if (st.players[i].id === id) return st.players[i]; return null; }

function init(room) {
  room.state = { ui: 'baohuang', players: [], stage: 'idle', log: [] };
  return room.state;
}

function start(room, ctx) {
  init(room);
  var st = room.state;
  var ps = room.activePlayers();
  if (ps.length < 4) return;
  if (ps.length > 5) ps = ps.slice(0, 5);

  var deck = Cards.shuffle(Cards.createShoe(4, true)); // 216 张
  // 先发牌，再「从已发出的牌里」随机指定皇牌。
  // （不能先从整副牌里挑：5 人时会剩 1 张底牌，皇牌有 1/216 概率落在底牌里，从而找不到皇帝）
  st.players = ps.map(function (p) { return { id: p.id, name: p.name, hand: [], isEmperor: false, isGuard: false, finished: false, rank: null }; });
  var base = Math.floor(deck.length / st.players.length);
  st.players.forEach(function (p) { for (var i = 0; i < base; i++) p.hand.push(deck.pop()); });
  st.leftover = deck.splice(0, deck.length);   // 5 人时剩 1 张，4 人时 0 张

  var dealtKings = [];
  st.players.forEach(function (p) {
    p.hand.forEach(function (c) { if (c.rank === 'RJ') dealtKings.push({ p: p, c: c }); });
  });
  var pick = dealtKings[Math.floor(Math.random() * dealtKings.length)];
  st.emperorCardId = pick.c.id;
  var emp = pick.p;
  emp.isEmperor = true;
  // 剩余牌归皇帝
  emp.hand = emp.hand.concat(st.leftover);
  st.leftover = [];
  st.players.forEach(function (p) { p.hand = Cards.sortBH(p.hand); });

  st.emperorId = emp.id;
  st.guardId = null; st.guardCardName = null; st.solo = false; st.guardOpen = false;
  st.stage = 'choose';
  st.turnId = emp.id;
  st.lastCombo = null; st.lastPlayerId = null; st.passCount = 0;
  st.finishedOrder = []; st.finishedCount = 0;
  st.log = []; st.result = null;
  log(st, '发牌完成，' + emp.name + ' 是皇帝（持有皇牌 ' + pick.c.text + '）');
}

function handle(room, playerId, action, ctx) {
  var st = room.state;
  if (!st || st.stage === 'idle') return { ok: false, error: '牌局尚未开始' };

  if (st.stage === 'choose') {
    if (playerId !== st.emperorId) return { ok: false, error: '等皇帝做决定' };
    st.solo = !!action.solo;
    st.emperorOpen = true; // 本实现皇帝公开（因为皇帝先出牌）
    if (st.solo) {
      st.guardId = null; st.guardCardName = null;
      log(st, '皇帝选择【独保】：1 打 ' + (st.players.length - 1));
      beginPlay(st);
    } else {
      var key = action.guardKey || 'BJ';
      var choice = GUARD_CHOICES.filter(function (c) { return c.key === key; })[0] || GUARD_CHOICES[0];
      var suit = key[0], rank = key.slice(1);
      var emp = byId(st, st.emperorId);
      var pool = [];
      st.players.forEach(function (p) {
        if (p.id === st.emperorId) return;
        p.hand.forEach(function (c) {
          if (rank === 'BJ' || rank === 'RJ') { if (c.rank === rank) pool.push({ p: p, c: c }); }
          else if (c.suit === suit && c.rank === rank) pool.push({ p: p, c: c });
        });
      });
      if (!pool.length) {
        st.solo = true; st.guardId = null;
        log(st, '该牌全在皇帝手里，自动改为【独保】');
        beginPlay(st);
        return { ok: true };
      }
      var pick = pool[Math.floor(Math.random() * pool.length)];
      pick.p.isGuard = true;
      st.guardId = pick.p.id;
      st.guardCardName = choice.label;
      st.guardCardId = pick.c.id;
      st.stage = 'guardChoose';
      log(st, '皇帝叫保：' + choice.label + '，等待保子决定是否明保');
    }
    return { ok: true };
  }

  if (st.stage === 'guardChoose') {
    if (playerId !== st.guardId) return { ok: false, error: '等保子做决定' };
    st.guardOpen = !!action.open;
    log(st, '保子选择【' + (st.guardOpen ? '明保' : '暗保') + '】');
    beginPlay(st);
    return { ok: true };
  }

  if (st.stage === 'play') {
    var p = byId(st, playerId);
    if (!p || p.finished) return { ok: false, error: '你已出完牌' };
    if (st.turnId !== playerId) return { ok: false, error: '还没轮到你' };

    if (action.type === 'pass') {
      if (!st.lastCombo || st.lastPlayerId === playerId) return { ok: false, error: '你是本轮首家，必须出牌' };
      st.passCount++;
      log(st, p.name + ' 过');
      var activeCount = st.players.filter(function (x) { return !x.finished; }).length;
      if (st.passCount >= activeCount - 1) {
        var leader = st.lastPlayerId;
        st.lastCombo = null; st.lastPlayerId = null; st.passCount = 0;
        st.turnId = leader;
        log(st, '本轮结束，' + byId(st, leader).name + ' 重新领出');
      } else {
        st.turnId = nextPlayer(st, playerId);
      }
      return { ok: true };
    }

    if (action.type === 'play') {
      var ids = action.cardIds || [];
      if (!ids.length) return { ok: false, error: '请选择要出的牌' };
      var uniq = {};
      for (var z = 0; z < ids.length; z++) { if (uniq[ids[z]]) return { ok: false, error: '选牌重复' }; uniq[ids[z]] = 1; }
      var cards = Cards.takeByIds(p.hand, ids);
      if (cards.length !== ids.length) return { ok: false, error: '所选牌不在你手里' };
      var combo = Combos.analyze(cards);
      if (!combo) { p.hand = p.hand.concat(cards); return { ok: false, error: '牌型不合法' }; }
      var canLead = (!st.lastCombo || st.lastPlayerId === playerId);
      if (!canLead && !Combos.beats(combo, st.lastCombo)) {
        p.hand = p.hand.concat(cards);
        return { ok: false, error: '压不过上家（' + st.lastCombo.label + '）' };
      }
      st.lastCombo = combo; st.lastPlayerId = playerId; st.passCount = 0;
      log(st, p.name + ' 出 ' + combo.label);
      if (p.hand.length === 0) {
        markFinished(st, p);
        st.lastCombo = null; st.lastPlayerId = null; st.passCount = 0;
        if (checkEnd(st)) return { ok: true };
        st.turnId = nextPlayer(st, playerId);
        return { ok: true };
      }
      if (checkEnd(st)) return { ok: true };
      st.turnId = nextPlayer(st, playerId);
      return { ok: true };
    }
    return { ok: false, error: '未知动作' };
  }

  if (st.stage === 'ended') return { ok: false, error: '本局已结束' };
  return { ok: false, error: '未知动作' };
}

function beginPlay(st) {
  st.stage = 'play';
  st.turnId = st.emperorId;
  st.lastCombo = null; st.lastPlayerId = null; st.passCount = 0;
  log(st, '开始出牌，皇帝 ' + byId(st, st.emperorId).name + ' 先出');
}

function markFinished(st, p) {
  p.finished = true;
  p.rank = ++st.finishedCount;
  st.finishedOrder.push(p.id);
  log(st, p.name + ' 出完，第 ' + p.rank + ' 名');
}

function nextPlayer(st, fromId) {
  var n = st.players.length;
  var idx = st.players.indexOf(byId(st, fromId));
  for (var i = 1; i <= n; i++) {
    var cand = st.players[(idx + i) % n];
    if (!cand.finished) return cand.id;
  }
  return null;
}

function checkEnd(st) {
  var rev = st.players.filter(function (p) { return !p.isEmperor && !p.isGuard; });
  var royal = st.players.filter(function (p) { return p.isEmperor || p.isGuard; });
  var royalWin = false;
  if (st.solo) {
    var emp = byId(st, st.emperorId);
    if (emp.finished) royalWin = true;
    else if (rev.some(function (p) { return p.finished; })) royalWin = false;
    else return false;
  } else {
    if (royal.every(function (p) { return p.finished; })) royalWin = true;
    else if (rev.every(function (p) { return p.finished; })) royalWin = false;
    else return false;
  }
  endGame(st, royalWin);
  return true;
}

function endGame(st, royalWin) {
  // 剩下的人按手牌数排名
  var rest = st.players.filter(function (p) { return !p.finished; });
  rest.sort(function (a, b) { return a.hand.length - b.hand.length; });
  rest.forEach(function (p) { p.finished = true; p.rank = ++st.finishedCount; });

  var n = st.players.length;
  var rev = st.players.filter(function (p) { return !p.isEmperor && !p.isGuard; });
  var royal = st.players.filter(function (p) { return p.isEmperor || p.isGuard; });
  var base = st.solo ? 24 : (st.guardOpen ? 24 : 12);
  var winners = royalWin ? royal : rev;
  var losers = royalWin ? rev : royal;
  var deltas = {};
  st.players.forEach(function (p) { deltas[p.id] = 0; });
  winners.forEach(function (p) { deltas[p.id] += base / winners.length; });
  losers.forEach(function (p) { deltas[p.id] -= base / losers.length; });

  st.result = {
    royalWin: royalWin, base: base,
    emperorId: st.emperorId, guardId: st.guardId, solo: st.solo, guardOpen: st.guardOpen,
    guardCardName: st.guardCardName,
    ranking: st.players.slice().sort(function (a, b) { return a.rank - b.rank; }).map(function (p) {
      return { id: p.id, name: p.name, rank: p.rank, left: p.hand.length, delta: deltas[p.id] };
    })
  };
  st.stage = 'ended';
  log(st, (royalWin ? '保皇派' : '革命派') + '获胜！基础分 ' + base);
}

function view(room, playerId) {
  var st = room.state;
  if (!st || st.stage === 'idle') return { ui: 'baohuang', stage: 'idle' };
  var me = null;
  var iAmEmperor = (playerId === st.emperorId);
  var guardVisible = st.guardOpen || (st.stage === 'ended') || (playerId === st.guardId);
  var players = st.players.map(function (p) {
    if (p.id === playerId) me = p;
    return {
      id: p.id, name: p.name, handCount: p.hand.length, finished: p.finished, rank: p.rank,
      isEmperor: p.isEmperor,
      isGuard: p.isGuard && guardVisible,
      guardUnknown: p.isGuard && !guardVisible
    };
  });
  return {
    ui: 'baohuang', stage: st.stage,
    players: players, meId: playerId,
    myHand: me ? me.hand.slice() : [],
    emperorId: st.emperorId, guardId: guardVisible ? st.guardId : null,
    guardCardName: st.guardCardName, solo: st.solo, guardOpen: st.guardOpen,
    iAmEmperor: iAmEmperor, iAmGuard: playerId === st.guardId,
    turnId: st.turnId,
    lastCombo: st.lastCombo ? { playerId: st.lastPlayerId, label: st.lastCombo.label } : null,
    // 给前端「提示」按钮用的原始牌型（不含具体牌，不会泄露信息）
    lastComboRaw: st.lastCombo ? { type: st.lastCombo.type, main: st.lastCombo.main, len: st.lastCombo.len } : null,
    mustLead: st.turnId === playerId && (!st.lastCombo || st.lastPlayerId === playerId),
    canPass: st.turnId === playerId && st.lastCombo && st.lastPlayerId !== playerId,
    guardChoices: (st.stage === 'choose' && iAmEmperor) ? GUARD_CHOICES : null,
    log: st.log.slice(-16),
    result: st.result
  };
}

module.exports = {
  id: 'baohuang', name: '保皇', minPlayers: 4, maxPlayers: 5,
  defaults: DEFAULTS, optionFields: OPTION_FIELDS, rules: RULES,
  init: init, start: start, handle: handle, view: view, nextLabel: '再来一局'
};
