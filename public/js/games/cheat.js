/* 唬牌（吹牛）—— 前端渲染 */
window.CPGames = window.CPGames || {};
window.CPGames.cheat = (function () {
  'use strict';
  var sel = {};        // 我选中的牌
  var timer = null;

  function rankLabel(r) { return r === 'BJ' ? '小王' : (r === 'RJ' ? '大王' : r); }

  function render(root, snap, api) {
    var v = snap.view || {};
    if (!v.stage || v.stage === 'idle') {
      root.innerHTML = '<div class="notice">等待房主点击「开始游戏」…</div>';
      return;
    }
    var h = '';
    var me = (v.players || []).filter(function (p) { return p.id === v.meId; })[0];

    /* ---------- 顶部：本圈状态 ---------- */
    h += '<div class="panel"><div class="row">' +
      '<div>本圈牌堆 <b class="big-num">' + v.pileCount + '</b> 张</div>';
    if (v.lastPlay) {
      h += '<div>当前喊牌：<b class="gold">' + UI.esc(nameOf(v, v.lastPlay.playerId)) + ' 喊「' +
        UI.esc(v.lastPlay.label) + '」</b></div>';
    } else {
      h += '<div class="dim">本圈还没有人喊牌</div>';
    }
    h += '</div></div>';

    /* ---------- 出完手牌的质疑窗口 ---------- */
    if (v.stage === 'challenge' && v.winPendingId) {
      var left = (v.challengeDeadline || 0) - snap.serverTime;
      h += '<div class="notice"><b>' + UI.esc(nameOf(v, v.winPendingId)) + '</b> 出完了所有手牌！' +
        '<div class="timer" id="cd">质疑倒计时 ' + UI.fmtTime(left) + '</div>';
      if (v.canChallenge) {
        h += '<div class="acts"><button class="btn danger" data-act="challenge">唬！我不信</button></div>';
      } else {
        h += '<div class="dim" style="margin-top:6px">等待其他玩家质疑…</div>';
      }
      h += '</div>';
    } else if (v.lastPlay) {
      /* ---------- 非当前回合玩家也能质疑 ---------- */
      if (v.canChallenge && !v.myTurn) {
        h += '<div class="notice"><div>' + UI.esc(nameOf(v, v.lastPlay.playerId)) +
          ' 喊的是真的吗？任何人都可以质疑。</div>' +
          '<div class="acts"><button class="btn danger" data-act="challenge">唬！我不信</button></div></div>';
      }
    }

    /* ---------- 轮到谁 ---------- */
    if (v.stage === 'play') {
      h += '<div class="notice center">' +
        (v.myTurn
          ? (v.mustLead ? '<b class="gold">轮到你：扣下至少 1 张牌并喊出牌型</b>' : '<b class="gold">轮到你响应</b>')
          : '等待 ' + UI.esc(nameOf(v, v.turnPlayerId)) + ' 行动…' +
            (v.turnDeadline ? '（<span id="td">' + UI.fmtTime(v.turnDeadline - snap.serverTime) + '</span> 后自动放弃）' : '')) +
        '</div>';
    }

    /* ---------- 翻牌结果 ---------- */
    if (v.reveal) {
      var rv = v.reveal;
      h += '<div class="result-box"><h3 style="margin:0 0 6px">掀牌结果</h3>' +
        '<div>' + UI.esc(nameOf(v, rv.byPlayer)) + ' 喊的是「' + UI.esc(rankLabel(rv.declared)) + '」，实际打出：</div>' +
        '<div class="cards-row">' + rv.cards.map(function (c) { return UI.cardHTML(c, { size: 'xs', click: false }); }).join('') + '</div>' +
        '<div style="margin-top:6px">' + (rv.fake
          ? '<b style="color:#e2564d">是假的！</b>' + UI.esc(nameOf(v, rv.loserId)) + ' 质疑成功'
          : '<b style="color:#4fb477">是真的！</b>' + UI.esc(nameOf(v, rv.loserId)) + ' 质疑失败') +
        '</div>' +
        '<div style="margin-top:4px">' + UI.esc(nameOf(v, rv.cardTakerId)) + ' 收走本圈 ' + rv.taken + ' 张牌；' +
        UI.esc(nameOf(v, rv.winnerId)) + ' 获得出牌权</div></div>';
    }

    /* ---------- 玩家列表 ---------- */
    h += '<div class="panel"><h3>牌桌</h3><div class="row">';
    (v.players || []).forEach(function (p) {
      var cls = ['pchip'];
      if (v.turnPlayerId === p.id && v.stage === 'play') cls.push('turn');
      if (p.id === v.meId) cls.push('me');
      h += '<div class="' + cls.join(' ') + '"><span class="dot"></span>' + UI.esc(p.name) +
        '<span class="tag">' + p.handCount + ' 张</span>' +
        (p.passed ? '<span class="tag">已放弃</span>' : '') +
        (v.winPendingId === p.id ? '<span class="tag">已出完</span>' : '') + '</div>';
    });
    h += '</div></div>';

    /* ---------- 结算 ---------- */
    if (v.result) {
      h += '<div class="result-box"><h3 style="margin:0 0 4px">🏆 ' + UI.esc(v.result.winnerName) + ' 获胜</h3>' +
        '<div class="center" style="margin-bottom:8px">通吃 <b class="gold">' + v.result.total + '</b> 分</div><table>';
      h += '<tr><th>名次</th><th>玩家</th><th>剩余</th><th>剩余分</th><th>本局分</th></tr>';
      v.result.ranking.forEach(function (r, i) {
        h += '<tr><td>第 ' + (i + 1) + ' 名</td><td>' + UI.esc(r.name) + (r.id === v.meId ? ' <span class="badge">我</span>' : '') + '</td>' +
          '<td>' + r.left + ' 张</td><td>' + r.leftScore + '</td>' +
          '<td class="gold">' + (r.score > 0 ? '+' : '') + r.score + '</td></tr>';
      });
      h += '</table></div>';
    }

    /* ---------- 我的手牌 + 操作 ---------- */
    var hand = v.myHand || [];
    h += '<div class="panel"><h3>我的手牌（' + hand.length + ' 张）</h3>';
    h += '<div class="hand-wrap" data-scroll>';
    hand.forEach(function (c) { h += UI.cardHTML(c, { size: 'sm', selected: !!sel[c.id] }); });
    h += '</div>';

    if (v.stage === 'play' && v.myTurn) {
      var picked = hand.filter(function (c) { return sel[c.id]; });
      // 点数下拉框
      var ranks = (window.Cards.BS_RANKS || []).slice();
      if (v.opts && v.opts.useJokers) ranks = ranks.concat(['BJ', 'RJ']);
      h += '<div class="row" style="margin-top:10px">' +
        '<span class="dim">喊出的点数：</span>' +
        '<select id="rankSel" class="inp">' + ranks.map(function (r) {
          return '<option value="' + r + '">' + UI.esc(rankLabel(r)) + '</option>';
        }).join('') + '</select>' +
        '<span id="claimPreview" class="dim"></span></div>';
      h += '<div class="acts">' +
        '<button class="btn primary" data-act="play">' + (v.mustLead ? '出牌并喊牌' : '跟牌') + '</button>' +
        (v.canPass ? '<button class="btn" data-act="pass">放弃</button>' : '') +
        (v.canChallenge ? '<button class="btn danger" data-act="challenge">质疑上家</button>' : '') +
        '<button class="btn" data-act="clear">取消选择</button>' +
        '</div>';
    }
    h += '</div>';

    root.innerHTML = h;

    /* ---------- 倒计时 ---------- */
    if (timer) { clearInterval(timer); timer = null; }
    if (v.stage === 'challenge' && v.challengeDeadline) {
      var cd = root.querySelector('#cd'), dl = v.challengeDeadline;
      timer = setInterval(function () {
        if (!cd) { clearInterval(timer); return; }
        var l = dl - (Date.now() + window.__serverOffset);
        cd.textContent = l <= 0 ? '等待结算…' : ('质疑倒计时 ' + UI.fmtTime(l));
      }, 250);
    } else if (v.stage === 'play' && v.turnDeadline) {
      var td = root.querySelector('#td'), dl2 = v.turnDeadline;
      if (td) timer = setInterval(function () {
        var l = dl2 - (Date.now() + window.__serverOffset);
        td.textContent = l <= 0 ? '即将自动放弃' : UI.fmtTime(l);
      }, 250);
    }

    /* ---------- 事件 ---------- */
    root.querySelectorAll('.hand-wrap .card').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-id');
        if (sel[id]) delete sel[id]; else sel[id] = 1;
        el.classList.toggle('sel');
        updatePreview(root, v, hand);
      });
    });

    var rankSel = root.querySelector('#rankSel');
    if (rankSel) rankSel.addEventListener('change', function () { updatePreview(root, v, hand); });

    root.querySelectorAll('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-act');
        var picked2 = hand.filter(function (c) { return sel[c.id]; });
        if (a === 'play') {
          if (!picked2.length) return UI.toast('请先选牌（至少 1 张）');
          var rank = rankSel ? rankSel.value : null;
          if (!rank) return UI.toast('请选择喊出的点数');
          if (!v.mustLead && v.lastPlay) {
            // 相同点数 → 张数不限；不同点数 → 张数更多，或同张数点数更大
            var sameRank = Cards.rankValue(rank) === Cards.rankValue(v.lastPlay.rank);
            var ok2 = sameRank || (picked2.length > v.lastPlay.count) ||
              (picked2.length === v.lastPlay.count && Cards.rankValue(rank) > Cards.rankValue(v.lastPlay.rank));
            if (!ok2) {
              return UI.toast('压不过上家的「' + v.lastPlay.label + '」：相同点数张数不限，其他情况需张数更多或同张数点数更大');
            }
          }
          sel = {};
          api.send({ type: 'play', cardIds: picked2.map(function (c) { return c.id; }), rank: rank });
        } else if (a === 'clear') { sel = {}; api.reRender(); }
        else api.send({ type: a });
      });
    });

    updatePreview(root, v, hand);
  }

  /** 实时预览「将喊出：三张 7 ✓/✗」 */
  function updatePreview(root, v, hand) {
    var el = root.querySelector('#claimPreview');
    if (!el) return;
    var picked = hand.filter(function (c) { return sel[c.id]; });
    var rankSel = root.querySelector('#rankSel');
    if (!picked.length || !rankSel) { el.textContent = ''; el.className = 'dim'; return; }
    var rank = rankSel.value;
    var n = picked.length;
    var txt = '将喊出：' + (Cards.rankValue(rank) >= 15 ? '一张' : n + '张') + rankLabel(rank);
    if (!v.mustLead && v.lastPlay) {
      // 相同点数 → 张数不限；否则需张数更多或同张数点数更大
      var sameRank = Cards.rankValue(rank) === Cards.rankValue(v.lastPlay.rank);
      var ok = sameRank || (n > v.lastPlay.count) ||
        (n === v.lastPlay.count && Cards.rankValue(rank) > Cards.rankValue(v.lastPlay.rank));
      txt += ok ? ' ✓ 可以压过' : ' ✗ 压不过「' + v.lastPlay.label + '」';
      el.className = ok ? 'gold' : 'dim';
    } else {
      el.className = 'gold';
    }
    el.textContent = txt;
  }

  function nameOf(v, id) {
    var p = (v.players || []).filter(function (x) { return x.id === id; })[0];
    return p ? p.name : '?';
  }

  return { render: render };
})();
