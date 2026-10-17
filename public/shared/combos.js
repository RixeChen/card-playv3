/* =====================================================================
 * combos.js —— 保皇牌型识别与比较（浏览器 + Node 双用）
 *
 * 采用的玩法版本（有歧义处按通行做法，均已注明）：
 *   1) 牌点顺序：3<4<5<6<7<8<9<10<J<Q<K<A<2<小王<大王
 *   2) 牌型：单张 / 对子 / 三张 / 三带一 / 三带二 / 顺子(≥5) / 连对(≥3对) /
 *      飞机(≥2 组连续三张，不带翅膀) / 炸弹(≥4 张同点) / 王炸(≥2 张王)
 *   3) 顺子、连对、飞机都不含 2 和王（范围 3..A）。
 *   4) 王牌（小王/大王）只能单出，或者 ≥2 张一起当「王炸」。
 *      因此「小王+大王」不是对子，而是 2 张王炸 —— 这是本实现的简化取舍。
 *   5) 未实现：四带二、飞机带翅膀、连对带王等地方变体。
 *   6) 压牌：炸弹 > 非炸弹；炸弹之间先比张数，张数相同则 王炸 > 普通炸弹，
 *      同为王炸比「含大王张数」，同为普通炸弹比点数。
 * ===================================================================== */
