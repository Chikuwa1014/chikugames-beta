/* ほりほりもぐもぐ — 描画の土台（WebGL・行列・モデルづくり）。外部ライブラリは使わない */
(function () {
  const HM = window.HM;

  /* ---------- 4×4 行列（列優先。WebGL と同じ並び） ---------- */
  const M4 = {
    ident() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
    perspective(fovy, aspect, near, far) {
      const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far), m = new Float32Array(16);
      m[0] = f / aspect; m[5] = f; m[10] = (far + near) * nf; m[11] = -1; m[14] = 2 * far * near * nf;
      return m;
    },
    lookAt(eye, at, up) {
      let zx = eye[0] - at[0], zy = eye[1] - at[1], zz = eye[2] - at[2];
      let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
      let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
      l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
      const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
      const m = new Float32Array(16);
      m[0] = xx; m[1] = yx; m[2] = zx; m[4] = xy; m[5] = yy; m[6] = zy; m[8] = xz; m[9] = yz; m[10] = zz;
      m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
      m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
      m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
      m[15] = 1;
      return m;
    },
    mul(a, b) {
      const o = new Float32Array(16);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
      return o;
    },
    /* 位置・Y 回転・大きさ（モデルの置き方） */
    trs(x, y, z, yaw, s, sy) {
      const c = Math.cos(yaw), si = Math.sin(yaw), m = new Float32Array(16);
      sy = sy == null ? s : sy;
      m[0] = c * s; m[2] = -si * s; m[5] = sy; m[8] = si * s; m[10] = c * s;
      m[12] = x; m[13] = y; m[14] = z; m[15] = 1;
      return m;
    },
    /* dir の向きに z 軸を合わせ、長さ len・太さ w の棒にする（レーザー） */
    beam(o, dir, len, w) {
      let [dx, dy, dz] = dir;
      const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
      let ux = 0, uy = 1, uz = 0;
      if (Math.abs(dy) > 0.95) { ux = 1; uy = 0; }
      let xx = uy * dz - uz * dy, xy = uz * dx - ux * dz, xz = ux * dy - uy * dx;
      const xl = Math.hypot(xx, xy, xz) || 1; xx /= xl; xy /= xl; xz /= xl;
      const yx = dy * xz - dz * xy, yy = dz * xx - dx * xz, yz = dx * xy - dy * xx;
      const m = new Float32Array(16);
      m[0] = xx * w; m[1] = xy * w; m[2] = xz * w;
      m[4] = yx * w; m[5] = yy * w; m[6] = yz * w;
      m[8] = dx * len; m[9] = dy * len; m[10] = dz * len;
      m[12] = o[0]; m[13] = o[1]; m[14] = o[2]; m[15] = 1;
      return m;
    },
    /* 点を画面へ（-1〜1）。後ろなら null */
    project(vp, x, y, z) {
      const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
      const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
      const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
      if (cw <= 0.05) return null;
      return [cx / cw, cy / cw, cw];
    }
  };
  HM.M4 = M4;

  /* ---------- シード付き乱数・ハッシュ ---------- */
  HM.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  HM.hash3 = function (x, y, z, s) {
    let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791) ^ Math.imul(s | 0, 2654435761)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  HM.hex = function (h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  };

  /* ---------- WebGL ---------- */
  const VS = `
attribute vec3 aPos; attribute vec4 aCol;
uniform mat4 uVP; uniform mat4 uModel; uniform vec3 uTint;
varying vec4 vCol; varying vec3 vWorld;
void main(){
  vec4 w = uModel * vec4(aPos, 1.0);
  vWorld = w.xyz;
  vCol = vec4(aCol.rgb * uTint, aCol.a);
  gl_Position = uVP * w;
}`;
  const FS = `
precision mediump float;
varying vec4 vCol; varying vec3 vWorld;
uniform vec3 uCam; uniform vec3 uFog; uniform float uRange; uniform float uGlow; uniform float uAlpha;
void main(){
  float d = distance(vWorld, uCam);
  float lamp = clamp(1.0 - d / uRange, 0.0, 1.0);
  float lit = 0.22 + 0.78 * lamp * lamp;
  float e = max(vCol.a, uGlow);
  vec3 c = mix(vCol.rgb * lit, vCol.rgb, e);
  float fog = smoothstep(uRange * 0.55, uRange, d) * (1.0 - e * 0.6);
  gl_FragColor = vec4(mix(c, uFog, fog), uAlpha);
}`;

  function Renderer(canvas) {
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' }) ||
      canvas.getContext('experimental-webgl');
    if (!gl) throw new Error('WebGL が使えません');
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const A = { pos: gl.getAttribLocation(prog, 'aPos'), col: gl.getAttribLocation(prog, 'aCol') };
    const U = {};
    for (const k of ['uVP', 'uModel', 'uTint', 'uCam', 'uFog', 'uRange', 'uGlow', 'uAlpha']) U[k] = gl.getUniformLocation(prog, k);
    gl.enableVertexAttribArray(A.pos);
    gl.enableVertexAttribArray(A.col);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const I = M4.ident();

    const R = {
      gl, canvas,
      /** 頂点（x,y,z,r,g,b,光る）の Float32Array から描画用の形を作る */
      mesh(data, old) {
        if (old) gl.deleteBuffer(old.buf);
        if (!data || !data.length) return null;
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        return { buf, n: data.length / 7 };
      },
      free(m) { if (m) gl.deleteBuffer(m.buf); },
      begin(vp, cam, fog, range) {
        const w = canvas.width, h = canvas.height;
        gl.viewport(0, 0, w, h);
        gl.clearColor(fog[0], fog[1], fog[2], 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.uniformMatrix4fv(U.uVP, false, vp);
        gl.uniform3fv(U.uCam, cam);
        gl.uniform3fv(U.uFog, fog);
        gl.uniform1f(U.uRange, range);
        gl.uniform1f(U.uAlpha, 1);
      },
      draw(m, model, tint, glow, alpha) {
        if (!m) return;
        gl.uniformMatrix4fv(U.uModel, false, model || I);
        gl.uniform3fv(U.uTint, tint || [1, 1, 1]);
        gl.uniform1f(U.uGlow, glow || 0);
        const a = alpha == null ? 1 : alpha;
        if (a < 1) { gl.enable(gl.BLEND); gl.depthMask(false); }
        gl.uniform1f(U.uAlpha, a);
        gl.bindBuffer(gl.ARRAY_BUFFER, m.buf);
        gl.vertexAttribPointer(A.pos, 3, gl.FLOAT, false, 28, 0);
        gl.vertexAttribPointer(A.col, 4, gl.FLOAT, false, 28, 12);
        gl.drawArrays(gl.TRIANGLES, 0, m.n);
        if (a < 1) { gl.disable(gl.BLEND); gl.depthMask(true); gl.uniform1f(U.uAlpha, 1); }
      },
      cull(on) { on ? gl.enable(gl.CULL_FACE) : gl.disable(gl.CULL_FACE); }
    };
    return R;
  }
  HM.Renderer = Renderer;

  /* ---------- 面を足す（マスの描画とモデルで共用） ----------
     dir：0=+x 1=-x 2=+y 3=-y 4=+z 5=-z。ao は 4 角の明るさ（0〜1） */
  const FACES = [
    { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], shade: 0.8 },
    { n: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], shade: 0.8 },
    { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0 },
    { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.55 },
    { n: [0, 0, 1], c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], shade: 0.68 },
    { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], shade: 0.68 }
  ];
  HM.FACES = FACES;
  const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  HM.DIRS = DIRS;

  /** 面を out（数値の配列）に足す。x,y,z はマスの角、s は大きさ */
  HM.pushFace = function (out, x, y, z, s, dir, r, g, b, e, ao) {
    const F = FACES[dir], k = F.shade;
    const v = F.c.map((c, i) => {
      const a = ao ? ao[i] : 1;
      return [x + c[0] * s, y + c[1] * s, z + c[2] * s, r * k * a, g * k * a, b * k * a];
    });
    // 角の明るさの差で、三角形の分け方をかえる（暗いすじが出ないように）
    const flip = ao && (ao[0] + ao[2] < ao[1] + ao[3]);
    const idx = flip ? [1, 2, 3, 1, 3, 0] : [0, 1, 2, 0, 2, 3];
    for (const i of idx) {
      const p = v[i];
      out.push(p[0], p[1], p[2], p[3], p[4], p[5], e);
    }
  };

  /** 小さなマスの集まりでモデルを作る。fn(i,j,k) が [r,g,b,光る] か null を返す。
      できあがりは、底の中心が原点、高さが height になる大きさ */
  HM.voxModel = function (nx, ny, nz, height, fn) {
    const s = height / ny, grid = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) grid[(i * ny + j) * nz + k] = fn(i, j, k);
    const at = (i, j, k) => (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) ? null : grid[(i * ny + j) * nz + k];
    const out = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) {
      const c = at(i, j, k);
      if (!c) continue;
      for (let d = 0; d < 6; d++) {
        const D = DIRS[d];
        if (at(i + D[0], j + D[1], k + D[2])) continue;
        HM.pushFace(out, (i - nx / 2) * s, j * s, (k - nz / 2) * s, s, d, c[0], c[1], c[2], c[3] || 0, null);
      }
    }
    return new Float32Array(out);
  };

  /** 単純な箱（-0.5〜0.5、レーザー・破片用） */
  HM.boxModel = function (col, e) {
    const out = [];
    for (let d = 0; d < 6; d++) HM.pushFace(out, -0.5, -0.5, -0.5, 1, d, col[0], col[1], col[2], e || 0, null);
    // レーザーは z 方向 0〜1 にのばすので、z を 0.5 ずらす
    for (let i = 2; i < out.length; i += 7) out[i] += 0.5;
    return new Float32Array(out);
  };
})();
