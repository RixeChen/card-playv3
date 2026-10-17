/* =====================================================================
 * poker.js —— 五张牌（港式梭哈）牌力评估（浏览器 + Node 双用）
 *
 * 牌型从大到小：
 *   8 同花顺 > 7 四条 > 6 葫芦 > 5 同花 > 4 顺子 > 3 三条 > 2 两对 > 1 一对 > 0 散牌
 *
 * 港式五张牌本实现只发 8、9、10、J、Q、K、A 共 28 张（2~7 已剔除），因此：
 *   - 可能的顺子只有三种：A K Q J 10 / K Q J 10 9 / Q J 10 9 8
 *   - 「A2345 小顺子」不可能出现（2~5 都不在牌堆里），相关判断保留但不会触发
 *   - 四条、葫芦、同花、两对等牌型仍然存在，整体成牌率比满牌堆低，节奏更快
 *
 * 发牌与下注顺序（采用的玩法版本）：
 *   每家 1 张暗牌（底牌）+ 4 张明牌。每发一张明牌后下注一轮，共 4 轮。
 *   **每一轮的下注起始位都是「明牌牌面最大」的玩家**（从发第 2 张牌起即是如此），
 *   明牌按 四条>三条>两对>一对>散牌 再比单张大小；完全相同则座位靠前者先。
 *
 * 采用的玩法版本（有歧义处，按港式通行做法）：
 *   1) A 可作大牌组成 A K Q J 10（最大的顺子/同花顺）。
 *   2) 完全同点时比花色：♠ > ♥ > ♦ > ♣（可在房间选项里关闭，关闭则并列平分彩池）。
 * ===================================================================== */
(function (root, factory) {
  var api = factory(typeof module === 'object' && module.exports ? require('./cards.js') : root.Cards);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Poker = api;
})(typeof self !== 'undefined' ? self : globalThis, function (Cards) {
  'use strict';

  var CAT_NAME = ['散牌', '一对', '两对', '三条', '顺子', '同花', '葫芦', '四条', '同花顺'];

  function evaluate(cards) {
    // 防御：五张牌必须正好 5 张；空牌/张数不对返回 null（避免把空手误判成「同花」）
    if (!cards || cards.length !== 5) return null;
    var cs = cards.slice().sort(function (a, b) { return b.value - a.value; });
    var counts = Cards.countByRank(cs);          // { 点数字符串: 张数 }
    var valOf = {};
    cs.forEach(function (c) { valOf[c.rank] = c.value; });
    // groups：先按张数降序，再按点数降序（注意这里是「点数字符串」，不能直接转数字，K/J/Q 会变成 NaN）
    var groups = Object.keys(counts).sort(function (a, b) {
      return (counts[b] - counts[a]) || (valOf[b] - valOf[a]);
    });
    var gv = groups.map(function (r) { return valOf[r]; });
    var isFlush = cs.every(function (c) { return c.suit === cs[0].suit; });
    var uniq = [];
    for (var i = 0; i < cs.length; i++) { if (uniq.indexOf(cs[i].value) < 0) uniq.push(cs[i].value); }

    // 顺子判定（含 A2345 小顺）
    var straightHigh = null;
    if (uniq.length === 5) {
      if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
      else if (uniq[0] === 14 && uniq[1] === 5 && uniq[2] === 4 && uniq[3] === 3 && uniq[4] === 2) straightHigh = 5;
    }
    var c0 = counts[groups[0]], c1 = counts[groups[1]] || 0;

    var res = null;
    if (isFlush && straightHigh) res = { cat: 8, key: [straightHigh] };
    else if (c0 === 4) res = { cat: 7, key: [gv[0], gv[1]] };
    else if (c0 === 3 && c1 === 2) res = { cat: 6, key: [gv[0], gv[1]] };
    else if (isFlush) res = { cat: 5, key: uniq.slice() };
    else if (straightHigh) res = { cat: 4, key: [straightHigh] };
    else if (c0 === 3) res = { cat: 3, key: [gv[0]].concat(gv.slice(1)) };
    else if (c0 === 2 && c1 === 2) res = { cat: 2, key: [gv[0], gv[1], gv[2]] };
    else if (c0 === 2) res = { cat: 1, key: [gv[0]].concat(gv.slice(1)) };
    else res = { cat: 0, key: uniq.slice() };

    res.name = CAT_NAME[res.cat];
    // 花色比大小的依据：按点数降序、同点数按花色降序后取花色序列
    res.suitKey = cs.slice().sort(function (a, b) {
      return (b.value - a.value) || (b.suitOrder - a.suitOrder);
    }).map(function (c) { return c.suitOrder; });
    return res;
  }

  /** >0 表示 a 大，<0 表示 b 大，0 表示完全相等。null 视为最小。 */
  function compare(a, b) {
    if (!a && !b) return 0;
    if (!a) return -1;
    if (!b) return 1;
    if (a.cat !== b.cat) return a.cat - b.cat;
    var n = Math.max(a.key.length, b.key.length);
    for (var i = 0; i < n; i++) {
      var d = (a.key[i] || 0) - (b.key[i] || 0);
      if (d) return d;
    }
    return 0;
  }

  /** 港式比花色：牌力完全相同时，依次比每张牌的花色 ♠>♥>♦>♣ */
  function compareSuit(a, b) {
    if (!a || !b) return 0;
    for (var i = 0; i < a.suitKey.length; i++) {
      var d = a.suitKey[i] - b.suitKey[i];
      if (d) return d;
    }
    return 0;
  }

  /**
   * 明牌（1~4 张）强弱打分，用于每轮下注的起始位（牌面大者先说话）。
   * 只按「已成牌型 + 剩余单张」比较，不考虑花色（同花潜力不纳入，这是通行做法）。
   *   w: 5=四条 4=三条 3=两对 2=一对 1=散牌
   */
  function scoreVisible(cards) {
    if (!cards || !cards.length) return { w: 0, key: [] };
    var counts = Cards.countByRank(cards);
    var valOf = {};
    cards.forEach(function (c) { valOf[c.rank] = c.value; });
    // 先按张数降序，再按点数降序
    var groups = Object.keys(counts).sort(function (a, b) {
      return (counts[b] - counts[a]) || (valOf[b] - valOf[a]);
    });
    var gv = groups.map(function (r) { return valOf[r]; });
    var top = counts[groups[0]];

    if (top >= 4) return { w: 5, key: [gv[0]] };                       // 四条
    if (top === 3) return { w: 4, key: [gv[0]].concat(gv.slice(1)) };  // 三条
    if (top === 2) {
      var pairs = gv.filter(function (v, i) { return counts[groups[i]] === 2; });
      if (pairs.length >= 2) {                                          // 两对
        return { w: 3, key: pairs.concat(gv.filter(function (v, i) { return counts[groups[i]] === 1; })) };
      }
      return { w: 2, key: [gv[0]].concat(gv.slice(1)) };                // 一对
    }
    return { w: 1, key: gv.slice() };                                   // 散牌
  }

  function compareVisible(a, b) {
    if (a.w !== b.w) return a.w - b.w;
    var n = Math.max(a.key.length, b.key.length);
    for (var i = 0; i < n; i++) {
      var d = (a.key[i] || 0) - (b.key[i] || 0);
      if (d) return d;
    }
    return 0;
  }

  return {
    CAT_NAME: CAT_NAME,
    evaluate: evaluate, compare: compare, compareSuit: compareSuit,
    scoreVisible: scoreVisible, compareVisible: compareVisible
  };
});
