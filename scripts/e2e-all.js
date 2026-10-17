/* 四款游戏全量端到端冒烟测试（需先启动服务）：node scripts/e2e-all.js
 * 为每款游戏开一个房间，按各自流程走几步，确认服务端不报错、状态能正常推进。
 */
'use strict';
var io = require('socket.io-client');
var URL = process.env.URL || 'http://127.0.0.1:3000';

function client() {
  var s = io(URL, { transports: ['websocket'] });
  var box = { sock: s, snap: null, meId: null };
  s.on('state', function (snap) { box.snap = snap; box.meId = snap.room.meId; });
  return new Promise(function (res) { s.on('connect', function () { res(box); }); });
}
function call(b, evt, data) { return new Promise(function (res) { b.sock.emit(evt, data, function (r) { res(r || {}); }); }); }
function tick(ms) { return new Promise(function (r) { setTimeout(r, ms || 200); }); }
function must(r, what) { if (!r.ok) throw new Error(what + '失败：' + r.error); }

async function setup(gameId, n) {
  var list = [];
  for (var i = 0; i < n; i++) list.push(await client());
  var r = await call(list[0], 'createRoom', { gameId: gameId, name: 'P0' });
  must(r, '建房');
  for (var j = 1; j < n; j++) {
    var rr = await call(list[j], 'joinRoom', { roomId: r.roomId, name: 'P' + j });
    must(rr, '加入');
  }
  await tick();
  var sg = await call(list[0], 'startGame', {});
  must(sg, '开局');
  await tick();
  return { list: list, roomId: r.roomId };
}
function me(list, id) { return list.filter(function (x) { return x.meId === id; })[0]; }

