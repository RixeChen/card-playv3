/* =====================================================================
 * shengji-rules.js —— 升级（拖拉机）规则核心（浏览器 + Node 双用）
 *
 * 采用的玩法版本（规则有歧义处，按通行「两副牌、四人、对家结队」做法）：
 *   1) 牌具：2 副扑克牌共 108 张（含大小王），4 人，每人 25 张，8 张底牌。
 *   2) 队伍：座位 0/2 一队，1/3 一队（对家结队）。
 *   3) 主牌 = 大王 + 小王 + 所有级牌 + 主花色全部牌。级牌指「当前级数」对应的点数
 *      （如打 2 时，四门花色的 2 共 8 张全是主牌，其中主花色的 2 最大）。
 *   4) 主牌大小：大王 > 小王 > 主级牌 > 副级牌(♠>♥>♦>♣) > 主花色其余牌(A>K>…>3>2，级牌除外)。
 *   5) 副牌大小：A > K > Q > J > 10 > … > 3 > 2（级牌不参与，级牌已全是主牌）。
 *   6) 牌型：单张 / 对子 / 拖拉机（同组内点数相邻的对子，≥2 对）/ 甩牌（同组多张混出）。
 *      因为只有两副牌，每个「牌项」最多 2 张，所以不存在 3 张以上的刻子。
 *   7) 拖拉机序列（从大到小）：
 *      主牌组 = 大王, 小王, 主级牌, 副级牌(按花色), 主花色 A,K,…,3(跳过级牌)
 *      副牌组 = A, K, Q, J, 10, …, 3, 2（跳过级牌点数）
 *   8) 跟牌规则（简化但通行）：出牌张数必须和首家相同；
 *      选中牌中「属于首家那一门」的张数，必须等于 min(手中该门张数, 需跟张数)。
 *      有该门牌就优先出该门，不够时可用主牌「毙」，都没有就随便垫。
 *   9) 大小判定：
 *      - 领出是主牌：跟牌全是主牌才能压；否则算垫牌（最小）。
 *      - 领出是副牌：出牌中含主牌 = 毙牌（能压）；全是该门副牌 = 跟牌；其余算垫牌。
 *      - 同为毙牌：主牌张数多者大，张数相同比最大的那张主牌。
 *      - 同为跟牌：拖拉机 > 对子 > 单张 > 散张；同型比最大张。
 *   10) 甩牌合法性：把甩出的牌拆成若干「拖拉机 / 对子 / 单张」，
 *       只要任何其他玩家在同一门里存在「同型且更大」的牌，甩牌就不成立。
 *   11) 计分：5=5 分、10=10 分、K=10 分。每轮分归该轮赢家。底牌分在被「抠底」时翻倍。
 * ===================================================================== */