(function (root, factory) {
  var api = factory(typeof module === 'object' && module.exports ? require('./cards.js') : root.Cards);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Combos = api;
})(typeof self !== 'undefined' ? self : globalThis, function (Cards) {
  'use strict';

  var TYPE_LABEL = {
    single: '单张', pair: '对子', trio: '三张', trio1: '三带一', trio2: '三带二',
    straight: '顺子', dstraight: '连对', plane: '飞机', bomb: '炸弹', jbomb: '王炸'
  };

  function analyze(cards) {
    if (!cards || !cards.length) return null;
    var n = cards.length;
    var jokers = cards.filter(function (c) { return c.joker; });
    var normal = cards.filter(function (c) { return !c.joker; });

    // 单张（王也可以是单张）
    if (n === 1) return mk('single', Cards.bhValue(cards[0]), 1, cards, cards[0].text);
    // 王炸：全是王且 ≥2 张
    if (jokers.length === n && n >= 2) {
      var big = jokers.filter(function (c) { return c.rank === 'RJ'; }).length;
      return mk('jbomb', n, n, cards, n + '张王炸', { big: big });
    }
    // 含王但不成王炸 → 非法
    if (jokers.length > 0) return null;

    var counts = Cards.countByRank(normal);
    var ranks = Object.keys(counts);
    var vals = ranks.map(function (r) { return Cards.bhValue(normal.find(function (c) { return c.rank === r; })); }).sort(function (a, b) { return a - b; });
    var cnts = ranks.map(function (r) { return counts[r]; });

    // 炸弹：≥4 张同点
    if (n >= 4 && ranks.length === 1) return mk('bomb', vals[0], n, cards, n + '张炸弹 ' + ranks[0]);

    var maxCnt = Math.max.apply(null, cnts);
    var minCnt = Math.min.apply(null, cnts);

    if (n === 2 && ranks.length === 1 && maxCnt === 2) return mk('pair', vals[0], 1, cards, '对' + ranks[0]);
    if (n === 3 && ranks.length === 1 && maxCnt === 3) return mk('trio', vals[0], 1, cards, '三张 ' + ranks[0]);
    if (n === 4 && ranks.length === 2 && maxCnt === 3) return mk('trio1', trioVal(counts, normal), 4, cards, '三带一');
    if (n === 5 && ranks.length === 2 && maxCnt === 3 && minCnt === 2) return mk('trio2', trioVal(counts, normal), 5, cards, '三带二');

    // 顺子：≥5 张、每张点数不同、连续、范围 3..A
    if (n >= 5 && ranks.length === n && maxCnt === 1 && Cards.isConsecutive(vals) && vals[0] >= 3 && vals[vals.length - 1] <= 14) {
      return mk('straight', vals[vals.length - 1], n, cards, n + '张顺子');
    }
    // 连对：≥3 组、每组 2 张、连续、范围 3..A
    if (n >= 6 && n % 2 === 0 && ranks.length === n / 2 && maxCnt === 2 && ranks.length >= 3 &&
      Cards.isConsecutive(vals) && vals[0] >= 3 && vals[vals.length - 1] <= 14) {
      return mk('dstraight', vals[vals.length - 1], ranks.length, cards, ranks.length + '连对');
    }
    // 飞机：≥2 组、每组 3 张、连续、范围 3..A（不带翅膀）
    if (n >= 6 && n % 3 === 0 && ranks.length === n / 3 && maxCnt === 3 && ranks.length >= 2 &&
      Cards.isConsecutive(vals) && vals[0] >= 3 && vals[vals.length - 1] <= 14) {
      return mk('plane', vals[vals.length - 1], ranks.length, cards, ranks.length + '连三张');
    }
    return null;
  }

  function trioVal(counts, cards) {
    for (var r in counts) { if (counts[r] === 3) return Cards.bhValue(cards.find(function (c) { return c.rank === r; })); }
    return -1;
  }

  function mk(type, main, len, cards, label, extra) {
    var o = { type: type, main: main, len: len, cards: cards.slice(), label: label || TYPE_LABEL[type] };
    if (extra) for (var k in extra) o[k] = extra[k];
    return o;
  }

  /** a 能否压过 b（b 为空表示自由出牌） */
  function beats(a, b) {
    if (!a) return false;
    if (!b) return true;
    var aB = (a.type === 'bomb' || a.type === 'jbomb');
    var bB = (b.type === 'bomb' || b.type === 'jbomb');
    if (aB && !bB) return true;
    if (!aB && bB) return false;
    if (aB && bB) {
      if (a.len !== b.len) return a.len > b.len;
      if (a.type === 'jbomb' && b.type !== 'jbomb') return true;
      if (a.type !== 'jbomb' && b.type === 'jbomb') return false;
      if (a.type === 'jbomb' && b.type === 'jbomb') return a.big > b.big;
      return a.main > b.main;
    }
    if (a.type !== b.type) return false;
    if (a.len !== b.len) return false;
    return a.main > b.main;
  }

  /** 提示：从手牌中找出一个能压过 last 的最小组合（找不到返回 null） */
  function findBeat(hand, last) {
    if (!last) {
      var s = analyze([hand[hand.length - 1]]);
      return s ? [hand[hand.length - 1]] : (hand.length ? [hand[hand.length - 1]] : null);
    }
    var sorted = Cards.sortBH(hand);
    // 同类型同长度
    for (var i = 0; i < sorted.length; i++) {
      var c = sorted[i];
      var cand = null;
      if (last.type === 'single' && !c.joker) cand = [c];
      else if (last.type === 'pair') { var p = pickN(sorted, c.rank, 2); if (p) cand = p; }
      else if (last.type === 'trio') { var t = pickN(sorted, c.rank, 3); if (t) cand = t; }
      else if (last.type === 'trio1') { var t1 = pickN(sorted, c.rank, 3); if (t1) cand = t1.concat(pickOther(sorted, t1, 1)); }
      else if (last.type === 'trio2') { var t2 = pickN(sorted, c.rank, 3); if (t2) cand = t2.concat(pickPair(sorted, t2)); }
      if (cand && cand.length === last.len && beats(analyze(cand), last)) return cand;
    }
    // 炸弹
    var byRank = Cards.groupByRank(sorted);
    for (var r in byRank) {
      if (byRank[r].length >= 4 && !byRank[r][0].joker) {
        var b = byRank[r].slice(0, Math.max(4, last.len + 1 >= 4 ? last.len + 1 : 4));
        if (beats(analyze(b), last)) return b;
      }
    }
    var jk = sorted.filter(function (x) { return x.joker; });
    if (jk.length >= 2 && beats(analyze(jk.slice(0, Math.max(2, last.len + 1))), last)) {
      return jk.slice(0, Math.max(2, last.len + 1));
    }
    return null;
  }

  function pickN(hand, rank, n) {
    var g = Cards.groupByRank(hand)[rank] || [];
    return g.length >= n ? g.slice(0, n) : null;
  }
  function pickOther(hand, exclude, n) {
    var ex = {}; exclude.forEach(function (c) { ex[c.id] = 1; });
    return hand.filter(function (c) { return !ex[c.id]; }).slice(0, n);
  }
  function pickPair(hand, exclude) {
    var ex = {}; exclude.forEach(function (c) { ex[c.id] = 1; });
    var rest = hand.filter(function (c) { return !ex[c.id]; });
    var g = Cards.groupByRank(rest);
    for (var r in g) if (g[r].length >= 2 && !g[r][0].joker) return g[r].slice(0, 2);
    return [];
  }

  return { analyze: analyze, beats: beats, findBeat: findBeat, TYPE_LABEL: TYPE_LABEL };
});
