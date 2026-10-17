/* 升级（拖拉机）—— 前端渲染 */
window.CPGames = window.CPGames || {};
window.CPGames.shengji = (function () {
  'use strict';
  var sel = {};
  var SUITS = [{ k: 'S', t: '♠' }, { k: 'H', t: '♥' }, { k: 'D', t: '♦' }, { k: 'C', t: '♣' }];

  function render(root, snap, api) {
    var v = snap.view || {};
    if (!v.stage || v.stage === 'idle') {
      root.innerHTML = '<div class="notice">等待房主点击「开始游戏」…（升级固定 4 人）</div>';
      return;
    }
    var h = '';
    var ctx = { level: v.level, trumpSuit: v.trumpSuit };
    var iAmBanker = v.me && v.bankerSeat === v.me.seat;

    // 顶部状态
    h += '<div class="panel"><div class="row">' +
      '<div>打 <b class="big-num">' + v.level + '</b></div>' +
      '<div>主花色 <b class="gold">' + (v.trumpSuit ? (SUITS.filter(function (s) { return s.k === v.trumpSuit; })[0] || {}).t : '待定') + '</b></div>' +
      '<div class="dim">庄家：' + UI.esc(nameBySeat(v, v.bankerSeat)) + '</div>' +
      '<div class="dim">底牌 ' + v.bottomScore + ' 分</div>' +
      '</div>' +
      '<div class="row" style="margin-top:6px">' +
      '<span class="badge">庄家方(0/2座) 打 ' + v.levels[0] + '</span>' +
      '<span class="badge">闲家方(1/3座) 打 ' + v.levels[1] + '</span>' +
      '<span class="badge gold">闲家得分 ' + (v.teamScore ? v.teamScore[1 - (v.bankerSeat % 2)] : 0) + ' / 80</span>' +
      '</div></div>';

    // 选主
    if (v.stage === 'chooseTrump') {
      if (iAmBanker) {
        h += '<div class="panel"><h3>你是庄家，请选择主花色</h3><div class="pick">';
        SUITS.forEach(function (s) {
          h += '<button class="btn" data-suit="' + s.k + '" style="font-size:20px">' + s.t + '</button>';
        });
        h += '</div></div>';
      } else {
        h += '<div class="notice center">等待庄家选主花色…</div>';
      }
    }

    // 扣底牌
    if (v.stage === 'discard') {
      if (iAmBanker) {
        h += '<div class="panel"><h3>请扣下 8 张底牌（也可点「自动扣牌」）</h3>' +
          '<div class="acts"><button class="btn primary" data-act="discard">确定（已选 ' + Object.keys(sel).length + '）</button>' +
          '<button class="btn" data-act="autoDiscard">自动扣牌</button>' +
          '<button class="btn" data-act="clear">取消选择</button></div></div>';
      } else {
        h += '<div class="notice center">等待庄家扣底牌…</div>';
      }
    }

    // 出牌中
    if (v.stage === 'play' || v.stage === 'ended') {
      h += '<div class="panel"><h3>座位</h3><div class="row">';
      (v.players || []).forEach(function (p) {
        var turn = (v.turnId === p.id && v.stage === 'play');
        h += '<div class="pchip ' + (turn ? 'turn' : '') + (p.id === api.meId ? ' me' : '') + '">' +
          '<span class="dot"></span>' + UI.esc(p.name) +
          '<span class="tag">' + p.seat + '号·' + (p.team === 0 ? 'A队' : 'B队') + '</span>' +
          (p.isBanker ? '<span class="tag">庄</span>' : '') +
          '<span class="tag">' + p.handCount + ' 张</span>' +
          '</div>';
      });
      h += '</div>';

      // 本轮已出的牌
      if (v.trick && v.trick.length) {
        h += '<div style="margin-top:10px"><div class="dim" style="font-size:12px">本轮已出（需 ' + v.leadSize + ' 张）</div>';
        v.trick.forEach(function (t) {
          h += '<div style="margin-top:4px"><span class="dim">' + UI.esc(t.name) + '：</span>' +
            '<span class="badge">' + UI.esc(t.label) + '</span> ' +
            t.cards.map(function (c) { return UI.cardHTML(c, { size: 'xs', click: false }); }).join('') + '</div>';
        });
        h += '</div>';
      } else {
        h += '<div style="margin-top:8px" class="dim">新一轮，' + UI.esc(nameOf(v, v.turnId)) + ' 自由领出</div>';
      }
      h += '</div>';
    }

    // 上一轮
    if (v.lastTrick && v.stage === 'play') {
      h += '<div class="panel"><h3>上一轮 · ' + UI.esc(v.lastTrick.winnerName) + ' 拿下 ' + v.lastTrick.gained + ' 分</h3>';
      v.lastTrick.plays.forEach(function (p) {
        h += '<div style="margin-bottom:4px"><span class="dim">' + UI.esc(p.name) + '：</span>' +
          p.cards.map(function (c) { return UI.cardHTML(c, { size: 'xs', click: false }); }).join('') + '</div>';
      });
      h += '</div>';
    }

    // 结算
    if (v.result) {
      var r = v.result;
      h += '<div class="result-box"><h3 style="margin:0 0 8px">' +
        (r.champion ? ('🎉 ' + (r.championTeam === 0 ? '庄家方（0/2座）' : '闲家方（1/3座）') + '通关！') :
          (r.winnerIsBanker ? '庄家方胜' : '闲家方胜') + '，升 ' + r.up + ' 级') + '</h3>' +
        '<div class="row"><span class="badge">闲家得分 ' + r.defenderScore + '</span>' +
        (r.bottomExtra ? '<span class="badge gold">抠底 +' + r.bottomExtra + '</span>' : '') +
        '<span class="badge">庄家方 ' + r.teamScore[r.bankerTeam] + ' 分</span>' +
        '<span class="badge">闲家方 ' + r.teamScore[1 - r.bankerTeam] + ' 分</span></div>' +
        '<div style="margin-top:8px" class="dim">当前级数：庄家方打 ' + r.levels[0] + ' · 闲家方打 ' + r.levels[1] +
        ' · 下局庄家：' + r.newBankerSeat + ' 号座</div>';
      if (r.bottom && r.bottom.length) {
        h += '<div style="margin-top:8px"><div class="dim" style="font-size:12px">底牌</div><div class="cards-row">' +
          r.bottom.map(function (c) { return UI.cardHTML(c, { size: 'xs', click: false }); }).join('') + '</div></div>';
      }
      h += '</div>';
    } else if (v.stage === 'play') {
      h += '<div class="notice center">' +
        (v.turnId === api.meId ? '<b class="gold">轮到你出牌</b>' : '等待 ' + UI.esc(nameOf(v, v.turnId)) + ' 出牌…') + '</div>';
    }

    // 我的手牌
    if (v.stage === 'play' || v.stage === 'discard') {
      var hand = v.myHand || [];
      h += '<div class="panel"><h3>我的手牌（' + hand.length + ' 张）</h3>';
      h += '<div class="hand-wrap" data-scroll>';
      hand.forEach(function (c) { h += UI.cardHTML(c, { size: 'sm', selected: !!sel[c.id] }); });
      h += '</div>';
      if (v.stage === 'play' && v.turnId === api.meId) {
        h += '<div class="acts"><button class="btn primary" data-act="play">出牌</button>' +
          '<button class="btn" data-act="clear">取消选择</button></div>';
      }
      h += '</div>';
    }

    root.innerHTML = h;

    root.querySelectorAll('.hand-wrap .card').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-id');
        if (sel[id]) delete sel[id]; else sel[id] = 1;
        el.classList.toggle('sel');
        var b = root.querySelector('[data-act="discard"]');
        if (b) b.textContent = '确定（已选 ' + Object.keys(sel).length + '）';
      });
    });
    root.querySelectorAll('[data-suit]').forEach(function (b) {
      b.addEventListener('click', function () { api.send({ type: 'chooseTrump', suit: b.getAttribute('data-suit') }); });
    });
    root.querySelectorAll('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-act');
        var hand = v.myHand || [];
        var ids = hand.map(function (c) { return c.id; }).filter(function (id) { return sel[id]; });
        if (a === 'play' || a === 'discard') {
          if (!ids.length) return UI.toast('请先选牌');
          if (a === 'discard' && ids.length !== 8) return UI.toast('请选择 8 张底牌');
          if (a === 'play') {
            // 本地先校验一次，给即时反馈
            var cards = hand.filter(function (c) { return sel[c.id]; });
            var lead = (v.trick && v.trick.length) ? v.trick[0] : null;
            if (!lead) {
              var cb = Shengji.analyze(cards, ctx);
              if (!cb) return UI.toast('牌型不合法：必须全是主牌或同一门副牌');
              if (cb.kind === 'throw' && !v.opts.allowThrow) return UI.toast('本房间未开启甩牌');
            } else {
              var fc = Shengji.followCheck(hand, cards, { size: v.leadSize, group: leadGroup(lead, ctx) }, ctx);
              if (!fc.ok) return UI.toast(fc.msg);
            }
          }
          sel = {};
          api.send({ type: a, cardIds: ids });
        } else if (a === 'autoDiscard') { sel = {}; api.send({ type: 'discard', auto: true }); }
        else if (a === 'clear') { sel = {}; api.reRender(); }
        else api.send({ type: a });
      });
    });
  }

  function leadGroup(lead, ctx) {
    if (!lead || !lead.cards || !lead.cards.length) return 'T';
    return Shengji.groupOf(lead.cards[0], ctx);
  }
  function nameOf(v, id) {
    var p = (v.players || []).filter(function (x) { return x.id === id; })[0];
    return p ? p.name : '?';
  }
  function nameBySeat(v, seat) {
    var p = (v.players || []).filter(function (x) { return x.seat === seat; })[0];
    return p ? p.name : '?';
  }

  return { render: render };
})();