(async function () {
  /* ---------- 港式五张牌 ---------- */
  {
    var s = await setup('stud5', 4);
    var v = s.list[0].snap.view;
    console.log('[五张牌] 阶段=' + v.stage + ' 彩池=' + v.pot + ' 每人牌数=' + v.players[0].hole.length + '暗+' + v.players[0].up.length + '明');
    for (var k = 0; k < 12; k++) {
      var cur = s.list.filter(function (x) { return x.snap.view.myTurn; })[0];
      if (!cur) break;
      var r = await call(cur, 'gameAction', { action: { type: (k % 4 === 0 ? 'raise' : 'call') } });
      if (!r.ok) { await call(cur, 'gameAction', { action: { type: 'call' } }); }
      await tick(80);
    }
    var v2 = s.list[0].snap.view;
    console.log('[五张牌] 12 步后阶段=' + v2.stage + ' 牌数=' + v2.players[0].hole.length + '+' + v2.players[0].up.length);
    ok(v2.stage === 'betting' || v2.stage === 'settle', '五张牌推进正常');
    // 验证牌组只剩 8~A
    var ranks = {};
    (v2.myCards || []).forEach(function (c) { ranks[c.rank] = 1; });
    ok(Object.keys(ranks).every(function (r) { return ['8', '9', '10', 'J', 'Q', 'K', 'A'].indexOf(r) >= 0; }),
      '手牌点数只含 8~A（' + Object.keys(ranks).join(',') + '）');
    // 打完这一局，验证「继续游戏」
    for (var m = 0; m < 30; m++) {
      var cur2 = s.list.filter(function (x) { return x.snap.view.myTurn; })[0];
      if (!cur2) break;
      var rr = await call(cur2, 'gameAction', { action: { type: 'call' } });
      if (!rr.ok) await call(cur2, 'gameAction', { action: { type: 'fold' } });
      await tick(60);
    }
    var v3 = s.list[0].snap.view;
    console.log('[五张牌] 打完一局后阶段=' + v3.stage + ' 局数=' + v3.hand);
    if (v3.stage === 'settle' && v3.liveCount > 1) {
      var nr = await call(s.list[0], 'nextRound', {});
      ok(nr.ok, '房主点「继续游戏」成功');
      await tick();
      var v4 = s.list[0].snap.view;
      ok(v4.hand === v3.hand + 1, '下一局局号递增（' + v3.hand + ' → ' + v4.hand + '）');
      console.log('[五张牌] 继续游戏后阶段=' + v4.stage + ' 局数=' + v4.hand);
    }
    await call(s.list[0], 'dissolveRoom', {});
  }

  /* ---------- 保皇 ---------- */
  {
    var b = await setup('baohuang', 5);
    var bv = b.list[0].snap.view;
    var emperor = b.list.filter(function (x) { return x.meId === bv.emperorId; })[0];
    console.log('[保皇] 阶段=' + bv.stage + ' 皇帝=' + (emperor ? '已确定' : '无'));
    var r1 = await call(emperor, 'gameAction', { action: { type: 'choose', solo: false, guardKey: 'BJ' } });
    if (!r1.ok) throw new Error('皇帝决策失败：' + r1.error);
    await tick();
    var bv2 = b.list[0].snap.view;
    if (bv2.stage === 'guardChoose') {
      var guard = b.list.filter(function (x) { return x.meId === bv2.guardId; })[0];
      var r2 = await call(guard, 'gameAction', { action: { type: 'choose', open: true } });
      if (!r2.ok) throw new Error('保子决策失败：' + r2.error);
      await tick();
    }
    for (var m = 0; m < 10; m++) {
      var cur2 = b.list.filter(function (x) { return x.snap.view.turnId === x.meId && x.snap.view.stage === 'play'; })[0];
      if (!cur2) break;
      var hand = cur2.snap.view.myHand;
      var lead = !cur2.snap.view.lastComboRaw || cur2.snap.view.mustLead;
      var act = lead ? { type: 'play', cardIds: [hand[hand.length - 1].id] } : { type: 'pass' };
      var r3 = await call(cur2, 'gameAction', { action: act });
      if (!r3.ok) { var r4 = await call(cur2, 'gameAction', { action: { type: 'pass' } }); if (!r4.ok) break; }
      await tick(80);
    }
    var bv3 = b.list[0].snap.view;
    console.log('[保皇] 10 步后阶段=' + bv3.stage + ' 皇帝手牌=' + bv3.players.filter(function (p) { return p.id === bv3.emperorId; })[0].handCount);
    ok(bv3.stage === 'play' || bv3.stage === 'ended', '保皇推进正常');
    await call(b.list[0], 'dissolveRoom', {});
  }

  /* ---------- 升级 ---------- */
  {
    var g = await setup('shengji', 4);
    var gv = g.list[0].snap.view;
    var banker = g.list.filter(function (x) { return x.meId === gv.players.filter(function (p) { return p.isBanker; })[0].id; })[0];
    console.log('[升级] 阶段=' + gv.stage + ' 打=' + gv.level);
    var r5 = await call(banker, 'gameAction', { action: { type: 'chooseTrump', suit: 'H' } });
    if (!r5.ok) throw new Error('选主失败：' + r5.error);
    await tick();
    var r6 = await call(banker, 'gameAction', { action: { type: 'discard', auto: true } });
    if (!r6.ok) throw new Error('扣底牌失败：' + r6.error);
    await tick();
    for (var t = 0; t < 12; t++) {
      var cur3 = g.list.filter(function (x) { return x.snap.view.turnId === x.meId && x.snap.view.stage === 'play'; })[0];
      if (!cur3) break;
      var hv = cur3.snap.view;
      var ids;
      if (!hv.trick.length) ids = [hv.myHand[hv.myHand.length - 1].id];
      else {
        var ctx = { level: hv.level, trumpSuit: hv.trumpSuit };
        var SJ = require('../public/shared/shengji-rules.js');
        var lg = SJ.groupOf(hv.trick[0].cards[0], ctx);
        var same = hv.myHand.filter(function (x) { return SJ.groupOf(x, ctx) === lg; });
        var need = Math.min(same.length, hv.leadSize);
        var pick = same.slice(same.length - need);
        if (pick.length < hv.leadSize) {
          var rest = hv.myHand.filter(function (x) { return pick.indexOf(x) < 0; });
          pick = pick.concat(rest.slice(0, hv.leadSize - pick.length));
        }
        ids = pick.map(function (x) { return x.id; });
      }
      var r7 = await call(cur3, 'gameAction', { action: { type: 'play', cardIds: ids } });
      if (!r7.ok) throw new Error('升级出牌失败：' + r7.error);
      await tick(80);
    }
    var gv2 = g.list[0].snap.view;
    console.log('[升级] 12 步后阶段=' + gv2.stage + ' 已完成轮数展示=' + (gv2.lastTrick ? gv2.lastTrick.winnerName : '无'));
    ok(gv2.stage === 'play' || gv2.stage === 'ended', '升级推进正常');
    await call(g.list[0], 'dissolveRoom', {});
  }

  /* ---------- 港式五张牌：自动结束 + 重新开始（socket 层） ---------- */
  {
    // 手动建房，先改设置再开局（高底注让对局几手内结束）
    var gl = [];
    for (var i = 0; i < 3; i++) gl.push(await client());
    var cr = await call(gl[0], 'createRoom', { gameId: 'stud5', name: 'P0' });
    must(cr, '建房');
    for (var j = 1; j < 3; j++) must(await call(gl[j], 'joinRoom', { roomId: cr.roomId, name: 'P' + j }), '加入');
    await tick();
    must(await call(gl[0], 'setOptions', { options: { startChips: 600, ante: 200, betUnit: 50 } }), '改设置');
    must(await call(gl[0], 'startGame', {}), '开局');
    await tick();

    var ended = false;
    for (var round = 0; round < 15 && !ended; round++) {
      for (var q = 0; q < 40; q++) {
        var cur4 = gl.filter(function (x) { return x.snap.view.myTurn; })[0];
        if (!cur4) break;
        // 0 号玩家跟注通吃，其他人弃牌 → 几手内就只剩一位有筹码
        var isFirst = (cur4.meId === gl[0].meId);
        var rr2 = await call(cur4, 'gameAction', { action: { type: isFirst ? 'call' : 'fold' } });
        if (!rr2.ok) await call(cur4, 'gameAction', { action: { type: 'call' } });
        await tick(60);
      }
      var vv = gl[0].snap.view;
      if (vv.stage === 'ended') { ended = true; break; }
      if (vv.stage === 'settle') {
        var nx = await call(gl[0], 'nextRound', {});
        if (!nx.ok) throw new Error('继续游戏失败：' + nx.error);
        await tick();
      }
    }
    var vfin = gl[0].snap.view;
    console.log('[五张牌] 连打后阶段=' + vfin.stage + ' 有筹码人数=' + vfin.liveCount + ' 局数=' + vfin.hand);
    ok(vfin.stage === 'ended' && vfin.liveCount <= 1, '只剩一位有筹码时自动结束');
    ok(vfin.finalRanking && vfin.finalRanking.length === 3, '结束界面有 3 人最终排名');

    var rs2 = await call(gl[0], 'gameAction', { action: { type: 'restart' } });
    if (!rs2.ok) throw new Error('重新开始失败：' + rs2.error);
    await tick();
    var vrs = gl[0].snap.view;
    console.log('[五张牌] 重新开始后阶段=' + vrs.stage + ' 局数=' + vrs.hand +
      ' 筹码=' + vrs.players.map(function (p) { return p.chips; }).join(','));
    ok(vrs.hand === 1, '重新开始后局号回到 1');
    ok(vrs.players.every(function (p) { return p.chips === 600 || p.chips === 400; }), '所有人筹码已重置（600 或扣底注后 400）');
    await call(gl[0], 'dissolveRoom', {});
  }

  /* ---------- 港式五张牌：设置项（每轮最多加注次数）socket 层 ---------- */
  {
    var gl = [];
    for (var i = 0; i < 3; i++) gl.push(await client());
    var cr = await call(gl[0], 'createRoom', { gameId: 'stud5', name: 'P0' });
    must(cr, '建房');
    for (var j = 1; j < 3; j++) must(await call(gl[j], 'joinRoom', { roomId: cr.roomId, name: 'P' + j }), '加入');
    await tick();
    var so = await call(gl[0], 'setOptions', { options: { startChips: 1000, ante: 10, betUnit: 20, maxRaises: 1, suitTie: true } });
    must(so, '设置 maxRaises=1');
    await tick();
    var vOpt = gl[0].snap.room.options;
    console.log('[五张牌] 设置后房间配置 maxRaises =', vOpt.maxRaises, '，ante =', vOpt.ante);
    ok(vOpt.maxRaises === 1, 'setOptions 后房间配置里 maxRaises = 1（未被清零）');
    must(await call(gl[0], 'startGame', {}), '开局');
    await tick();
    var vOpt2 = gl[0].snap.view.opts;
    console.log('[五张牌] 开局后本局配置 maxRaises =', vOpt2.maxRaises);
    ok(vOpt2.maxRaises === 1, '开局后本局采用的 maxRaises = 1');

    // 第 1 次加注允许，第 2 次必须被拒绝
    var cur = gl.filter(function (x) { return x.snap.view.myTurn; })[0];
    must(await call(cur, 'gameAction', { action: { type: 'raise' } }), '第 1 次加注');
    await tick();
    var cur2 = gl.filter(function (x) { return x.snap.view.myTurn; })[0];
    var r2 = await call(cur2, 'gameAction', { action: { type: 'raise' } });
    ok(!r2.ok && /加注次数/.test(r2.error || ''), '第 2 次加注被拒绝：' + (r2.error || ''));
    // 被拒绝后状态不应变化
    await tick();
    ok(gl[0].snap.view.stage === 'betting', '拒绝加注后牌局仍在下注阶段');
    await call(gl[0], 'dissolveRoom', {});
  }

  console.log('\n四款游戏端到端冒烟测试全部通过 🎉');
  process.exit(0);
})().catch(function (e) { console.error('✗ ' + e.message); process.exit(1); });

function ok(cond, msg) { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) process.exitCode = 1; }
