/* サイレント夜（仮） — 研究施設の地下のマップと、置いてある物
   マップは文字で書く。# = 壁、. = 床、S = はじめの場所（床）。1 文字 = 1 マス（SY.T.cell メートル）
   上が北。行が下へ進むほど南（Babylon の -z）、列が右へ進むほど東（+x） */
(function () {
  const SY = window.SY;

  SY.MAP = [
    '###############',
    '#...#.........#',
    '#.S.#.........#',
    '#...#.........#',
    '##A####B#######',   // A・B は扉（SY.DOORS）
    '#.............#',
    '#.............#',
    '######.####.###',
    '#.......#.....#',
    '#.......#.....#',
    '#.......#.....#',
    '###############'
  ];

  /* マスの中心の座標（m）。dx・dz はマスの中でのずれ（マス単位） */
  SY.cellPos = function (col, row, dx = 0, dz = 0) {
    const c = SY.T.cell;
    return { x: (col + .5 + dx) * c, z: -(row + .5 + dz) * c };
  };

  /* 部屋（電球を付ける場所と、名前） */
  SY.ROOMS = [
    { name: '監禁部屋', col: 2, row: 2, bulb: '#ffb066', flicker: 0.06 },
    { name: '研究室', col: 9, row: 2, bulb: '#cfe3ff', flicker: 0.02 },
    { name: '廊下', col: 7, row: 5.5, bulb: '#ffb066', flicker: 0.10 },
    { name: '倉庫', col: 4, row: 9, bulb: '#ffb066', flicker: 0.03 },
    { name: '培養室', col: 11, row: 9, bulb: null }   // 電球なし。培養槽の緑の光だけ
  ];

  /* そのマスがどの部屋か（出入り口のマスは null ＝ 前の部屋のまま） */
  SY.roomAt = function (col, row) {
    if (row === 4 || row === 7) return null;
    if (row <= 3) return col <= 3 ? '監禁部屋' : '研究室';
    if (row <= 6) return '廊下';
    return col <= 7 ? '倉庫' : '培養室';
  };

  /* 扉。key の持ち物があれば開く */
  SY.DOORS = {
    A: { name: '監禁部屋の扉', key: 'key-cell' },
    B: { name: '研究室の扉', key: 'key-lab' }
  };

  /* 持ち物。kind: key（鍵）・memo（メモ。読み返せる） */
  SY.ITEMS = {
    'key-cell': { kind: 'key', name: 'さびた鍵', desc: 'バケツの底に沈んでいた鍵。監禁部屋の扉に合いそうだ。' },
    'key-lab': { kind: 'key', name: '研究室の鍵', desc: '「研究室」と書かれたタグがついた鍵。' },
    'memo-1': { kind: 'memo', name: '搬入の記録', text: '12月25日 深夜\n被験者 1224・1225 を搬入。\n二名とも泥酔。記憶の処理は不要と判断。\n\n……クリスマスに、運のない男たちだ。' },
    'memo-2': { kind: 'memo', name: '走り書き', text: '研究室の鍵は、倉庫のロッカーのいちばん奥に戻しておくこと。\nまた失くしたら、あの子の餌当番だからな。' },
    'memo-3': { kind: 'memo', name: 'S計画 経過報告', text: 'S計画 経過報告 第14号\n\n練り物細胞は、音を立てない個体ほど安定する。\n「サイレント」の名はそこからとった。\n\n横丁からの第三便が届かない。\nあの子は、日に日に大きくなる。' }
  };

  /* 拾える物を置く場所（item・マス・マスの中のずれ・高さ） */
  SY.PICKUPS = [
    { item: 'memo-1', col: 3, row: 1, dx: .1, dz: .1, y: .005 },
    { item: 'memo-2', col: 4, row: 6, dx: 0, dz: .1, y: .005 },
    { item: 'memo-3', col: 10, row: 2, dx: .15, dz: -.05, y: .815 }
  ];

  /* 調べるボタンに出す名前（kind ごと） */
  SY.NAMES = {
    bed: 'ベッド', bucket: 'バケツ', chain: '鎖', calendar: 'カレンダー', desk: '机', bottle: 'びん',
    locker: 'ロッカー', lockerBack: 'ロッカー', shelf: '棚', tank: '培養槽'
  };

  /* 調べたときの文（kind ごと） */
  SY.TEXTS = {
    bed: '汚れたマットレス。……どうやってここに来たんだっけ。',
    bucket: 'バケツがある。中は見ないことにした。',
    bucket2: '……やっぱり見るしかない。底に何か沈んでいる。',
    bucketEmpty: 'もう何も入っていない。見なければよかった。',
    lockerBack: 'いちばん奥のロッカーだけ、鍵が開いている。',
    lockerEmpty: 'いちばん奥のロッカー。中は空っぽだ。',
    doorOpen: '扉は開いている。',
    chain: '壁から鎖がのびている。足首のあたりが、まだ少し痛い。',
    desk: '研究ノート。ほとんど読めない。「ちくわ」という文字だけが読める。',
    bottle: '緑色の液体が入ったびん。かすかに、おでんのにおいがする。',
    locker: '鍵がかかっている。',
    shelf: '段ボール箱が積んである。「横丁 第三便」と書いてある。',
    tank: '割れた培養槽。中は空っぽだ。ラベルには「S-CHIMERA」。',
    calendar: '12月のカレンダー。25日に赤い丸がついている。'
  };
})();