(function (root, factory) {
  var api = factory(typeof module === 'object' && module.exports ? require('./cards.js') : root.Cards);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Shengji = api;
})(typeof self !== 'undefined' ? self : globalThis, function (Cards) {
  'use strict';

  var SUIT_ORDER = { S: 4, H: 3, D: 2, C: 1 };
  var LEVELS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  var LEVEL_VAL = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14 };

  function levelValue(ctx) { return LEVEL_VAL[ctx.level]; }

  /** 该牌属于哪一门：'T'=主牌，否则 'S'/'H'/'D'/'C' */
  function groupOf(c, ctx) {
    if (!c) return null;
    if (c.rank === 'RJ' || c.rank === 'BJ') return 'T';
    if (c.rank === ctx.level) return 'T';
    if (ctx.trumpSuit && c.suit === ctx.trumpSuit) return 'T';
    return c.suit;
  }
  function isTrump(c, ctx) { return groupOf(c, ctx) === 'T'; }

  /** 牌项（构成对子/拖拉机的单位） */
  function itemOf(c, ctx) {
    if (c.rank === 'RJ') return 'RJ';
    if (c.rank === 'BJ') return 'BJ';
    if (c.rank === ctx.level) {
      return (ctx.trumpSuit && c.suit === ctx.trumpSuit) ? 'LT' : ('L_' + c.suit);
    }
    return 'P' + c.value;
  }

  var _seqCache = {};
  /** 某一门的序列（从大到小） */
  function seqOf(group, ctx) {
    var key = group + '|' + ctx.level + '|' + ctx.trumpSuit;
    if (_seqCache[key]) return _seqCache[key];
    var arr = [];
    if (group === 'T') {
      arr.push('RJ', 'BJ');
      if (ctx.trumpSuit) arr.push('LT');
      ['S', 'H', 'D', 'C'].forEach(function (s) { if (s !== ctx.trumpSuit) arr.push('L_' + s); });
      if (ctx.trumpSuit) {
        for (var v = 14; v >= 2; v--) { if (v !== levelValue(ctx)) arr.push('P' + v); }
      }
    } else {
      for (var v2 = 14; v2 >= 2; v2--) { if (v2 !== levelValue(ctx)) arr.push('P' + v2); }
    }
    _seqCache[key] = arr;
    return arr;
  }

  function idxOf(item, group, ctx) { return seqOf(group, ctx).indexOf(item); }

  /** 牌型识别：单张 / 对子 / 刻子 / 拖拉机 / 甩牌；跨门直接返回 null */
  function analyze(cards, ctx) {
    if (!cards || !cards.length) return null;
    var g = groupOf(cards[0], ctx);
    for (var i = 1; i < cards.length; i++) {
      if (groupOf(cards[i], ctx) !== g) return null;
    }
    var n = cards.length;
    var cnt = {}, k;
    for (i = 0; i < n; i++) { k = itemOf(cards[i], ctx); cnt[k] = (cnt[k] || 0) + 1; }
    var seq = seqOf(g, ctx);
    var keys = Object.keys(cnt);
    var idxs = keys.map(function (x) { return seq.indexOf(x); });
    var topIdx = Math.min.apply(null, idxs);

    if (n === 1) return { kind: 'single', group: g, size: 1, topIdx: topIdx, parts: [{ type: 'single', count: 1, idx: idxs[0] }] };
    if (keys.length === 1) {
      var c0 = cnt[keys[0]];
      return {
        kind: c0 === 2 ? 'pair' : 'set', group: g, size: n, topIdx: topIdx,
        parts: [{ type: c0 === 2 ? 'pair' : 'set', count: c0, idx: idxs[0] }]
      };
    }
    // 全部是 2 张且序列上相邻 → 拖拉机
    var allTwo = keys.every(function (x) { return cnt[x] === 2; });
    if (allTwo && keys.length >= 2) {
      var pos = idxs.slice().sort(function (a, b) { return a - b; });
      var ok = pos[0] >= 0;
      for (i = 1; i < pos.length; i++) { if (pos[i] !== pos[i - 1] + 1) { ok = false; break; } }
      if (ok) {
        return {
          kind: 'tractor', group: g, size: n, len: keys.length, topIdx: pos[0],
          parts: [{ type: 'tractor', len: keys.length, topIdx: pos[0] }]
        };
      }
    }
    // 甩牌：混合组合
    return { kind: 'throw', group: g, size: n, topIdx: topIdx, parts: decompose(cnt, seq) };
  }

  function decompose(cnt, seq) {
    var order = Object.keys(cnt).map(function (k) { return { k: k, i: seq.indexOf(k) }; })
      .sort(function (a, b) { return a.i - b.i; });
    var parts = [], i = 0;
    while (i < order.length) {
      var j = i;
      if (cnt[order[i].k] === 2) {
        j = i + 1;
        while (j < order.length && cnt[order[j].k] === 2 && order[j].i === order[j - 1].i + 1) j++;
      }
      if (j - i >= 2) {
        parts.push({ type: 'tractor', len: j - i, topIdx: order[i].i });
        i = j;
      } else {
        parts.push({ type: cnt[order[i].k] === 2 ? 'pair' : 'single', count: cnt[order[i].k], idx: order[i].i });
        i++;
      }
    }
    return parts;
  }

  /** 甩牌是否成立：otherHands 是其他玩家的手牌数组 */
  function throwValid(cards, ctx, otherHands, allowThrow) {
    var combo = analyze(cards, ctx);
    if (!combo) return { ok: false, msg: '甩牌必须全是同一门（全主牌或同一副牌花色）' };
    if (combo.kind !== 'throw') return { ok: true };
    if (allowThrow === false) return { ok: false, msg: '本房间未开启甩牌，只能出单张/对子/拖拉机' };
    var seq = seqOf(combo.group, ctx);
    for (var h = 0; h < otherHands.length; h++) {
      var gc = otherHands[h].filter(function (c) { return groupOf(c, ctx) === combo.group; });
      if (!gc.length) continue;
      var cnt = {};
      gc.forEach(function (c) { var it = itemOf(c, ctx); cnt[it] = (cnt[it] || 0) + 1; });
      for (var p = 0; p < combo.parts.length; p++) {
        var part = combo.parts[p];
        if (part.type === 'single') {
          if (hasBigger(cnt, seq, 1, part.idx)) return { ok: false, msg: '甩牌不成立：有人有更大的同门单张' };
        } else if (part.type === 'pair') {
          if (hasBigger(cnt, seq, 2, part.idx)) return { ok: false, msg: '甩牌不成立：有人有更大的同门对子' };
        } else if (part.type === 'set') {
          if (hasBigger(cnt, seq, part.count, part.idx)) return { ok: false, msg: '甩牌不成立：有人有更大的同门同点牌' };
        } else if (part.type === 'tractor') {
          if (hasBiggerTractor(cnt, seq, part.len, part.topIdx)) return { ok: false, msg: '甩牌不成立：有人有更大的同门拖拉机' };
        }
      }
    }
    return { ok: true };
  }

  function hasBigger(cnt, seq, need, idx) {
    for (var k in cnt) {
      var i = seq.indexOf(k);
      if (i >= 0 && i < idx && cnt[k] >= need) return true;
    }
    return false;
  }
  function hasBiggerTractor(cnt, seq, len, topIdx) {
    var two = [];
    for (var i = 0; i < seq.length; i++) { if (cnt[seq[i]] >= 2) two.push(i); }
    for (i = 0; i + len <= two.length; i++) {
      var run = two.slice(i, i + len), ok = true;
      for (var j = 1; j < run.length; j++) { if (run[j] !== run[j - 1] + 1) { ok = false; break; } }
      if (ok && run[0] < topIdx) return true;
    }
    return false;
  }

  /** 跟牌合法性：sel 是本次要出的牌，lead 是本轮首家的牌型 */
  function followCheck(hand, sel, lead, ctx) {
    var n = lead.size;
    if (sel.length !== n) return { ok: false, msg: '出牌张数必须和首家相同（' + n + ' 张）' };
    var lg = lead.group;
    var have = hand.filter(function (c) { return groupOf(c, ctx) === lg; }).length;
    var selHave = sel.filter(function (c) { return groupOf(c, ctx) === lg; }).length;
    var need = Math.min(have, n);
    if (selHave !== need) {
      return {
        ok: false,
        msg: need === n
          ? ('必须出 ' + n + ' 张「' + groupName(lg, ctx) + '」')
          : ('你只有 ' + have + ' 张「' + groupName(lg, ctx) + '」，需全部出掉再用主牌/其他牌补足到 ' + n + ' 张')
      };
    }
    return { ok: true };
  }

  function groupName(g, ctx) {
    if (g === 'T') return '主牌';
    var m = { S: '♠', H: '♥', D: '♦', C: '♣' };
    return m[g] || g;
  }

  /** 一轮中某次出牌的强度，用于比大小 */
  function trickScore(sel, lead, ctx) {
    var n = lead.size;
    var tc = sel.filter(function (c) { return isTrump(c, ctx); }).length;
    var tier = 0, s1 = 0, s2 = 0;
    if (lead.group === 'T') {
      if (tc === n) {
        tier = 2; s1 = n; s2 = -maxItemIdx(sel.filter(function (c) { return isTrump(c, ctx); }), 'T', ctx);
      }
    } else {
      var inLead = sel.filter(function (c) { return groupOf(c, ctx) === lead.group; }).length;
      if (tc > 0) {
        tier = 2; s1 = tc; s2 = -maxItemIdx(sel.filter(function (c) { return isTrump(c, ctx); }), 'T', ctx);
      } else if (inLead === n) {
        var a = analyze(sel, ctx);
        tier = 1;
        s1 = a && a.kind === 'tractor' ? 3 : (a && a.kind === 'pair') ? 2 : (a && a.kind === 'single') ? 1 : 0;
        s2 = -maxItemIdx(sel, lead.group, ctx);
      }
    }
    return { tier: tier, s1: s1, s2: s2 };
  }
  function maxItemIdx(cards, group, ctx) {
    var seq = seqOf(group, ctx), best = 999;
    cards.forEach(function (c) {
      var i = seq.indexOf(itemOf(c, ctx));
      if (i >= 0 && i < best) best = i;
    });
    return best;
  }
  /** >0 表示 a 压过 b */
  function cmpTrick(a, b) {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.s1 !== b.s1) return a.s1 - b.s1;
    return a.s2 - b.s2;
  }

  /** 分牌：5=5 分，10=10 分，K=10 分 */
  function scoreOf(c) {
    if (c.rank === '5') return 5;
    if (c.rank === '10' || c.rank === 'K') return 10;
    return 0;
  }
  function scoreOfCards(cards) {
    return cards.reduce(function (s, c) { return s + scoreOf(c); }, 0);
  }

  /** 手牌排序：主牌在前（按主牌序列），副牌按花色分组 */
  function sortHand(hand, ctx) {
    var g = { T: [], S: [], H: [], D: [], C: [] };
    hand.forEach(function (c) { g[groupOf(c, ctx)].push(c); });
    var out = [];
    ['T', 'S', 'H', 'D', 'C'].forEach(function (k) {
      if (k === 'T') {
        var seq = seqOf('T', ctx);
        g.T.sort(function (a, b) {
          var d = seq.indexOf(itemOf(a, ctx)) - seq.indexOf(itemOf(b, ctx));
          return d || (SUIT_ORDER[b.suit] || 0) - (SUIT_ORDER[a.suit] || 0);
        });
      } else {
        g[k].sort(function (a, b) {
          var lv = levelValue(ctx);
          var av = a.value === lv ? -1 : a.value, bv = b.value === lv ? -1 : b.value;
          return bv - av;
        });
      }
      out = out.concat(g[k]);
    });
    return out;
  }

  return {
    LEVELS: LEVELS, levelValue: levelValue,
    groupOf: groupOf, isTrump: isTrump, itemOf: itemOf, seqOf: seqOf,
    analyze: analyze, throwValid: throwValid, followCheck: followCheck,
    trickScore: trickScore, cmpTrick: cmpTrick,
    scoreOf: scoreOf, scoreOfCards: scoreOfCards,
    sortHand: sortHand, groupName: groupName
  };
});
