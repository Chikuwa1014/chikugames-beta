/* 荒野開拓記（仮） — 描画の層：空気（高さと距離で濃くなる霧＋太陽の方向の明るいかすみ）
   霧の量は「地面ほど濃い大気」を視線に沿って積分したもの（高い山の頂は薄く、遠い谷は濃い）。
   霧の色は空の地平の色と同じ式にして、遠景が空に溶けるようにする。すべての PBR 材質に AirPlugin で足す。
   太陽の向き・色は sky.js の G.SKYC（sky.js の prepare のあと、registerAir の前に決まる） */
(function () {
  const MZ = window.MZ, B = BABYLON, G = MZ.gfx;
  const AIR = { dens: 0.0017, fall: 0.012 };
  const v3s = c => 'vec3(' + c.r.toFixed(4) + ',' + c.g.toFixed(4) + ',' + c.b.toFixed(4) + ')';
  const v3v = v => 'vec3(' + v.x.toFixed(4) + ',' + v.y.toFixed(4) + ',' + v.z.toFixed(4) + ')';
  function airGLSL() {
    const S = G.SKYC, SUN_DIR = S.SUN_DIR, C_HORIZON = S.C_HORIZON, C_SUN = S.C_SUN;
    return `
      vec3 airColor(vec3 rd) {
        float sd = max(dot(rd, ${v3v(SUN_DIR)}), 0.0);
        return ${v3s(C_HORIZON)} + ${v3s(C_SUN)} * (pow(sd, 5.0) * 0.32 + sd * sd * 0.35 + pow(sd, 48.0) * 0.25);
      }
      vec3 airApply(vec3 col, vec3 pw, vec3 eye) {
        vec3 rd = pw - eye; float d = length(rd); rd /= max(d, 1e-4);
        float b = ${AIR.fall.toFixed(4)};
        float ry = rd.y; if (abs(ry) < 1e-3) ry = 1e-3;
        float amt = ${AIR.dens.toFixed(5)} * exp(-b * max(eye.y, 0.0)) * (1.0 - exp(-b * ry * d)) / (b * ry);
        float ext = exp(-max(amt, 0.0));
        return col * ext + airColor(rd) * (1.0 - ext);
      }`;
  }
  let airRegistered = false;
  function registerAir() {
    if (airRegistered || !B.MaterialPluginBase || !B.RegisterMaterialPlugin) return;
    airRegistered = true;
    class AirPlugin extends B.MaterialPluginBase {
      constructor(material) { super(material, 'Air', 300, { AIR: false }); this._enable(true); }
      prepareDefines(defines) { defines.AIR = true; }
      getClassName() { return 'AirPlugin'; }
      getCustomCode(type) {
        if (type !== 'fragment') return null;
        return {
          CUSTOM_FRAGMENT_DEFINITIONS: airGLSL(),
          CUSTOM_FRAGMENT_BEFORE_FOG: 'finalColor.rgb = airApply(finalColor.rgb, vPositionW, vEyePosition.xyz);'
        };
      }
    }
    B.RegisterMaterialPlugin('Air', m => (m.getClassName && m.getClassName() === 'PBRMaterial' ? new AirPlugin(m) : null));
  }
  G.air = { glsl: airGLSL, register: registerAir };
})();
