/* Dabba — case studio. Copyright (C) 2026 shahidhussain2k13@gmail.com
 * SPDX-License-Identifier: GPL-3.0-or-later — see LICENSE. */
/* export.js — the case as printable objects for the shared 3MF / STL writers:
 * base upright, lid upside down beside it, and latch hooks when there are any.
 */
window.CS = window.CS || {};
(function (CS) {
  'use strict';

  var APP = 'Dabba Case Studio';

  CS.exportThreeMF = function (model, state) {
    var parts = CS.printLayout(model), name = state.name || 'case';
    return WB.export3MF({
      app: APP, title: name,
      objects: [['base', ' base'], ['lid', ' lid'], ['latch', ' latch hooks']].map(function (o) {
        return { name: name + o[1], parts: parts.filter(function (p) { return p.half === o[0]; }) };
      })
    });
  };

  /* Pass parts already posed (CS.printLayout) to get the print arrangement. */
  CS.exportSTL = function (model) { return WB.exportSTL(model.parts, APP); };

})(window.CS);
