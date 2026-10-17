/* 主流程：首页 → 房间；房间状态全靠服务端推送的 snapshot 渲染 */
(function () {
  'use strict';

  var S = {
    name: '', gameId: 'stud5', roomId: null, playerId: null,
    snap: null, catalog: [], showSettings: false
  };

  var $ = function (id) { return document.getElementById(id); };

  /* ---------------- 初始化 ---------------- */
  function boot() {
    S.name = localStorage.getItem('cp_name') || '';
    $('nameInput').value = S.name;

    fetch('/api/games').then(function (r) { return r.json(); }).then(function (list) {
      S.catalog = list;
      S.gameId = list[0] ? list[0].id : 'stud5';
      renderPicker();
    }).catch(function () {
      S.catalog = [{ id: 'stud5', name: '港式五张牌', min: 2, max: 8 }];
      renderPicker();
    });

    // 支持通过 /ABCD 这种邀请链接直接进入；刷新页面时自动回到原座位
    var m = location.pathname.match(/^\/([A-Z0-9]{4})$/i);
    if (m) {
      var rid = m[1].toUpperCase();
      $('roomInput').value = rid;
      var seat = localStorage.getItem('cp_seat_' + rid);
      var nm = localStorage.getItem('cp_name') || '';
      if (seat && nm) {
        Net.init();
        bindNet();
        Net.call('joinRoom', { roomId: rid, playerId: seat, name: nm }).then(function (r) {
          if (r.ok) { S.roomId = r.roomId; S.playerId = r.playerId; S.name = nm; enterRoom(); }
          else { localStorage.removeItem('cp_seat_' + rid); }
        });
        return;
      }
    }

    Net.init();
    bindNet();

    $('btnCreate').addEventListener('click', doCreate);
    $('btnJoin').addEventListener('click', doJoin);
    $('btnLeave').addEventListener('click', doLeave);
    $('btnCopy').addEventListener('click', copyInvite);
    $('btnRules').addEventListener('click', showRules);
  }

  /** 注册网络事件：状态推送、断线重连、房间关闭 */
  function bindNet() {
    Net.on('connect', function () {
      // 断线重连：如果之前在房间里，自动重新入座
      if (S.roomId && S.playerId) {
        Net.call('joinRoom', { roomId: S.roomId, playerId: S.playerId, name: S.name })
          .then(function (r) { if (!r.ok) UI.toast(r.error || '重连失败'); });
      }
    });
    Net.on('state', function (snap) {
      S.snap = snap;
      window.__serverOffset = snap.serverTime - Date.now();
      S.roomId = snap.room.roomId;
      renderRoom();
    });
    Net.on('roomClosed', function (d) {
      alert(d.reason || '房间已关闭');
      goHome();
    });
  }

  function renderPicker() {
    var box = $('gamePicker');
    box.innerHTML = S.catalog.map(function (g) {
      return '<div class="game-opt' + (g.id === S.gameId ? ' on' : '') + '" data-g="' + g.id + '">' +
        UI.esc(g.name) + '<small>' + g.min + '–' + g.max + ' 人</small></div>';
    }).join('');
    box.querySelectorAll('[data-g]').forEach(function (el) {
      el.addEventListener('click', function () {
        S.gameId = el.getAttribute('data-g');
        renderPicker();
      });
    });
  }

  /* ---------------- 首页动作 ---------------- */
  function doCreate() {
    S.name = ($('nameInput').value || '房主').trim().slice(0, 12);
    localStorage.setItem('cp_name', S.name);
    $('homeErr').textContent = '';
    Net.call('createRoom', { gameId: S.gameId, name: S.name }).then(function (r) {
      if (!r.ok) { $('homeErr').textContent = r.error || '创建失败'; return; }
      S.roomId = r.roomId; S.playerId = r.playerId;
      saveSeat(); enterRoom();
    });
  }

  function doJoin() {
    var raw = ($('roomInput').value || '').trim();
    var rid = extractRoomId(raw);
    if (!rid) { $('homeErr').textContent = '请输入 4 位房间号，或粘贴邀请链接'; return; }
    S.name = ($('nameInput').value || '玩家').trim().slice(0, 12);
    localStorage.setItem('cp_name', S.name);
    $('homeErr').textContent = '';
    var saved = localStorage.getItem('cp_seat_' + rid);
    Net.call('joinRoom', { roomId: rid, name: S.name, playerId: saved || undefined }).then(function (r) {
      if (!r.ok) { $('homeErr').textContent = r.error || '加入失败'; return; }
      S.roomId = r.roomId; S.playerId = r.playerId;
      saveSeat(); enterRoom();
    });
  }

  function extractRoomId(raw) {
    var m = String(raw).match(/([A-Z0-9]{4})/i);
    return m ? m[1].toUpperCase() : '';
  }
  function saveSeat() { localStorage.setItem('cp_seat_' + S.roomId, S.playerId); }
  function enterRoom() {
    $('home').hidden = true;
    $('room').hidden = false;
    history.replaceState(null, '', '/' + S.roomId);
  }
  function goHome() {
    $('room').hidden = true;
    $('home').hidden = false;
    S.roomId = null; S.playerId = null; S.snap = null;
    history.replaceState(null, '', '/');
  }
  function doLeave() {
    Net.call('leaveRoom', { leaveSeat: true }).then(function () { goHome(); });
  }
  function copyInvite() {
    var url = location.origin + '/' + S.roomId;
    var txt = '来一起打牌！房间号：' + S.roomId + '\n' + url;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(function () { UI.toast('邀请链接已复制：' + url, true); },
        function () { prompt('复制下面的内容发给朋友：', txt); });
    } else prompt('复制下面的内容发给朋友：', txt);
  }
  function showRules() {
    var r = (S.snap && S.snap.room.rules) || [];
    alert((S.snap ? S.snap.room.gameName : '') + ' 规则：\n\n· ' + r.join('\n· '));
  }

  /* ---------------- 房间渲染 ---------------- */
  function renderRoom() {
    var snap = S.snap;
    if (!snap) return;
    var room = snap.room;
    $('roomIdText').textContent = room.roomId;
    $('gameNameText').textContent = room.gameName + '（' + room.players.length + '/' + room.maxPlayers + '）';

    // 玩家条
    $('playersBar').innerHTML = room.players.map(function (p) {
      var cls = ['pchip'];
      if (!p.connected) cls.push('off');
      if (p.isHost) cls.push('host');
      if (p.id === room.meId) cls.push('me');
      var kick = (room.hostId === room.meId && room.phase !== 'playing' && p.id !== room.meId)
        ? ' <span class="tag" data-kick="' + p.id + '" style="cursor:pointer;color:#e2564d">踢出</span>' : '';
      return '<div class="' + cls.join(' ') + '"><span class="dot"></span>' + UI.esc(p.name) +
        (p.isHost ? '<span class="tag">房主</span>' : '') +
        (p.connected ? '' : '<span class="tag">掉线</span>') + kick + '</div>';
    }).join('');
    $('playersBar').querySelectorAll('[data-kick]').forEach(function (el) {
      el.addEventListener('click', function () {
        if (confirm('确定把这位玩家移出房间？')) Net.call('kickPlayer', { playerId: el.getAttribute('data-kick') });
      });
    });

    // 日志
    var logs = (snap.view && snap.view.log) || [];
    $('logBox').innerHTML = logs.map(function (l) { return '<div>' + UI.esc(l) + '</div>'; }).join('');

    // 房主工具条
    var hb = '';
    var stage = snap.view && snap.view.stage;
    var over = (stage === 'ended' || stage === 'over');
    var ended = (over || stage === 'settle');
    if (room.hostId === room.meId) {
      if (room.phase === 'lobby') {
        if (over) {
          // 整场游戏结束（只剩一位有筹码）→ 重新开始
          hb += '<button class="btn primary" data-h="restart">重新开始</button>';
        } else {
          hb += '<button class="btn primary" data-h="start">' + (ended ? (room.nextLabel || '下一局') : '开始游戏') + '</button>';
        }
      }
      hb += '<button class="btn" data-h="settings">设置</button>';
      hb += '<button class="btn danger" data-h="dissolve">解散房间</button>';
    }
    hb += '<button class="btn ghost" data-h="refresh">刷新</button>';
    $('hostBar').innerHTML = hb;
    $('hostBar').querySelectorAll('[data-h]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-h');
        if (a === 'start') {
          Net.call(ended ? 'nextRound' : 'startGame', {}).then(function (r) { if (!r.ok) UI.toast(r.error || '操作失败'); });
        } else if (a === 'restart') {
          Net.call('gameAction', { action: { type: 'restart' } }).then(function (r) { if (!r.ok) UI.toast(r.error || '操作失败'); });
        } else if (a === 'dissolve') {
          if (confirm('解散后所有人都将被移出房间，确定吗？')) Net.call('dissolveRoom', {});
        } else if (a === 'settings') { S.showSettings = !S.showSettings; renderRoom(); }
        else { Net.call('joinRoom', { roomId: S.roomId, playerId: S.playerId, name: S.name }); }
      });
    });

    // 牌桌
    var api = {
      meId: room.meId,
      isHost: room.hostId === room.meId,
      send: function (action) {
        if (action && action.type === '__refresh') { renderRoom(); return; }
        Net.call('gameAction', { action: action }).then(function (r) {
          if (r && r.ok === false) UI.toast(r.error || '操作失败');
        });
      },
      start: function () { return Net.call('startGame', {}); },
      next: function () { return Net.call('nextRound', {}); },
      restart: function () { return Net.call('gameAction', { action: { type: 'restart' } }); },
      reRender: renderRoom
    };
    var tableEl = $('table');
    var prev = tableEl.querySelector('[data-scroll]');
    var sl = prev ? prev.scrollLeft : 0, st = prev ? prev.scrollTop : 0;

    var html = '';
    if (S.showSettings && room.hostId === room.meId) html += settingsHTML(room);
    var extra = document.createElement('div');
    extra.innerHTML = html;
    tableEl.innerHTML = '';
    if (html) tableEl.appendChild(extra);

    var gameBox = document.createElement('div');
    tableEl.appendChild(gameBox);
    var gr = window.CPGames[room.gameId];
    if (gr) gr.render(gameBox, snap, api);
    else gameBox.innerHTML = '<div class="notice">未找到该游戏的界面模块</div>';

    var now = tableEl.querySelector('[data-scroll]');
    if (now) { now.scrollLeft = sl; now.scrollTop = st; }

    if (S.showSettings) bindSettings(room);
  }

  function settingsHTML(room) {
    var fs = room.optionFields || [];
    if (!fs.length) return '<div class="panel"><h3>设置</h3><div class="dim">本游戏没有可调整的选项</div></div>';
    var h = '<div class="panel"><h3>房间设置（仅房主可改，牌局进行中不可改）</h3>';
    fs.forEach(function (f) {
      var cur = room.options[f.key];
      h += '<div style="margin-bottom:10px"><div class="dim" style="font-size:12px">' + UI.esc(f.label) + '</div>';
      if (f.type === 'bool') {
        h += '<div class="pick"><button class="btn ' + (cur ? 'on' : '') + '" data-opt="' + f.key + '" data-val="1">开</button>' +
          '<button class="btn ' + (!cur ? 'on' : '') + '" data-opt="' + f.key + '" data-val="0">关</button></div>';
      } else if (f.type === 'select') {
        h += '<div class="pick">' + f.options.map(function (o) {
          return '<button class="btn ' + (cur === o ? 'on' : '') + '" data-opt="' + f.key + '" data-val="' + UI.esc(o) + '">' + UI.esc(o) + '</button>';
        }).join('') + '</div>';
      } else {
        h += '<input class="inp" style="width:120px" type="number" data-opt="' + f.key + '" value="' + UI.esc(cur) + '">';
      }
      h += '</div>';
    });
    h += '<div class="acts"><button class="btn primary" data-opt-save="1">保存设置</button>' +
      '<button class="btn" data-opt-close="1">收起</button></div></div>';
    return h;
  }

  function bindSettings(room) {
    var el = $('table');
    // 只给「按钮型」选项绑定选中态。
    // 注意：选择器必须是 [data-val] 而不能是 [data-opt]——
    // 数字输入框也带 data-opt，一旦给它绑上 click，用户点输入框聚焦就会
    // 被写上 data-picked=""，保存时 Number("") = 0，导致数值型选项被清零。
    el.querySelectorAll('button[data-val]').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-opt');
        var v = b.getAttribute('data-val');
        el.querySelectorAll('button[data-opt="' + k + '"]').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        b.dataset.picked = v;
      });
    });
    var save = el.querySelector('[data-opt-save]');
    if (save) save.addEventListener('click', function () {
      var opts = {};
      (room.optionFields || []).forEach(function (f) {
        // 只认 button 上记录的选中值，避免把输入框误当成按钮
        var picked = el.querySelector('button[data-opt="' + f.key + '"][data-picked]');
        if (picked) {
          opts[f.key] = f.type === 'bool' ? (picked.dataset.picked === '1')
            : (f.type === 'select' ? picked.dataset.picked : Number(picked.dataset.picked));
          return;
        }
        var inp = el.querySelector('input[data-opt="' + f.key + '"]');
        if (inp) {
          var v = Number(inp.value);
          if (!isFinite(v)) v = room.options[f.key];
          if (f.min !== undefined) v = Math.max(f.min, v);
          if (f.max !== undefined) v = Math.min(f.max, v);
          opts[f.key] = v;
        }
      });
      Net.call('setOptions', { options: opts }).then(function (r) {
        if (!r.ok) UI.toast(r.error || '保存失败'); else { UI.toast('设置已保存', true); S.showSettings = false; }
      });
    });
    var close = el.querySelector('[data-opt-close]');
    if (close) close.addEventListener('click', function () { S.showSettings = false; renderRoom(); });
  }

  window.__renderRoom = renderRoom;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
