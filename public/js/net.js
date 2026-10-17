/* 与服务器的通信封装：所有请求都返回 Promise，回调里带 { ok, error } */
window.Net = (function () {
  'use strict';
  var sock = null;

  function init() {
    sock = io({ transports: ['websocket', 'polling'] });
    return sock;
  }
  function on(evt, fn) { if (sock) sock.on(evt, fn); }
  function call(evt, data) {
    return new Promise(function (resolve) {
      if (!sock) return resolve({ ok: false, error: '未连接服务器' });
      var done = false;
      sock.emit(evt, data || {}, function (res) { done = true; resolve(res || { ok: true }); });
      setTimeout(function () { if (!done) resolve({ ok: false, error: '服务器无响应，请检查网络' }); }, 8000);
    });
  }
  return { init: init, on: on, call: call, get socket() { return sock; } };
})();
