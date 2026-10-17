/* 港式五张牌 —— 前端渲染 */
window.CPGames = window.CPGames || {};
window.CPGames.stud5 = (function () {
  'use strict';
  var ROUND = ['一', '二', '三', '四'];

  function render(root, snap, api) {
    var v = snap.view || {};
    if (!v.stage || v.stage === 'idle') {
      root.innerHTML = '<div class="notice">等待房主点击「开始游戏」…</div>';
      return;
    }
    var h = '';

    h += '<div class="panel"><div class="row">' +
      '<div>第 <b class="gold">' + v.hand + '</b> 局</div>' +
      '<div>彩池 <b class="big-num">' + v.pot + '</b></div>' +
      '<div>本轮注额 <b>' + v.currentBet + '</b></div>' +
      '<div class="dim">第 ' + (ROUND[Math.min(v.dealStep, 3)] || '一') + ' 轮下注</div>' +
      '</div></div>';

    // 座位区
    h += '<div class="row" style="align-items:stretch">';
    v.players.forEach(function (p) {
      var isTurn = (v.turnPlayerId === p.id && v.stage === 'betting');
      h += '<div class="seat ' + (isTurn ? 'turn ' : '') + (p.folded ? 'fold ' : '') + '" style="flex:1 1 140px;min-width:132px">';
      h += '<div class="nm"><span>' + UI.esc(p.name) + (p.id === api.meId ? ' <span class="badge">我</span>' : '') +
        '</span><em class="gold">' + p.chips + '</em></div>';
      h += '<div class="cards-row">';
      p.hole.forEach(function (c) { h += UI.cardHTML(c, { size: 'xs', hidden: !!c.hidden, click: false }); });
      p.up.forEach(function (c) { h += UI.cardHTML(c, { size: 'xs', click: false }); });
      h += '</div>';
      h += '<div class="row" style="margin-top:6px">';
      h += '<span class="badge' + (p.folded ? ' red' : '') + '">' + (p.folded ? '已弃牌' : '下注 ' + p.roundBet) + '</span>';
      if (p.handName) h += '<span class="badge gold">' + UI.esc(p.handName) + '</span>';
      h += '</div></div>';
    });
    h += '</div>';

    // 结算
    if (v.result) {
      h += '<div class="result-box"><h3 style="margin:0 0 8px">第 ' + v.result.hand + ' 局结算</h3><table>';
      h += '<tr><th>玩家</th><th>牌</th><th>牌型</th><th>盈亏</th><th>筹码</th></tr>';
      v.result.players.forEach(function (p) {
        var cards = (p.cards || []).map(function (c) { return c.rank + (c.suitLabel || ''); }).join(' ');
        h += '<tr><td>' + UI.esc(p.name) + (p.folded ? ' <span class="dim">(弃牌)</span>' : '') + '</td>' +
          '<td class="dim">' + UI.esc(cards) + '</td><td>' + UI.esc(p.handName || '-') + '</td>' +
          '<td class="' + (p.delta > 0 ? 'gold' : 'dim') + '">' + (p.delta > 0 ? '+' : '') + p.delta + '</td>' +
          '<td>' + p.chips + '</td></tr>';
      });
      h += '</table>';

      // 「继续游戏」按钮：还有筹码的玩家 > 1 名时才需要；否则本场已自动结束
      if (v.stage === 'settle' && v.liveCount > 1) {
        h += '<div class="acts">' + (api.isHost
          ? '<button class="btn primary" data-act="continue">继续游戏（下一局）</button>'
          : '<button class="btn" disabled>等待房主点「继续游戏」…</button>') + '</div>';
      }
      h += '</div>';
    }

    // 我的操作区
    if (v.stage === 'betting') {
      if (v.myTurn) {
        h += '<div class="panel"><h3>轮到你了</h3><div class="acts">' +
          '<button class="btn danger" data-act="fold">弃牌</button>' +
          (v.canCheck
            ? '<button class="btn" data-act="call">让牌</button>'
            : '<button class="btn primary" data-act="call">跟注 ' + v.callAmount + '</button>') +
          (v.canRaise ? '<button class="btn" data-act="raise">加注 ' + v.opts.betUnit + '</button>' : '') +
          '<button class="btn" data-act="allin">全下 ' + (myChips(v) || 0) + '</button>' +
          '</div></div>';
      } else {
        h += '<div class="notice center">等待其他玩家行动…</div>';
      }
    } else if (v.stage === 'settle') {
      if (v.liveCount > 1) {
        h += '<div class="notice center">本局结束' + (api.isHost ? '，点「继续游戏」进入下一局' : '，等待房主继续') + '。</div>';
      } else {
        h += '<div class="notice center">只剩一位玩家还有筹码，本场游戏自动结束。</div>';
      }
    }

    // 整场结束界面
    if (v.stage === 'ended') {
      var champ = v.champion;
      h += '<div class="result-box"><h3 style="margin:0 0 4px">🏆 本场结束</h3>';
      h += '<div class="center" style="margin-bottom:8px">' +
        (champ ? '<b class="gold">' + UI.esc(champ.name) + '</b> 赢下全部筹码（' + champ.chips + '）！' : '所有人都输光了') +
        '</div><table>';
      h += '<tr><th>名次</th><th>玩家</th><th>剩余筹码</th></tr>';
      (v.finalRanking || []).forEach(function (p, i) {
        h += '<tr><td>第 ' + (i + 1) + ' 名</td><td>' + UI.esc(p.name) + (p.id === api.meId ? ' <span class="badge">我</span>' : '') + '</td>' +
          '<td class="gold">' + p.chips + '</td></tr>';
      });
      h += '</table><div class="acts">' + (api.isHost
        ? '<button class="btn primary" data-act="restart">重新开始（重置筹码）</button>'
        : '<button class="btn" disabled>等待房主点「重新开始」…</button>') + '</div></div>';
    }

    // 我的牌
    h += '<div class="panel"><h3>我的牌</h3><div class="cards-row">';
    (v.myCards || []).forEach(function (c) { h += UI.cardHTML(c, { size: 'sm', click: false }); });
    h += '</div></div>';

    root.innerHTML = h;

    root.querySelectorAll('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-act');
        if (a === 'continue') { api.next(); }
        else if (a === 'restart') { api.restart(); }
        else api.send({ type: a });
      });
    });
  }

  function myChips(v) {
    var me = (v.players || []).filter(function (p) { return p.id === v.meId; })[0];
    return me ? me.chips : 0;
  }

  return { render: render };
})();
