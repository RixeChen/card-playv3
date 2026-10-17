/* 端到端冒烟测试（需先启动服务）：node scripts/e2e.js
 * 用 3 个真实 socket 客户端建一个唬牌房，走完
 * 「建房 → 加入 → 开局 → 喊牌 → 跟牌 → 质疑 → 放弃 → 出完手牌获胜」。
 */
'use strict';
var io = require('socket.io-client');
var Cards = require('../public/shared/cards.js');
var URL = process.env.URL || 'http://127.0.0.1:3000';

function client(name) {
  var s = io(URL, { transports: ['websocket'] });
  var box = { sock: s, name: name, snap: null, meId: null };
  s.on('state', function (snap) { box.snap = snap; box.meId = snap.room.meId; });
  return new Promise(function (res) { s.on('connect', function () { res(box); }); });
}
function call(b, evt, data) { return new Promise(function (res) { b.sock.emit(evt, data, function (r) { res(r || {}); }); }); }
function tick(ms) { return new Promise(function (r) { setTimeout(r, ms || 200); }); }
function must(r, what) { if (!r.ok) throw new Error(what + '失败：' + r.error); }
function rankLabel(r) { return r === 'BJ' ? '小王' : (r === 'RJ' ? '大王' : r); }

(async function () {
  var A = await client('小明'), B = await client('小红'), C = await client('小刚');
  var all = [A, B, C];

  var r = await call(A, 'createRoom', { gameId: 'cheat', name: '小明' });
  must(r, '建房');
  console.log('✓ 建房成功，房间号 =', r.roomId);

  must(await call(B, 'joinRoom', { roomId: r.roomId, name: '小红' }), 'B 加入');
  must(await call(C, 'joinRoom', { roomId: r.roomId, name: '小刚' }), 'C 加入');
  await tick();
  console.log('✓ 3 人入座，人数 =', A.snap.room.players.length);

  must(await call(A, 'startGame', {}), '开局');
  await tick();
  var v = A.snap.view;
  console.log('✓ 开局，阶段 =', v.stage, '，总手牌 =', v.players.reduce(function (n, p) { return n + p.handCount; }, 0), '张');
  if (v.players.reduce(function (n, p) { return n + p.handCount; }, 0) !== 52) throw new Error('发牌数不是 52');

  /* ---- 第一手：当前玩家喊牌 ---- */
  var cur = all.filter(function (x) { return x.snap.view.myTurn; })[0];
  if (!cur) throw new Error('找不到当前出牌者');
  var cv = cur.snap.view;
  console.log('✓ 当前出牌者 =', cur.name, '，手牌', cv.myHand.length, '张，必须领出 =', cv.mustLead);
  // 随机挑一张，并且**故意喊错**（吹牛），这样后面的质疑一定走到「是假」分支，
  // 用来验证 bug1：质疑成功后出牌权必须交给质疑方。
  var lead = cv.myHand[Math.floor(Math.random() * cv.myHand.length)];
  var bluffRank = Cards.BS_RANKS.filter(function (r) { return r !== lead.rank; })
    [Math.floor(Math.random() * (Cards.BS_RANKS.length - 1))];
  must(await call(cur, 'gameAction', { action: { type: 'play', cardIds: [lead.id], rank: bluffRank } }), '喊牌（吹牛）');
  await tick();
  v = A.snap.view;
  console.log('✓ 喊牌成功：' + cur.name + ' 实际打出 ' + lead.text + '，却喊「' + v.lastPlay.label + '」，圈内', v.pileCount, '张');

  /* ---- 其他玩家质疑（放在跟牌之前，保证质疑的是第一手吹牛） ---- */
  var challenger = all.filter(function (x) {
    return x.snap.view.canChallenge && x.snap.view.lastPlay && x.snap.view.lastPlay.playerId !== x.meId;
  })[0];
  if (challenger) {
    must(await call(challenger, 'gameAction', { action: { type: 'challenge' } }), '质疑');
    await tick();
    var rv = A.snap.view.reveal;
    console.log('✓ 掀牌', rv ? rv.cards.length + ' 张，真假 = ' + (rv.fake ? '假' : '真') : '(无)',
      '，收牌方 =', rv ? (all.filter(function (x) { return x.meId === rv.cardTakerId; })[0] || {}).name : '?',
      '，出牌权方 =', rv ? (all.filter(function (x) { return x.meId === rv.winnerId; })[0] || {}).name : '?');

    // bug1 修复验证：质疑成功（是假）→ 出牌权必须交给质疑方，且质疑方能立即出牌
    if (rv && rv.fake) {
      var gotLeader = all.filter(function (x) { return x.snap.view.turnPlayerId === x.meId; })[0];
      console.log((gotLeader === challenger ? '✓' : '✗') + ' 质疑成功后出牌权归质疑方（' +
        (gotLeader ? gotLeader.name : '无') + '）');
      if (gotLeader !== challenger) throw new Error('质疑成功后出牌权没有交给质疑方');
      // 质疑方立即喊牌
      var hv = challenger.snap.view.myHand;
      var c0 = hv[hv.length - 1];
      var pr = await call(challenger, 'gameAction', { action: { type: 'play', cardIds: [c0.id], rank: c0.rank } });
      must(pr, '质疑成功后质疑方立即喊牌');
      await tick();
      console.log('✓ 质疑方获得出牌权后成功喊牌');
    } else {
      throw new Error('首手是吹牛，质疑结果却是「真」，不符合预期');
    }
  } else {
    throw new Error('找不到可质疑的玩家');
  }

  /* ---- 跟牌合法性：同张数更小点数应被拒绝 ---- */
  var next2 = all.filter(function (x) { return x.snap.view.myTurn; })[0];
  if (!next2) throw new Error('找不到下一位玩家');
  var nv = next2.snap.view;
  var lowerRanks = Cards.BS_RANKS.filter(function (rk) {
    return Cards.rankValue(rk) < Cards.rankValue(nv.lastPlay.rank);
  });
  var anyCard = nv.myHand[0];
  if (lowerRanks.length) {
    var bad = await call(next2, 'gameAction', { action: { type: 'play', cardIds: [anyCard.id], rank: lowerRanks[lowerRanks.length - 1] } });
    console.log((bad.ok ? '✗' : '✓') + ' 不同点数且张数不占优被拒绝：', bad.error || '(未被拒绝)');
    if (bad.ok) throw new Error('非法跟牌竟然通过了');
    if (!/压不过/.test(bad.error || '')) throw new Error('拒绝理由不符合预期：' + bad.error);
  } else {
    console.log('- 上家已喊最大点数，跳过「更小点数」用例');
  }

  /* ---- 合法跟牌：同点数张数不限，或同张数点数更大，或张数更多 ---- */
  var cur3 = all.filter(function (x) { return x.snap.view.myTurn; })[0];
  var nv3 = cur3.snap.view;
  var higherRanks = Cards.BS_RANKS.filter(function (rk) {
    return Cards.rankValue(rk) > Cards.rankValue(nv3.lastPlay.rank);
  });
  var sameRankOk = nv3.myHand.filter(function (c) { return c.rank === nv3.lastPlay.rank; });
  if (sameRankOk.length) {
    // 同点数：张数不限，只跟 1 张也可以
    must(await call(cur3, 'gameAction', { action: { type: 'play', cardIds: [sameRankOk[0].id], rank: nv3.lastPlay.rank } }), '同点数跟牌');
    await tick();
    console.log('✓ 跟牌成功（相同点数、张数不限），新喊牌 =', A.snap.view.lastPlay.label);
  } else if (higherRanks.length) {
    must(await call(cur3, 'gameAction', { action: { type: 'play', cardIds: [nv3.myHand[0].id], rank: higherRanks[higherRanks.length - 1] } }), '合法跟牌');
    await tick();
    console.log('✓ 跟牌成功（同张数点数更大），新喊牌 =', A.snap.view.lastPlay.label);
  } else if (nv3.myHand.length > nv3.lastPlay.count) {
    var two = nv3.myHand.slice(0, nv3.lastPlay.count + 1);
    must(await call(cur3, 'gameAction', { action: { type: 'play', cardIds: two.map(function (x) { return x.id; }), rank: two[0].rank } }), '合法跟牌');
    await tick();
    console.log('✓ 跟牌成功（张数更多），新喊牌 =', A.snap.view.lastPlay.label);
  } else {
    console.log('- 无法构造合法跟牌，跳过');
  }

  /* ---- 一路打到结束 ---- */
  var guard = 0;
  var allPassChecks = 0;
  while (A.snap.view.stage !== 'ended' && guard++ < 4000) {
    var st = A.snap.view;
    if (st.stage === 'play') {
      var who = all.filter(function (x) { return x.snap.view.myTurn; })[0];
      if (!who) break;
      var wv = who.snap.view;
      if (wv.mustLead) {
        var c = wv.myHand.reduce(function (a, b) {
          return Cards.rankValue(b.rank) < Cards.rankValue(a.rank) ? b : a;
        });
        var rr = await call(who, 'gameAction', { action: { type: 'play', cardIds: [c.id], rank: c.rank } });
        if (!rr.ok) await call(who, 'gameAction', { action: { type: 'pass' } });
      } else {
        // 记录本轮最后一个出牌者，然后放弃
        var prevLeader = wv.lastPlay ? wv.lastPlay.playerId : null;
        await call(who, 'gameAction', { action: { type: 'pass' } });
        await tick(40);
        var st2 = A.snap.view;
        // 不变量：因全放弃导致本圈结束时，出牌权必须还给最后一个出牌者
        if (prevLeader && st2.stage === 'play' && st2.lastPlay === null) {
          allPassChecks++;
          var got = all.filter(function (x) { return x.snap.view.turnPlayerId === x.meId; })[0];
          if (!got || got.meId !== prevLeader) {
            throw new Error('全放弃后出牌权未交给最后一个出牌者：应是 ' + prevLeader +
              '，实际 ' + (got ? got.meId : '无'));
          }
          // 该玩家必须处于领出状态，且能宣布全新牌型
          if (!got.snap.view.mustLead) throw new Error('最后一个出牌者未进入领出状态');
        }
      }
      await tick(40);
    } else if (st.stage === 'challenge' && st.winPendingId) {
      // 出完手牌的质疑窗口：为了快点，直接质疑
      var ch = all.filter(function (x) { return x.meId !== st.winPendingId; })[0];
      await call(ch, 'gameAction', { action: { type: 'challenge' } });
      await tick(40);
    } else break;
  }
  console.log('✓ 全放弃→交出牌权给最后出牌者 的校验通过 ' + allPassChecks + ' 次');

  var fin = A.snap.view;
  console.log('✓ 对局结束，阶段 =', fin.stage);
  if (fin.stage !== 'ended') throw new Error('对局未能结束');
  console.log('✓ 赢家 =', fin.result.winnerName, '，通吃', fin.result.total, '分');
  var sum = 0;
  fin.result.ranking.forEach(function (x) { sum += x.score; });
  if (Math.abs(sum) > 0.001) throw new Error('分数总和不为 0：' + sum);
  console.log('✓ 分数守恒（总和 = 0），排名', fin.result.ranking.length, '人');

  /* ---- 掉线重连 ---- */
  var seat = B.meId;
  B.sock.disconnect();
  await tick(300);
  var B2 = await client('小红');
  var rj = await call(B2, 'joinRoom', { roomId: r.roomId, name: '小红', playerId: seat });
  must(rj, '重连');
  await tick();
  console.log('✓ 掉线重连成功，座位恢复 =', B2.meId === seat);

  must(await call(A, 'dissolveRoom', {}), '解散');
  console.log('✓ 房主解散房间');

  console.log('\n唬牌端到端冒烟测试全部通过 🎉');
  process.exit(0);
})().catch(function (e) { console.error('✗ ' + e.message); process.exit(1); });
