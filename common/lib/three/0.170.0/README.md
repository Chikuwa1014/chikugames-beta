# three.js 0.170.0

外部ライブラリは号口 CLAUDE.md 8 章（2026-11-08 決定の B 案）どおり、`common/lib/<名前>/<版数>/` にライセンスと一緒に置く。
npm の `three@0.170.0` からそのまま写したもの（中身は書き換えない）。ライセンスは MIT（`LICENSE`）。

- `three.module.min.js`：本体（ES モジュール）。ゲーム側は importmap で `"three"` をこのファイルに向ける
- `addons/`：`examples/jsm/` から使う分だけ写したもの（光のにじみ＝ブルーム用：postprocessing の EffectComposer・RenderPass・ShaderPass・MaskPass・Pass・UnrealBloomPass・OutputPass と、shaders の CopyShader・LuminosityHighPassShader・OutputShader）

使っているゲーム：`gomibako-shooter/`
