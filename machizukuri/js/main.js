/* 荒野開拓記（仮） — エンジンの起動・メインループ・はじめる */
(function () {
  const MZ = window.MZ;
  MZ.started = false;

  /* state：保存データと同じ形の今の状態 */
  MZ.begin = function (state) {
    const canvas = document.querySelector('#cv'), W = MZ.world;
    const G = MZ.gfx;
    W.setLand(state.land);               // 持っている区画（草・塗り分けの表を作る前に決める）
    W.init(canvas);
    W.buildNodes(state.land);            // MZ.state はまだ入れない（setQuality の並べ直しが MZ.state の有る無しを見ている）。区画の一覧は引数で渡す
    G.setQuality(G.readPref());          // 画質（資産・材質・採れる物・建物・影の順）。ゲームの状態は触らない
    MZ.state = state;
    W.applyTaken();
    MZ.town.init();
    MZ.player.init();
    MZ.ui.init();
    G.bindUI();
    MZ.started = true;
    MZ.saveNow();
    addEventListener('resize', () => W.engine.resize());

    let last = performance.now(), gtime = 0;
    W.engine.runRenderLoop(() => {
      const now = performance.now(), real = (now - last) / 1000, dt = Math.min(0.1, real); last = now;   // real は実時間（画質の自動判定に使う）
      if (!MZ.paused) MZ.player.update(dt);
      if (MZ.timeFix == null) MZ.tick(dt);   // 世界の時間（移住・仕事・また出る）は、パネルを開いていても進める
      MZ.player.updateCamera(dt);
      MZ.town.updatePreview();
      MZ.town.render(MZ.timeFix == null ? now / 1000 : MZ.timeFix);
      MZ.ui.update(dt);
      /* 描画の層：時間・草・採れる物の並べ直し・火・影・予算・自動の画質 */
      if (MZ.timeFix == null) gtime += dt; else gtime = MZ.timeFix;   // timeFix：決まった絵を撮るための開発用（dev/shots.cjs）。世界の時間・草の時間を止める
      G.time = gtime;
      const ps = MZ.state.player;
      G.sky.update && G.sky.update(gtime);
      G.grass.update(dt, gtime, ps.x, ps.z);
      G.nodes.update(dt, ps.x, ps.z);
      G.fire.update(dt, gtime, ps.x, ps.z);
      G.post.update(ps.x, ps.z, ps.yaw);
      G.budgetTick(dt);
      G.autoWatch(real);
      W.scene.render();
    });
  };

  /* 描く呼び出しの数など（手元の確かめ用） */
  MZ.stats = () => ({ activeMeshes: MZ.world.scene.getActiveMeshes().length, totalMeshes: MZ.world.scene.meshes.length, nodes: MZ.world.nodes.length, tris: MZ.gfx.tris(), quality: MZ.gfx.key });
})();
