/* =====================================================================
 * cards.js —— 通用扑克牌工具（浏览器 + Node 双用）
 *
 * 本文件同时被：
 *   - 服务端  require('../public/shared/cards.js')
 *   - 浏览器  <script src="/shared/cards.js"></script>  挂载到 window.Cards
 *
 * 牌的字段说明：
 *   id        唯一编号（含第几副牌，保证多副牌时不重复）
 *   suit      花色代码 S=♠ H=♥ D=♦ C=♣ J=王
 *   rank      点数字符串 '3'..'10','J','Q','K','A','2','BJ'(小王),'RJ'(大王)
 *   value     自然点数（3..14 对应 3..A；'2' 记作 2；小王 16；大王 17）
 *   joker     是否大小王
 * ===================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Cards = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  // 花色顺序：港式梭哈比花色时 ♠ > ♥ > ♦ > ♣
  var SUITS = [
    { key: 'S', label: '♠', name: '黑桃', order: 4, color: 'black' },
    { key: 'H', label: '♥', name: '红桃', order: 3, color: 'red' },
    { key: 'D', label: '♦', name: '方块', order: 2, color: 'red' },
    { key: 'C', label: '♣', name: '梅花', order: 1, color: 'black' }
  ];

  // 发牌顺序按 3..A,2（保皇/斗地主习惯），'2' 的 value 记为 2，具体大小由各游戏换算
  var RANKS = [
    { rank: '3', value: 3 }, { rank: '4', value: 4 }, { rank: '5', value: 5 },
    { rank: '6', value: 6 }, { rank: '7', value: 7 }, { rank: '8', value: 8 },
    { rank: '9', value: 9 }, { rank: '10', value: 10 }, { rank: 'J', value: 11 },
    { rank: 'Q', value: 12 }, { rank: 'K', value: 13 }, { rank: 'A', value: 14 },
    { rank: '2', value: 2 }
  ];

  /**
   * 造牌：decks 副牌，withJokers 是否含大小王
   * onlyRanks：可选，只保留这些点数（例如港式五张牌只用 8~A 共 28 张）
   */
  function createShoe(decks, withJokers, onlyRanks) {
    var useRanks = (onlyRanks && onlyRanks.length)
      ? RANKS.filter(function (r) { return onlyRanks.indexOf(r.rank) >= 0; })
      : RANKS;
    var out = [];
    var n = 0;
    for (var d = 0; d < decks; d++) {
      for (var i = 0; i < SUITS.length; i++) {
        var s = SUITS[i];
        for (var j = 0; j < useRanks.length; j++) {
          var r = useRanks[j];
          out.push({
            id: s.key + r.rank + '#' + d,
            suit: s.key, suitLabel: s.label, suitName: s.name,
            suitOrder: s.order, color: s.color,
            rank: r.rank, value: r.value, joker: false,
            text: s.label + r.rank
          });
        }
      }
      if (withJokers) {
        out.push({ id: 'BJ#' + d, suit: 'J', suitLabel: '', suitName: '', suitOrder: 0, color: 'joker', rank: 'BJ', value: 16, joker: true, text: '小王' });
        out.push({ id: 'RJ#' + d, suit: 'J', suitLabel: '', suitName: '', suitOrder: 0, color: 'joker', rank: 'RJ', value: 17, joker: true, text: '大王' });
      }
    }
    return out;
  }

  /** Fisher-Yates 洗牌（原地） */
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /** 从 hand 中按 id 取走若干张，返回被取走的牌数组（找不到就忽略） */
  function takeByIds(hand, ids) {
    var taken = [];
    for (var k = 0; k < ids.length; k++) {
      for (var i = 0; i < hand.length; i++) {
        if (hand[i].id === ids[k]) { taken.push(hand.splice(i, 1)[0]); break; }
      }
    }
    return taken;
  }

  /* ---------------- 唬牌（吹牛）体系的点数换算 ----------------
   * 与保皇不同：吹牛里 A 是最大的普通牌，2 最小，王最大。
   * 这一个函数同时用于两处：
   *   1) 喊牌大小比较（跟牌必须张数更多，或同张数点数更大）
   *   2) 剩余手牌计分（输家按每张牌的点数扣分）
   * 取值：3=3 … 10=10, J=11, Q=12, K=13, A=14, 2=2, 小王=15, 大王=16
   * ----------------------------------------------------------- */
  var BS_RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];

  function rankValue(rank) {
    if (rank === 'BJ') return 15;
    if (rank === 'RJ') return 16;
    for (var i = 0; i < RANKS.length; i++) if (RANKS[i].rank === rank) return RANKS[i].value;
    return 0;
  }
  /** 一张牌在吹牛规则下的点数 */
  function bsValue(c) { return c ? rankValue(c.rank) : 0; }

  /** 保皇 / 斗地主体系的点数换算 ---------------- */
  // 3<4<...<A<2<小王<大王
  function bhValue(c) {
    if (!c) return -1;
    if (c.rank === 'BJ') return 16;
    if (c.rank === 'RJ') return 17;
    if (c.rank === '2') return 15;
    return c.value;
  }

  /** 保皇手牌排序：点数从大到小，同点数按花色顺序 */
  function sortBH(hand) {
    return hand.slice().sort(function (a, b) {
      return (bhValue(b) - bhValue(a)) || (b.suitOrder - a.suitOrder);
    });
  }

  /** 五张牌/梭哈排序：A 最大 */
  function sortPoker(hand) {
    return hand.slice().sort(function (a, b) {
      return (b.value - a.value) || (b.suitOrder - a.suitOrder);
    });
  }

  /** 按点数分组：{ rank: [card,...] } */
  function groupByRank(cards) {
    var m = {};
    for (var i = 0; i < cards.length; i++) {
      var r = cards[i].rank;
      (m[r] = m[r] || []).push(cards[i]);
    }
    return m;
  }

  /** 统计每个点数出现次数：{ rank: count } */
  function countByRank(cards) {
    var m = {};
    for (var i = 0; i < cards.length; i++) {
      var r = cards[i].rank;
      m[r] = (m[r] || 0) + 1;
    }
    return m;
  }

  /** 是否连续（升序数组） */
  function isConsecutive(vals) {
    for (var i = 1; i < vals.length; i++) {
      if (vals[i] !== vals[i - 1] + 1) return false;
    }
    return true;
  }

  return {
    SUITS: SUITS, RANKS: RANKS, BS_RANKS: BS_RANKS,
    createShoe: createShoe, shuffle: shuffle, takeByIds: takeByIds,
    rankValue: rankValue, bsValue: bsValue,
    bhValue: bhValue, sortBH: sortBH, sortPoker: sortPoker,
    groupByRank: groupByRank, countByRank: countByRank, isConsecutive: isConsecutive
  };
});
