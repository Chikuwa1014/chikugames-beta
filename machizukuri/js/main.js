/* 荒野開拓記（仮） — エンジンの起動・メインループ・はじめる */
(function () {
  const MZ = window.MZ;
  MZ.started = false;

  /* state：保存データと同じ形の今の状態 */
  MZ.begin = function (state) {
    const canvas = document.querySelector('#cv'), W = MZ.world;
    W.init(canvas);
    W.buildNodes();
    MZ.state = state;
    W.applyTaken();
    MZ.town.init();
    MZ.player.init();
    MZ.ui.init();
    MZ.started = true;
    MZ.saveNow();
    addEventListener('resize', () => W.engine.resize());

    let last = performance.now();
    W.engine.runRenderLoop(() => {
      const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (!MZ.paused) MZ.player.update(dt);
      MZ.tick(dt);                       // 世界の時間（移住・仕事・また出る）は、パネルを開いていても進める
      MZ.player.updateCamera(dt);
      MZ.town.updatePreview();
      MZ.town.render(now / 1000);
      MZ.ui.update(dt);
      W.scene.render();
    });
  };

  /* 描く呼び出しの数など（手元の確かめ用） */
  MZ.stats = () => ({ activeMeshes: MZ.world.scene.getActiveMeshes().length, totalMeshes: MZ.world.scene.meshes.length, nodes: MZ.world.nodes.length });
})();
