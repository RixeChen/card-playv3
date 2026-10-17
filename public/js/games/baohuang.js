/* 保皇 —— 前端渲染 */
window.CPGames = window.CPGames || {};
window.CPGames.baohuang = (function () {
  'use strict';
  var sel = {};
  var pickSolo = true;
  var pickKey = 'BJ';

  function render(root, snap, api) {
    var v = snap.view || {};
    if (!v.stage || v.stage === 'idle') {
      root.innerHTML = '<div class="notice">等待房主点击「开始游戏」…（保皇需要 4~5 人）</div>';
      return;
    }
    var h = '';

    // 身份信息
    h += '<div class="panel"><div class="row">' +
      '<div>皇帝 <b class="gold">' + UI.esc(nameOf(v, v.emperorId)) + '</b>' + (v.iAmEmperor ? ' <span class="badge gold">是我</span>' : '') + '</div>' +
      '<div>保子 ' + (v.guardId ? '<b class="gold">' + UI.esc(nameOf(v, v.guardId)) + '</b>' :
        (v.solo ? '<span class="dim">独保，无保子</span>' : '<span class="dim">暗保，身份保密</span>')) + '</div>' +
      '<div class="dim">' + (v.solo ? '独保（1 打 ' + (v.players.length - 1) + '）' : '叫保：' + UI.esc(v.guardCardName || '') + (v.guardOpen ? ' · 明保' : ' · 暗保')) + '</div>' +
      '</div></div>';

    // 皇帝决策
    if (v.stage === 'choose') {
      if (v.iAmEmperor) {
        h += '<div class="panel"><h3>你是皇帝，请选择</h3>' +
          '<div class="pick"><button class="btn ' + (pickSolo ? 'on' : '') + '" data-pick="solo">独保（1 打 ' + (v.players.length - 1) + '）</button>' +
          '<button class="btn ' + (!pickSolo ? 'on' : '') + '" data-pick="guard">叫保（2 打 ' + (v.players.length - 2) + '）</button></div>';
        if (!pickSolo) {
          h += '<div style="margin-top:10px" class="dim">选择保子牌：</div><div class="pick" style="margin-top:6px">';
          (v.guardChoices || []).forEach(function (g) {
            h += '<button class="btn ' + (pickKey === g.key ? 'on' : '') + '" data-key="' + g.key + '">' + UI.esc(g.label) + '</button>';
          });
          h += '</div>';
        }
        h += '<div class="acts"><button class="btn primary" data-act="confirmEmperor">确定</button></div></div>';
      } else {
        h += '<div class="notice center">等待皇帝决定「独保」还是「叫保」…</div>';
      }
    }

    // 保子决策
    if (v.stage === 'guardChoose') {
      if (v.iAmGuard) {
        h += '<div class="panel"><h3>你是保子（持有「' + UI.esc(v.guardCardName) + '」）</h3>' +
          '<div class="acts"><button class="btn primary" data-act="guardOpen">明保（身份公开，分数翻倍）</button>' +
          '<button class="btn" data-act="guardHide">暗保（身份保密）</button></div></div>';
      } else {
        h += '<div class="notice center">等待保子决定「明保 / 暗保」…</div>';
      }
    }

    // 出牌中
    if (v.stage === 'play') {
      h += '<div class="panel"><h3>牌桌</h3><div class="row">';
      v.players.forEach(function (p) {
        var turn = (v.turnId === p.id);
        h += '<div class="pchip ' + (turn ? 'turn' : '') + (p.id === api.meId ? ' me' : '') + '">' +
          '<span class="dot"></span>' + UI.esc(p.name) +
          (p.isEmperor ? '<span class="tag">皇帝</span>' : '') +
          (p.isGuard ? '<span class="tag">保子</span>' : '') +
          '<span class="tag">' + p.handCount + ' 张</span>' +
          (p.finished ? '<span class="tag">第' + p.rank + '名</span>' : '') +
          '</div>';
      });
      h += '</div>';
      h += '<div style="margin-top:8px">' + (v.lastCombo
        ? '上一手：<b>' + UI.esc(nameOf(v, v.lastCombo.playerId)) + '</b> 出 <b class="gold">' + UI.esc(v.lastCombo.label) + '</b>'
        : '<span class="dim">新一轮，自由出牌</span>') + '</div>';
      h += '</div>';
    }

    // 结算
    if (v.result) {
      h += '<div class="result-box"><h3 style="margin:0 0 8px">' +
        (v.result.royalWin ? '保皇派获胜' : '革命派获胜') + '（基础分 ' + v.result.base + '）</h3><table>';
      h += '<tr><th>名次</th><th>玩家</th><th>身份</th><th>剩余</th><th>得分</th></tr>';
      v.result.ranking.forEach(function (r) {
        var role = '';
        if (r.id === v.result.emperorId) role = '皇帝';
        else if (r.id === v.result.guardId) role = '保子';
        else role = '革命派';
        h += '<tr><td>第 ' + r.rank + ' 名</td><td>' + UI.esc(r.name) + '</td><td>' + role + '</td><td>' + r.left + '</td>' +
          '<td class="gold">' + (r.delta > 0 ? '+' : '') + r.delta + '</td></tr>';
      });
      h += '</table></div>';
    } else if (v.stage === 'play') {
      h += '<div class="notice center">' +
        (v.turnId === api.meId ? '<b class="gold">轮到你出牌</b>' : '等待 ' + UI.esc(nameOf(v, v.turnId)) + ' 出牌…') + '</div>';
    }

    // 我的手牌
    if (v.stage === 'play') {
      var hand = v.myHand || [];
      h += '<div class="panel"><h3>我的手牌（' + hand.length + ' 张）</h3>';
      h += '<div class="hand-wrap" data-scroll>';
      hand.forEach(function (c) { h += UI.cardHTML(c, { size: 'sm', selected: !!sel[c.id] }); });
      h += '</div>';
      if (v.turnId === api.meId) {
        h += '<div class="acts">' +
          '<button class="btn primary" data-act="play">出牌</button>' +
          (v.canPass ? '<button class="btn" data-act="pass">过</button>' : '') +
          '<button class="btn" data-act="hint">提示</button>' +
          '<button class="btn" data-act="clear">取消选择</button>' +
          '</div>';
      }
      h += '</div>';
    }

    root.innerHTML = h;

    root.querySelectorAll('[data-pick]').forEach(function (b) {
      b.addEventListener('click', function () {
        pickSolo = b.getAttribute('data-pick') === 'solo';
        api.reRender();
      });
    });
    root.querySelectorAll('[data-key]').forEach(function (b) {
      b.addEventListener('click', function () { pickKey = b.getAttribute('data-key'); api.reRender(); });
    });
    root.querySelectorAll('.hand-wrap .card').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-id');
        if (sel[id]) delete sel[id]; else sel[id] = 1;
        el.classList.toggle('sel');
      });
    });
    root.querySelectorAll('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-act');
        var hand = v.myHand || [];
        if (a === 'play') {
          var ids = hand.map(function (c) { return c.id; }).filter(function (id) { return sel[id]; });
          if (!ids.length) return UI.toast('请先选牌');
          var cards = hand.filter(function (c) { return sel[c.id]; });
          var combo = Combos.analyze(cards);
          if (!combo) return UI.toast('牌型不合法');
          if (v.lastComboRaw && !v.mustLead && !Combos.beats(combo, v.lastComboRaw)) {
            return UI.toast('压不过上家的 ' + v.lastCombo.label);
          }
          sel = {};
          api.send({ type: 'play', cardIds: ids });
        } else if (a === 'clear') { sel = {}; api.reRender(); }
        else if (a === 'hint') {
          var beat = null;
          if (v.lastComboRaw && !v.mustLead) {
            beat = Combos.findBeat(hand, v.lastComboRaw);
          } else {
            beat = hand.length ? [hand[hand.length - 1]] : null;
          }
          if (!beat) return UI.toast('没有能压过的牌，建议「过」');
          sel = {};
          beat.forEach(function (c) { sel[c.id] = 1; });
          api.reRender();
        } else if (a === 'confirmEmperor') {
          api.send({ type: 'choose', solo: pickSolo, guardKey: pickKey });
        } else if (a === 'guardOpen') { api.send({ type: 'choose', open: true }); }
        else if (a === 'guardHide') { api.send({ type: 'choose', open: false }); }
        else api.send({ type: a });
      });
    });
  }

  function nameOf(v, id) {
    var p = (v.players || []).filter(function (x) { return x.id === id; })[0];
    return p ? p.name : '?';
  }

  return { render: render };
})();
