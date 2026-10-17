/* 通用界面小工具：转义、牌的 HTML、轻提示 */
window.UI = (function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /**
   * 生成一张牌的 HTML
   * c: 牌对象；o: { size:'sm'|'xs', hidden:true, selected:true, click:true }
   */
  function cardHTML(c, o) {
    o = o || {};
    if (!c) return '';
    var cls = ['card'];
    if (o.hidden || c.hidden) {
      cls.push('back');
      if (o.size) cls.push('small');
      return '<div class="' + cls.join(' ') + '" data-id="' + esc(c.id || 'x') + '"></div>';
    }
    if (c.joker) cls.push('joker');
    else if (c.suit === 'H' || c.suit === 'D') cls.push('red');
    if (o.size === 'sm') cls.push('sm');
    if (o.size === 'xs') cls.push('xs');
    if (o.selected) cls.push('sel');
    if (o.click !== false) cls.push('click');
    var inner = c.joker
      ? '<div class="r">' + (c.rank === 'RJ' ? '大王' : '小王') + '</div>'
      : '<div class="r">' + esc(c.rank) + '</div><div class="s">' + esc(c.suitLabel) + '</div>';
    return '<div class="' + cls.join(' ') + '" data-id="' + esc(c.id) + '">' + inner + '</div>';
  }

  function backHTML() { return '<div class="card back small" data-id="back"></div>'; }

  var toastTimer = null;
  function toast(msg, ok) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast show' + (ok ? ' ok' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, 2200);
  }

  function fmtTime(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    return s + 's';
  }

  return { esc: esc, cardHTML: cardHTML, backHTML: backHTML, toast: toast, fmtTime: fmtTime };
})();
