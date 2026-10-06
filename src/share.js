/* Dabba — case studio. Copyright (C) 2026 shahidhussain2k13@gmail.com
 * SPDX-License-Identifier: GPL-3.0-or-later — see LICENSE. */
/* share.js — a design packed into the link itself, after the '#', so it is
 * never sent to a server and the link works for as long as the site does.
 *
 *   #d=1.<base64url of deflate-raw JSON>   (browsers with CompressionStream)
 *   #d=0.<base64url of UTF-8 JSON>         (fallback, longer)
 */
window.CS = window.CS || {};
(function (CS) {
  'use strict';

  var PREFIX = '#d=';

  function toB64url(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromB64url(str) {
    var s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  function pipe(bytes, stream) {
    return new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()
      .then(function (b) { return new Uint8Array(b); });
  }
  var canZip = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

  /* obj → the part after the page address, '#d=…'. */
  CS.shareEncode = function (obj) {
    var bytes = new TextEncoder().encode(JSON.stringify(obj));
    if (!canZip) return Promise.resolve(PREFIX + '0.' + toB64url(bytes));
    return pipe(bytes, new CompressionStream('deflate-raw'))
      .then(function (z) { return PREFIX + '1.' + toB64url(z); });
  };

  /* '#d=…' (or a whole URL) → obj; null when the link carries no design. */
  CS.shareDecode = function (hash) {
    var i = (hash || '').indexOf(PREFIX);
    if (i < 0) return Promise.resolve(null);
    var body = hash.slice(i + PREFIX.length), kind = body.charAt(0);
    return Promise.resolve().then(function () {
      var bytes = fromB64url(body.slice(2));
      if (kind === '0') return bytes;
      if (kind !== '1') throw new Error('unknown link format');
      if (!canZip) throw new Error('this browser cannot unpack compressed links');
      return pipe(bytes, new DecompressionStream('deflate-raw'));
    }).then(function (bytes) { return JSON.parse(new TextDecoder().decode(bytes)); });
  };

  CS.shareBase = function () { return location.href.split('#')[0]; };

  /* Put text on the clipboard; returns whether it worked (file:// and older
     browsers can refuse, and the caller then shows the link to copy by hand). */
  CS.copyText = function (text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacy(); });
    }
    return Promise.resolve(legacy());
    function legacy() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      return ok;
    }
  };
})(window.CS);
