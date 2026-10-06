/* Dabba — case studio. Copyright (C) 2026 shahidhussain2k13@gmail.com
 * SPDX-License-Identifier: GPL-3.0-or-later — see LICENSE. */
/* gl.js — small WebGL viewer with orbit controls and picking.
 * Renders the very mesh that gets exported, so the preview cannot drift from
 * the file. The lid is posed on the CPU (closed, swung open, or laid flat for
 * printing), so what you see in "Print layout" is exactly what is exported.
 */
window.CS = window.CS || {};
(function (CS) {
  'use strict';

  var VS = [
    'attribute vec3 aPos;',
    'attribute vec3 aNormal;',
    'attribute vec3 aColor;',
    'uniform mat4 uProj;',
    'uniform mat4 uView;',
    'varying vec3 vN;',
    'varying vec3 vC;',
    'varying vec3 vP;',
    'void main(){',
    '  vN = aNormal; vC = aColor; vP = aPos;',
    '  gl_Position = uProj * uView * vec4(aPos, 1.0);',
    '}'
  ].join('\n');

  var FS = [
    'precision highp float;',
    'varying vec3 vN;',
    'varying vec3 vC;',
    'varying vec3 vP;',
    'uniform vec3 uEye;',
    'void main(){',
    '  vec3 n = normalize(vN);',
    '  vec3 v = normalize(uEye - vP);',
    '  vec3 l1 = normalize(vec3(0.45, -0.7, 1.0));',
    '  vec3 l2 = normalize(vec3(-0.8, 0.5, 0.35));',
    '  float d1 = max(dot(n, l1), 0.0);',
    '  float d2 = max(dot(n, l2), 0.0);',
    // Filament colours are sRGB. Light has to be mixed in linear space and the
    // result encoded back, or dark colours wash out to grey.
    '  vec3 base = pow(vC, vec3(2.2));',
    '  float amb = 0.26 + 0.18 * (n.z * 0.5 + 0.5);',   // hemispheric fill
    '  float dif = 0.52 * d1 + 0.18 * d2;',
    '  vec3 h = normalize(l1 + v);',
    '  float spec = pow(max(dot(n, h), 0.0), 38.0) * 0.16;',
    '  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0) * 0.14;',
    '  vec3 col = base * (amb + dif + rim) + vec3(spec);',
    '  gl_FragColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);',
    '}'
  ].join('\n');

  /* Selection outlines: flat colour, drawn over everything. */
  var LVS = [
    'attribute vec3 aPos;',
    'uniform mat4 uProj;',
    'uniform mat4 uView;',
    'void main(){ gl_Position = uProj * uView * vec4(aPos, 1.0); }'
  ].join('\n');
  var LFS = [
    'precision mediump float;',
    'uniform vec4 uColor;',
    'void main(){ gl_FragColor = uColor; }'
  ].join('\n');

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(s));
    }
    return s;
  }
  function program(gl, vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  /* ── 4×4 matrices, column-major ─────────────────────────────────── */
  function perspective(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0
    ]);
  }

  function lookAt(eye, target, up) {
    var zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
    var zl = Math.hypot(zx, zy, zz) || 1; zx /= zl; zy /= zl; zz /= zl;
    var xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    var xl = Math.hypot(xx, xy, xz) || 1; xx /= xl; xy /= xl; xz /= xl;
    var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([
      xx, yx, zx, 0,
      xy, yy, zy, 0,
      xz, yz, zz, 0,
      -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
      -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
      -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1
    ]);
  }

  CS.Viewer = function (canvas, onPick) {
    var gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false });
    if (!gl) { this.failed = true; return; }

    this.canvas = canvas;
    this.gl = gl;
    this.onPick = onPick || function () {};
    this.count = 0;
    this.center = [0, 0, 0];
    this.radius = 40;
    this.mode = 'open';
    this.angle = 105;
    this.parts = [];
    this.D = null;
    this.outline = null;

    // camera state
    this.az = -1.15;
    this.el = 0.72;
    this.dist = 160;
    this.pan = [0, 0];

    this.prog = program(gl, VS, FS);
    this.loc = {
      pos: gl.getAttribLocation(this.prog, 'aPos'),
      nrm: gl.getAttribLocation(this.prog, 'aNormal'),
      col: gl.getAttribLocation(this.prog, 'aColor'),
      proj: gl.getUniformLocation(this.prog, 'uProj'),
      view: gl.getUniformLocation(this.prog, 'uView'),
      eye: gl.getUniformLocation(this.prog, 'uEye')
    };
    this.lprog = program(gl, LVS, LFS);
    this.lloc = {
      pos: gl.getAttribLocation(this.lprog, 'aPos'),
      proj: gl.getUniformLocation(this.lprog, 'uProj'),
      view: gl.getUniformLocation(this.lprog, 'uView'),
      color: gl.getUniformLocation(this.lprog, 'uColor')
    };
    this.buf = gl.createBuffer();
    this.lbuf = gl.createBuffer();

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    this._bindControls();
  };

  CS.Viewer.prototype._bindControls = function () {
    var self = this, canvas = this.canvas;
    var down = false, lastX = 0, lastY = 0, shift = false, travel = 0;

    canvas.addEventListener('pointerdown', function (e) {
      down = true; shift = e.shiftKey; travel = 0;
      lastX = e.clientX; lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add('dragging');
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!down) return;
      var dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      travel += Math.abs(dx) + Math.abs(dy);
      if (shift || e.buttons === 4) {
        var k = self.dist * 0.0016;
        var c = Math.cos(self.az), s = Math.sin(self.az);
        // Along the camera's right and forward directions on the ground, so
        // the model follows the pointer from any angle.
        self.pan[0] += (s * dx - c * dy) * k;
        self.pan[1] += (-c * dx - s * dy) * k;
      } else {
        self.az -= dx * 0.008;
        self.el = CS.clamp(self.el + dy * 0.008, -1.5, 1.5);
      }
      self.draw();
    });
    var end = function (e) {
      if (down && travel < 4 && e.type === 'pointerup') self._pick(e);
      down = false;
      canvas.classList.remove('dragging');
      if (e.pointerId != null && canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      self.dist = CS.clamp(self.dist * Math.exp(e.deltaY * 0.0012), self.radius * 0.55, self.radius * 14);
      self.draw();
    }, { passive: false });
    canvas.addEventListener('dblclick', function () { self.frame(); self.draw(); });
  };

  /* Click → the compartment under the cursor, found by casting the view ray
     onto the rim plane. The base never moves, so this works in every pose,
     and through a closed lid as a sort of x-ray. */
  CS.Viewer.prototype._pick = function (e) {
    if (!this.D || !this._mats) return;
    var r = this.canvas.getBoundingClientRect();
    var nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    var ny = 1 - ((e.clientY - r.top) / r.height) * 2;
    var inv = invert(mul(this._mats.proj, this._mats.view));
    if (!inv) return;
    var a = unproject(inv, nx, ny, -1), b = unproject(inv, nx, ny, 1);
    var dz = b[2] - a[2];
    if (Math.abs(dz) < 1e-9) return;
    var t = (this.D.zP - a[2]) / dz;
    if (t < 0) return;
    var x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
    var hit = null;
    this.D.rects.forEach(function (rc) {
      if (x >= rc.x0 - 1 && x <= rc.x1 + 1 && y >= rc.y0 - 1 && y <= rc.y1 + 1) hit = rc.id;
    });
    this.onPick(hit, { x: x, y: y });
  };

  CS.Viewer.prototype.setModel = function (parts, D) {
    this.parts = parts || [];
    this.D = D;
    this._upload();
  };

  CS.Viewer.prototype.setPose = function (mode, angle) {
    this.mode = mode;
    if (angle != null) this.angle = angle;
    this._upload();
  };

  /* Selected compartment, outlined at rim height. */
  CS.Viewer.prototype.setOutline = function (id) {
    this.outline = id;
    this._uploadLines();
  };

  /* Build the interleaved buffer from exported parts. */
  CS.Viewer.prototype._upload = function () {
    if (this.failed) return;
    var gl = this.gl, self = this;
    var isBody = function (p) { return p.key === 'base' || p.key === 'lid'; };
    var parts = this.parts.slice().sort(function (a, b) {
      return (isBody(a) ? 0 : 1) - (isBody(b) ? 0 : 1);
    });

    var tris = 0, bodyTris = 0;
    parts.forEach(function (p) {
      tris += p.indices.length / 3;
      if (isBody(p)) bodyTris += p.indices.length / 3;
    });
    this.count = tris * 3;
    this.bodyCount = bodyTris * 3;
    if (!tris) { this.bounds = null; return; }

    var data = new Float32Array(tris * 3 * 9);
    var o = 0;
    var minX = Infinity, minY = Infinity, minZ = Infinity;
    var maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    parts.forEach(function (part) {
      var pose = self.D ? CS.poseFor(self.D, part, self.mode, self.angle) : null;
      var rgb = CS.hexToRgb(part.color);
      var p = part.positions, ix = part.indices, cn = cornerNormals(part);
      for (var i = 0; i < ix.length; i++) {
        var a = ix[i] * 3, x = p[a], y = p[a + 1], z = p[a + 2];
        var nx = cn[i * 3], ny = cn[i * 3 + 1], nz = cn[i * 3 + 2];
        if (pose) {
          // Poses are rigid, so a normal turns with the point it sits on.
          var q = pose(x, y, z), qn = pose(x + nx, y + ny, z + nz);
          nx = qn[0] - q[0]; ny = qn[1] - q[1]; nz = qn[2] - q[2];
          x = q[0]; y = q[1]; z = q[2];
        }
        data[o++] = x; data[o++] = y; data[o++] = z;
        data[o++] = nx; data[o++] = ny; data[o++] = nz;
        data[o++] = rgb[0]; data[o++] = rgb[1]; data[o++] = rgb[2];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
    });

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

    this.bounds = { minX: minX, minY: minY, minZ: minZ, maxX: maxX, maxY: maxY, maxZ: maxZ };
    this.center = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
    this.radius = Math.max(6, Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2);
    // Zoom to suit when the model grows or shrinks a lot, keeping the angle.
    if (this._framed && (this.radius > this._framed * 1.12 || this.radius < this._framed * 0.7)) this.fit();
    this._uploadLines();
  };

  CS.Viewer.prototype._uploadLines = function () {
    if (this.failed) return;
    this.lineCount = 0;
    var D = this.D, id = this.outline;
    if (!D || !id) return;
    var r = D.rects.filter(function (q) { return q.id === id; })[0];
    if (!r) return;
    var z = D.zP + 0.08, pts = [];
    var ring = r.node.shape === 'round'
      ? (function () {
          var out = [];
          for (var i = 0; i < 48; i++) {
            var t = i / 48 * Math.PI * 2;
            out.push([r.cx + r.w / 2 * Math.cos(t), r.cy + r.l / 2 * Math.sin(t)]);
          }
          return out;
        })()
      : CS.rrectPoints(r.w, r.l, Math.min(D.R, 1.5), r.cx, r.cy, 24);
    for (var i = 0; i < ring.length; i++) {
      var a = ring[i], b = ring[(i + 1) % ring.length];
      pts.push(a[0], a[1], z, b[0], b[1], z);
    }
    var gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lbuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pts), gl.DYNAMIC_DRAW);
    this.lineCount = pts.length / 3;
  };

  /* Fit the bounding sphere in whichever field of view is narrower. */
  CS.Viewer.prototype.fit = function () {
    var aspect = Math.max(0.2, this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight));
    this.dist = this.radius / Math.sin(0.31) / Math.min(1, aspect) * 1.02;
    this.pan = [0, 0];
    this._framed = this.radius;
  };

  CS.Viewer.prototype.frame = function () {
    this.fit();
    this.az = -1.15;
    this.el = 0.72;
  };

  CS.Viewer.prototype.draw = function () {
    if (this.failed) return;
    var gl = this.gl, canvas = this.canvas;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    var h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!this.count) return;

    var ce = Math.cos(this.el), se = Math.sin(this.el);
    var target = [this.center[0] + this.pan[0], this.center[1] + this.pan[1], this.center[2]];
    var eye = [
      target[0] + this.dist * ce * Math.cos(this.az),
      target[1] + this.dist * ce * Math.sin(this.az),
      target[2] + this.dist * se
    ];

    // Clip planes hug the model: a tight depth range keeps a 1 mm lid top from
    // flickering against the lettering on its far side.
    var reach = this.radius * 1.6 + Math.hypot(this.pan[0], this.pan[1]);
    var proj = perspective(0.62, w / h, Math.max(this.radius * 0.02, this.dist - reach), this.dist + reach);
    var view = lookAt(eye, target, [0, 0, 1]);
    this._mats = { proj: proj, view: view };

    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.loc.proj, false, proj);
    gl.uniformMatrix4fv(this.loc.view, false, view);
    gl.uniform3fv(this.loc.eye, new Float32Array(eye));

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    var stride = 9 * 4;
    gl.enableVertexAttribArray(this.loc.pos);
    gl.vertexAttribPointer(this.loc.pos, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(this.loc.nrm);
    gl.vertexAttribPointer(this.loc.nrm, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(this.loc.col);
    gl.vertexAttribPointer(this.loc.col, 3, gl.FLOAT, false, stride, 24);

    /* No depth bias needed: an inlay fills a recess cut exactly to its shape,
       so it never shares a same-facing surface with the body. (A bias would
       pull the lid-top lettering through the lid at grazing angles.) */
    gl.drawArrays(gl.TRIANGLES, 0, this.count);
    gl.disableVertexAttribArray(this.loc.nrm);
    gl.disableVertexAttribArray(this.loc.col);

    if (this.lineCount) {
      gl.useProgram(this.lprog);
      gl.uniformMatrix4fv(this.lloc.proj, false, proj);
      gl.uniformMatrix4fv(this.lloc.view, false, view);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lbuf);
      gl.enableVertexAttribArray(this.lloc.pos);
      gl.vertexAttribPointer(this.lloc.pos, 3, gl.FLOAT, false, 12, 0);
      // Faint where hidden, bright where visible: reads in every pose.
      gl.depthFunc(gl.GREATER);
      gl.uniform4f(this.lloc.color, 0.35, 0.66, 1.0, 0.35);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.LINES, 0, this.lineCount);
      gl.depthFunc(gl.LEQUAL);
      gl.uniform4f(this.lloc.color, 0.35, 0.66, 1.0, 1.0);
      gl.drawArrays(gl.LINES, 0, this.lineCount);
      gl.disable(gl.BLEND);
      gl.depthFunc(gl.LESS);
      gl.disableVertexAttribArray(this.lloc.pos);
    }
  };

  /* ── shading ────────────────────────────────────────────────────── */
  /* One normal per triangle corner: the area-weighted average of the faces
     round that vertex that lie within CREASE of this triangle. Curves and
     textures shade smoothly; box edges and steps stay crisp. Cached on the
     part, so posing the lid doesn't recompute it. */
  var CREASE = Math.cos(35 * Math.PI / 180);

  function cornerNormals(part) {
    if (part._cn) return part._cn;
    var P = part.positions, I = part.indices, nt = I.length / 3, nv = P.length / 3;
    var fn = new Float32Array(nt * 3), fa = new Float32Array(nt);
    for (var t = 0; t < nt; t++) {
      var a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
      var ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      var vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      var len = Math.hypot(nx, ny, nz) || 1;
      fn[t * 3] = nx / len; fn[t * 3 + 1] = ny / len; fn[t * 3 + 2] = nz / len; fa[t] = len;
    }
    // Faces round each vertex, as a compact adjacency list.
    var start = new Uint32Array(nv + 1);
    for (var i = 0; i < I.length; i++) start[I[i] + 1]++;
    for (var v = 0; v < nv; v++) start[v + 1] += start[v];
    var fill = start.slice(0, nv), adj = new Uint32Array(I.length);
    for (var k = 0; k < I.length; k++) adj[fill[I[k]]++] = (k / 3) | 0;

    var out = new Float32Array(I.length * 3);
    for (var j = 0; j < I.length; j++) {
      var tf = (j / 3) | 0, vtx = I[j], sx = 0, sy = 0, sz = 0;
      var fx = fn[tf * 3], fy = fn[tf * 3 + 1], fz = fn[tf * 3 + 2];
      for (var q = start[vtx]; q < start[vtx + 1]; q++) {
        var g = adj[q], gx = fn[g * 3], gy = fn[g * 3 + 1], gz = fn[g * 3 + 2];
        if (gx * fx + gy * fy + gz * fz >= CREASE) { sx += gx * fa[g]; sy += gy * fa[g]; sz += gz * fa[g]; }
      }
      var l = Math.hypot(sx, sy, sz);
      if (l < 1e-12) { sx = fx; sy = fy; sz = fz; l = 1; }
      out[j * 3] = sx / l; out[j * 3 + 1] = sy / l; out[j * 3 + 2] = sz / l;
    }
    part._cn = out;
    return out;
  }

  /* ── picking maths ──────────────────────────────────────────────── */
  function mul(a, b) {
    var o = new Float32Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
      var s = 0;
      for (var k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
    return o;
  }
  function invert(m) {
    var inv = new Float64Array(16), i;
    inv[0] = m[5]*m[10]*m[15]-m[5]*m[11]*m[14]-m[9]*m[6]*m[15]+m[9]*m[7]*m[14]+m[13]*m[6]*m[11]-m[13]*m[7]*m[10];
    inv[4] = -m[4]*m[10]*m[15]+m[4]*m[11]*m[14]+m[8]*m[6]*m[15]-m[8]*m[7]*m[14]-m[12]*m[6]*m[11]+m[12]*m[7]*m[10];
    inv[8] = m[4]*m[9]*m[15]-m[4]*m[11]*m[13]-m[8]*m[5]*m[15]+m[8]*m[7]*m[13]+m[12]*m[5]*m[11]-m[12]*m[7]*m[9];
    inv[12] = -m[4]*m[9]*m[14]+m[4]*m[10]*m[13]+m[8]*m[5]*m[14]-m[8]*m[6]*m[13]-m[12]*m[5]*m[10]+m[12]*m[6]*m[9];
    inv[1] = -m[1]*m[10]*m[15]+m[1]*m[11]*m[14]+m[9]*m[2]*m[15]-m[9]*m[3]*m[14]-m[13]*m[2]*m[11]+m[13]*m[3]*m[10];
    inv[5] = m[0]*m[10]*m[15]-m[0]*m[11]*m[14]-m[8]*m[2]*m[15]+m[8]*m[3]*m[14]+m[12]*m[2]*m[11]-m[12]*m[3]*m[10];
    inv[9] = -m[0]*m[9]*m[15]+m[0]*m[11]*m[13]+m[8]*m[1]*m[15]-m[8]*m[3]*m[13]-m[12]*m[1]*m[11]+m[12]*m[3]*m[9];
    inv[13] = m[0]*m[9]*m[14]-m[0]*m[10]*m[13]-m[8]*m[1]*m[14]+m[8]*m[2]*m[13]+m[12]*m[1]*m[10]-m[12]*m[2]*m[9];
    inv[2] = m[1]*m[6]*m[15]-m[1]*m[7]*m[14]-m[5]*m[2]*m[15]+m[5]*m[3]*m[14]+m[13]*m[2]*m[7]-m[13]*m[3]*m[6];
    inv[6] = -m[0]*m[6]*m[15]+m[0]*m[7]*m[14]+m[4]*m[2]*m[15]-m[4]*m[3]*m[14]-m[12]*m[2]*m[7]+m[12]*m[3]*m[6];
    inv[10] = m[0]*m[5]*m[15]-m[0]*m[7]*m[13]-m[4]*m[1]*m[15]+m[4]*m[3]*m[13]+m[12]*m[1]*m[7]-m[12]*m[3]*m[5];
    inv[14] = -m[0]*m[5]*m[14]+m[0]*m[6]*m[13]+m[4]*m[1]*m[14]-m[4]*m[2]*m[13]-m[12]*m[1]*m[6]+m[12]*m[2]*m[5];
    inv[3] = -m[1]*m[6]*m[11]+m[1]*m[7]*m[10]+m[5]*m[2]*m[11]-m[5]*m[3]*m[10]-m[9]*m[2]*m[7]+m[9]*m[3]*m[6];
    inv[7] = m[0]*m[6]*m[11]-m[0]*m[7]*m[10]-m[4]*m[2]*m[11]+m[4]*m[3]*m[10]+m[8]*m[2]*m[7]-m[8]*m[3]*m[6];
    inv[11] = -m[0]*m[5]*m[11]+m[0]*m[7]*m[9]+m[4]*m[1]*m[11]-m[4]*m[3]*m[9]-m[8]*m[1]*m[7]+m[8]*m[3]*m[5];
    inv[15] = m[0]*m[5]*m[10]-m[0]*m[6]*m[9]-m[4]*m[1]*m[10]+m[4]*m[2]*m[9]+m[8]*m[1]*m[6]-m[8]*m[2]*m[5];
    var det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
    if (Math.abs(det) < 1e-12) return null;
    for (i = 0; i < 16; i++) inv[i] /= det;
    return inv;
  }
  function unproject(inv, x, y, z) {
    var v = [x, y, z, 1], o = [0, 0, 0, 0];
    for (var r = 0; r < 4; r++) for (var k = 0; k < 4; k++) o[r] += inv[k * 4 + r] * v[k];
    return [o[0] / o[3], o[1] / o[3], o[2] / o[3]];
  }

})(window.CS);
