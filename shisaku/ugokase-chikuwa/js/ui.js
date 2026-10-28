/* うごかせ！ちくわくん — 画面（描画・操作・指示書・お店・シフト・かんばん・設定） */
(function () {
  const UC = window.UC, CFG = UC.CFG, DX = UC.DX, DY = UC.DY;
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  CG.init({ game: 'ugokase-chikuwa', title: 'うごかせ！ちくわくん', version: UC.VERSION });

  let G = null;               // ゲームの状態（sim.js）
  let curBase = 0, selRobot = 0, speed = 1;
  let placing = null;         // お店で選んだ、置くきかい
  let placeHand = 'R';        // 90° 曲線を買うときの右曲がり・左曲がり
  const cams = {};            // 拠点ごとのカメラ { x, y, z }
  const floors = {};          // 拠点ごとの床の絵

  const HIST = [
    ['1.2.0', '2026-10-28', '集荷の個数が、日経平均株価のように毎日動く「製品の需要」と、月・曜日で変わるように（かんばんにグラフ）。景気は 10 年で 1 周（平均→好景気→不景気）し、好景気・不景気のカットインが出る。ちくわ君の体力・精神力をへりやすくした（勤務中は精神力もへる）'],
    ['1.1.0', '2026-10-28', '置いた直後に「↻ 向き」を押すと、そのきかいも回るように。90°曲線は買うときに右曲がり・左曲がりを選ぶ。置いたきかいの移動（恋ンがかかる）を調べる画面にも。Tコンベアを集約（2→1）・発散（1→2）で切りかえ、1本側の口も選べる'],
    ['1.0.0', '2026-10-28', 'ちくわゲームズに公開（β版から昇格）。設定に「💾 セーブの引っ越し」を足した'],
    ['β0.7.2', '2026-10-27', 'ファンクション（F1〜F3）の中では、停止のピースが「ファンクション終了」になる（呼んだところへもどる）'],
    ['β0.7.1', '2026-10-27', 'ちくわ君の見た目をかわいくした（大きな目・ほっぺ・♥のアンテナ・ちょこんとした足）'],
    ['β0.7.0', '2026-10-27', 'ゲームを始めたら時間は止まった状態に（速さのボタンを吹き出しで案内）。集荷の未達の数を次の集荷に上乗せ。⟲⟳ で視点を 90° ずつ回せる'],
    ['β0.6.1', '2026-10-27', '製造ラインに接続できるのを、取り場の上下左右のとなりだけにした（ななめはふくまない）'],
    ['β0.6.0', '2026-10-27', '製造ラインに接続：取り場のとなりにコンベアを置くと、つなぐか聞く。つなぐと製品が自動でコンベアへ流れる'],
    ['β0.5.0', '2026-10-27', '拠点のレベル（累計集荷数で1〜8。取り場・出荷ヤードが増え、レベル5からヤードに製品指定）。拠点の大きさ別の上限。場合わけピース（開始・おわりの1対、条件はプルダウン）'],
    ['β0.4.1', '2026-10-27', '「お店」の表記を「コンサル」に変えた'],
    ['β0.4.0', '2026-10-27', '🔧 配置がえモード：置いたきかいを選んで、90°回す・移動・撤去。置くときも「↻ 向き」で向きを決めてから置ける'],
    ['β0.3.1', '2026-10-27', 'きかいを置くとき、タップした場所とずれて置かれることがあるのを直した。置いたきかいを1つずつもどせる「取り消し」を足した'],
    ['β0.3.0', '2026-10-27', '「持つ」と「置く」を別のピースに。指示書は最後まで行くと止まる（自動でくり返さない）。くり返しピース（開始・おわりの1対、入れ子OK、回数はプルダウン）。取り場・出荷ヤードなど背の高いものも、絵をタップすればナビが出る'],
    ['β0.2.0', '2026-10-27', '指示書の左端に「起動」ピース。「停止」ピース（最後にだけ置ける）。進むピースを指示書でタップして歩数を決められる。オブジェクトをタップすると、選んでいるちくわ君からの最短ルートとナビを表示'],
    ['β0.1.1', '2026-10-27', '指示ピースをパズルのピースの形にした（となりのピースとはまる）。集荷がそろうと、ちくわ君がピース✌'],
    ['β0.1.0', '2026-10-27', '最初の試作版。ほんしゃ・指示書（BUILD／RUN／緊急停止・F1〜F3）・きかい・シフト・かんばん・れいぞうこ・福利厚生・拠点の追加'],
  ];

  CG.debug.init({ snap: () => G ? ({ t: Math.round(G.time), coin: G.coin, rb: G.robots.map(r => [r.base, r.x, r.y, r.dir, Math.round(r.hp), Math.round(r.mp), r.mode, r.running ? 1 : 0]) }) : {} });

  /* ---------- 音（Web Audio で自作。ピッ・チャリン程度） ---------- */
  const Snd = {
    ctx: null, mute: CG.ls.get('ugokase-chikuwa-mute') === '1',
    init() { if (this.ctx) return; try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } },
    tone(f, d = 0.08, type = 'square', v = 0.06, when = 0) {
      if (this.mute || !this.ctx) return;
      const c = this.ctx, t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = f; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + d + 0.02);
    },
    coin() { this.tone(1320, 0.06, 'square', 0.05); this.tone(1760, 0.1, 'square', 0.05, 0.06); },
    ok() { [660, 880, 1100].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.08, i * 0.08)); },
    ng() { this.tone(220, 0.25, 'sawtooth', 0.05); },
    click() { this.tone(900, 0.03, 'square', 0.03); },
    put() { this.tone(520, 0.05, 'triangle', 0.07); },
  };
  document.addEventListener('pointerdown', () => Snd.init(), { once: true });

  /* ---------- トースト ---------- */
  function toast(s) {
    const box = $('#toastBox'), d = document.createElement('div');
    d.textContent = s; box.appendChild(d);
    setTimeout(() => d.remove(), 2400);
    while (box.children.length > 3) box.firstChild.remove();
  }

  UC.on((name, d) => {
    if (!G) return;
    if (name === 'coin') { Snd.coin(); }
    if (name === 'pickup') {
      const bn = G.bases.length > 1 ? d.base.name + '：' : '';
      const yn = d.yard && UC.spots(d.base, 'yard').length > 1 ? `ヤード${d.yard.no}：` : '';
      if (d.ok) { Snd.ok(); toast(`${bn}${yn}集荷OK！ ${d.got}個 +${d.earn}恋ン`); }
      else { Snd.ng(); toast(`${bn}${yn}集荷が足りない… ${d.got}/${d.need}個（精神力ダウン・足りない${d.short}個は次の集荷に上乗せ）`); }
    }
    if (name === 'phase') cutin(d.phase);
    if (name === 'levelup') {
      const L = UC.levelOf(d.base);
      Snd.ok(); toast(`🎉 ${d.base.name}が レベル${d.lv} に！ 取り場${L.src}・ヤード${L.yard}${L.spec === 'all' ? '（製品指定あり）' : L.spec === 'mix' ? '（製品指定あり／なし）' : ''}`);
      for (const k in floors) if (k.startsWith(G.bases.indexOf(d.base) + ':')) delete floors[k];
    }
    if (name === 'take' || name === 'put') Snd.put();
    if (name === 'injured') toast(`${d.name}が怪我をした！ すり身部品でなおそう`);
    if (name === 'sulk') toast(`${d.name}の心がおれた… 有給で休ませよう`);
    if (name === 'month') { const c = d; toast(`${c.month}月になりました ${UC.SEASON_NAME[c.season]}`); }
    if (name === 'packed') Snd.ok();
    if (name === 'done') toast(d.name + 'は指示書を最後まで実行しました');
    if (name === 'stopped') toast(d.name + 'は停止ピースで止まりました');
  });

  /* ---------- タイトル ---------- */
  function drawTitle(t) {
    const cv = $('#titleCv'), c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, cv.width, cv.height);
    const s = UC.sprite('robot', Math.floor(t / 1.2) % 4);
    const bob = Math.round(Math.abs(Math.sin(t * 3)) * 2);
    c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(55, 66, 18, 6, 0, 0, Math.PI * 2); c.fill();
    c.drawImage(s.cv, 55 - s.cv.width / 2, 66 - s.cv.height + 6 - bob);
    // 頭の上の汗（自己肯定感ボロボロ）
    if (Math.sin(t * 2) > 0) { c.fillStyle = '#9ED8F5'; c.beginPath(); c.ellipse(74, 22 - bob, 3, 4, 0, 0, Math.PI * 2); c.fill(); }
  }
  let titleRaf = 0;
  function titleLoop(ts) { drawTitle(ts / 1000); titleRaf = requestAnimationFrame(titleLoop); }

  function showTitle() {
    $('#title').classList.remove('hide'); $('#game').classList.add('hide');
    $('#btnCont').classList.toggle('hide', !UC.load());
    $('#verT').textContent = 'バージョン ' + UC.VERSION;
    cancelAnimationFrame(titleRaf); titleRaf = requestAnimationFrame(titleLoop);
  }
  function startGame(g, first) {
    G = g; curBase = 0; selRobot = 0;
    for (const k in floors) delete floors[k];
    for (const k in cams) delete cams[k];
    cancelAnimationFrame(titleRaf);
    $('#title').classList.add('hide'); $('#game').classList.remove('hide');
    resize(); refreshAll();
    UC.step(G, 0);
    // はじめは時間を止めておき、速さのボタンを吹き出しで知らせる
    setSpeed(0); $('#spdTip').classList.remove('hide');
    if (first) howTo();
  }
  $('#btnNew').onclick = () => {
    if (UC.load() && !confirm('いまのデータを消して、はじめからにしますか？')) return;
    const g = UC.newGame(); UC.save(g); startGame(g, true);
  };
  $('#btnCont').onclick = () => { const g = UC.load(); if (g) startGame(g, false); };
  $('#btnHow').onclick = () => howTo();

  /* ---------- ダイアログ ---------- */
  let modalOnClose = null;
  function openModal(title, html, onClose) {
    $('#mTitle').textContent = title; $('#mBody').innerHTML = html;
    $('#modal').classList.remove('hide'); document.body.classList.add('mopen'); modalOnClose = onClose || null;
    return $('#mBody');
  }
  function closeModal() { $('#modal').classList.add('hide'); document.body.classList.remove('mopen'); const f = modalOnClose; modalOnClose = null; buildOpen = false; if (f) f(); }
  $('#mClose').onclick = closeModal;
  $('#modal').addEventListener('pointerdown', e => { if (e.target.id === 'modal') closeModal(); });

  function howTo() {
    openModal('あそびかた', `
      <p><b>目的：</b>製造ラインの終点（<b>取り場</b>・オレンジの機械）に出てくる製品を、ちくわ君に<b>出荷ヤード</b>（黄色のしまのパレット）まで運ばせよう。<b>かんばん</b>の時刻に個数がそろっていれば売上の恋ンが入り、ちくわ君の精神力（自己肯定感）が回復する。足りないと精神力がへる。</p>
      <p><b>指示書：</b>「BUILD」で指示ピースを並べ、「RUN」で実行。指示書は最後まで行くと止まる（くり返したいところは、くり返しピースではさむ）。「緊急停止」でとまる。</p>
      <div class="note">⬆ 進む：ものに当たるまで進む ／ ↶↷⟲ 向きをかえる ／ ✋ 持つ：前の取り場などから製品を持つ ／ 📥 置く：前の出荷ヤードなどに置く ／ 🔁 くり返し〜↩ おわり：はさんだピースをくり返す（かならず1対・入れ子もできる） ／ ❓ 場合わけ〜❗ おわり：条件（プルダウン）に合うときだけ、はさんだピースを実行 ／ ■ 停止（ファンクションの中では ⏎ ファンクション終了：呼んだところへもどる） ／ 🔨 作業する：前の梱包台で梱包 ／ ⏻ 操作する：前のきかいのスイッチ ／ F1〜F3：ファンクションを呼ぶ</div>
      <p><b>製造ライン：</b>取り場の上下左右のとなり（ななめはだめ）にコンベアを置くと「製造ラインに接続」できる。つなぐと、取り場の製品が自動でコンベアへ流れていく。</p>
      <p><b>恋ン：</b>ちくわ君が工場を歩くと、落ちている恋ン（金色の♥）を拾って社長のポケットマネーにできる。コンサルで、きかい・福利厚生・ちくわ君の能力アップ・拠点・ちくわ君の増設に使える。</p>
      <p><b>時間：</b>1ヶ月は7日、1年は12ヶ月。ちくわ君はシフトの時間だけ働き、勤務のまん中で休けい（1時間＋15分）。休けいは自動で<b>れいぞうこ</b>へ入って体力・精神力が回復する。だれも勤務していないあいだは自動で早送り。</p>
      <p><b>拠点のレベル：</b>その拠点の累計集荷数でレベルが上がり、取り場と出荷ヤードが増える。レベル5からはヤードに製品指定がつき、その製品しか置けない（場合わけピースやふりわけそうちで分けよう）。拠点の大きさでレベルの上限がある（S：5・M：6・L：8）。</p>
      <p><b>製品の需要：</b>集荷の個数は、日経平均株価のように毎日動く「需要」（景気は 10 年で 1 周：平均 3 年→好景気 4 年→不景気 3 年）と、月（年末・年度末は多め、お盆は少なめ）・曜日（金曜は多め、土日は少なめ）で変わる。かんばんの画面でグラフが見られる。</p>
      <p><b>体力・精神力：</b>体力が0になると怪我（すり身部品でなおす）。精神力が0になると心がおれて動かない（有給で回復）。勤務中は体力も精神力も少しずつへり、夏は体力、冬は精神力がさらにへる。れいぞうこでの回復は体力のほうが大きい。</p>
      <p><b>操作：</b>画面をドラッグで移動、ピンチかホイール・＋－で拡大縮小、⟲⟳ で視点を 90° ずつ回す（4 回で 1 周）。時間は ⏸▶▶▶▶▶▶ で止めたり速くしたりできる（はじめは止まっている）。マスをタップすると、きかいを調べたり回したりできる。</p>`);
  }

  /* ---------- 上の表示 ---------- */
  function refreshTop() {
    const c = UC.cal(G.time);
    const travel = G.time < G.travelUntil;
    $('#clock').textContent = `${c.year}年目 ${c.month}/${c.date}(${UC.WEEK[c.wd]}) ${UC.fmtTime(G.time)} ${UC.SEASON_NAME[c.season].slice(0, 2)}${travel ? ' ✈旅行中' : ''}`;
    $('#coin').textContent = '💰' + Math.floor(G.coin).toLocaleString() + '恋ン';
  }
  function modeText(r) {
    if (r.injured) return '🩹怪我';
    if (r.sulk) return '😞心がおれた';
    if (r.mode === 'off') { const w = UC.nextWindow(r, G.time); return '💤勤務外' + (w ? '（' + UC.fmtTime(w.start) + '〜）' : ''); }
    if (r.mode === 'break') return r.brk && r.brk.phase === 'in' ? '🧊休けい中' : r.brk && r.brk.phase === 'vent' ? '💨換気扇ルーム' : r.brk && r.brk.phase === 'out' ? '休けい（外）' : '休けいへ移動';
    if (r.path) return 'もどり中';
    return r.running ? '▶実行中' : '⏹停止中';
  }
  function refreshRobots() {
    const list = G.robots.map((r, i) => ({ r, i })).filter(o => o.r.base === curBase);
    if (!list.some(o => o.i === selRobot) && list.length) selRobot = list[0].i;
    const el = $('#robots');
    if (el.children.length !== list.length || el.dataset.b != curBase) {
      el.dataset.b = curBase;
      el.innerHTML = list.map(o => `<button class="rchip" data-i="${o.i}"><div class="nm"><span style="color:${UC.ROBOT_COLORS[o.i]}">●</span><span class="n"></span><span class="st"></span></div>
        <div class="bar"><i>体力</i><span><b class="hp" style="background:var(--hp)"></b></span><em class="hpv"></em></div>
        <div class="bar"><i>精神力</i><span><b class="mp" style="background:var(--mp)"></b></span><em class="mpv"></em></div></button>`).join('') || '<div class="note">この拠点にはちくわ君がいません（コンサルの「ちくわ君」から配置がえ）</div>';
      el.querySelectorAll('.rchip').forEach(b => b.onclick = () => { selRobot = +b.dataset.i; Snd.click(); if (nav) nav = navCalc(nav.x, nav.y); refreshRobots(); refreshCtrl(); });
    }
    el.querySelectorAll('.rchip').forEach(b => {
      const r = G.robots[+b.dataset.i];
      b.classList.toggle('on', +b.dataset.i === selRobot);
      b.querySelector('.n').textContent = r.name;
      b.querySelector('.st').textContent = modeText(r);
      b.querySelector('.hp').style.width = r.hp + '%'; b.querySelector('.hpv').textContent = Math.round(r.hp);
      b.querySelector('.mp').style.width = r.mp + '%'; b.querySelector('.mpv').textContent = Math.round(r.mp);
    });
  }
  function refreshBases() {
    const el = $('#bases');
    el.classList.toggle('hide', G.bases.length < 2);
    el.innerHTML = G.bases.map((b, i) => `<button data-i="${i}" class="${i === curBase ? 'on' : ''}">${esc(b.name)}（${b.w}×${b.h}）</button>`).join('');
    el.querySelectorAll('button').forEach(b => b.onclick = () => { curBase = +b.dataset.i; placing = null; nav = null; refreshAll(); });
  }
  function robot() { const r = G.robots[selRobot]; return r && r.base === curBase ? r : null; }
  function refreshCtrl() {
    const r = robot();
    $('#btnRun').classList.toggle('going', !!(r && r.running));
    $('#btnRun').textContent = r && r.running ? '実行中' : 'RUN';
    const canF = r && r.mode === 'break' && r.brk && (r.brk.phase === 'in' || r.brk.phase === 'out') && !r.path;
    $('#btnFridge').textContent = canF ? (r.brk.phase === 'in' ? '🧊 出す' : '🧊 入る') : '🧊 れいぞうこ';
    $('#btnFridge').classList.toggle('hot', !!canF);
    $('#placeBar').classList.toggle('hide', !placing);
    if (placing) $('#placeTx').textContent = `${UC.MACHINES[placing].name}${placing === 'curve' ? (placeHand === 'L' ? '・左曲がり' : '・右曲がり') : ''}（${UC.MACHINES[placing].cost}恋ン）をタップで置く`;
    $('#placeRot').textContent = '↻ 向き ' + ARROW[(lastDir + viewRot) % 4];
    $('#editBar').classList.toggle('hide', !edit);
    $('#btnEdit').classList.toggle('on', !!edit);
    if (edit) {
      const o = edit.sel;
      $('#editTx').textContent = !o ? '🔧 動かしたいきかいをタップ' : edit.moving ? `${UC.MACHINES[o.type].name}：うつす先のマスをタップ` : `${UC.MACHINES[o.type].name}（向き ${ARROW[(o.dir + viewRot) % 4]}）`;
      ['#edRot', '#edMove', '#edDel'].forEach(k => $(k).disabled = !o);
      $('#edMove').textContent = o ? `✥ 移動 ${moveCost(o)}恋ン` : '✥ 移動';
      $('#edMove').classList.toggle('on', !!edit.moving);
    }
    $('#placeUndo').disabled = !placedLog.length;
  }
  function refreshHud() {
    const b = G.bases[curBase];
    const next = b.kanban.find(k => k.got == null && k.t >= G.time);
    const ys = UC.spots(b, 'yard'), ss = UC.spots(b, 'src');
    const sum = l => l.reduce((n, o) => n + o.stock.length, 0);
    const ff = isFastForward(), nx = UC.nextLevel(b);
    const nextY = next && b.objs[next.yard] && ys.length > 1 ? `（ヤード${b.objs[next.yard].no}）` : '';
    $('#hudL').innerHTML = `🏭 Lv${b.lv} ${nx ? `累計 ${b.shipped}/${nx.need}個` : '（最大）'}<br>📋 次の集荷 ${next ? UC.fmtTime(next.t) + '・' + next.need + '個' + nextY : 'なし'}<br>🟨 出荷ヤード ${sum(ys)}個 ／ 取り場 ${sum(ss)}個<br>${demandTx()}`;
    const hs = speed === 0 ? '⏸ 時間停止中' : ff ? '⏩ はやおくり' : '';
    $('#hudR').innerHTML = hs;
    $('#hudR').style.display = hs ? '' : 'none';
  }
  function refreshAll() { refreshTop(); refreshBases(); refreshRobots(); refreshCtrl(); refreshHud(); }

  /* ---------- スピード ---------- */
  function setSpeed(s) {
    speed = s; document.querySelectorAll('#speed button').forEach(x => x.classList.toggle('on', +x.dataset.s === s));
    if (s > 0) $('#spdTip').classList.add('hide');
  }
  document.querySelectorAll('#speed button').forEach(b => b.onclick = () => setSpeed(+b.dataset.s));
  const isFastForward = () => G && G.robots.every(r => r.mode === 'off');

  /* ---------- 操作ボタン ---------- */
  $('#btnRun').onclick = () => {
    const r = robot(); if (!r) return;
    if (!r.prog.main.length) { toast('指示書がからっぽです。BUILD で作ろう'); return; }
    const badList = [['メイン', r.prog.main], ...r.prog.f.map((f, i) => ['F' + (i + 1), f])].find(([, l]) => !UC.loopPairs(l).ok);
    if (badList) { toast(badList[0] + 'のくり返し・場合わけの開始と終了が 1 対になっていません'); return; }
    UC.run(G, r); Snd.click(); CG.debug.add('run', { r: selRobot, n: r.prog.main.length });
    if (r.mode === 'off') toast('勤務時間になったら動きだします');
    refreshCtrl();
  };
  $('#btnStop').onclick = () => { const r = robot(); if (!r) return; UC.stop(G, r); Snd.ng(); CG.debug.add('stop', { r: selRobot }); refreshCtrl(); };
  $('#btnFridge').onclick = () => {
    const r = robot();
    if (r && UC.fridgeToggle(G, r)) { Snd.click(); refreshCtrl(); return; }
    toast('れいぞうこには休けい時間に自動で入ります');
  };
  $('#btnBuild').onclick = () => openBuild();
  $('#btnShop').onclick = () => openShop('machine');
  $('#btnShift').onclick = () => openShift();
  $('#btnKanban').onclick = () => openKanban();
  $('#btnSet').onclick = () => openSettings();
  $('#placeEnd').onclick = () => { placing = null; placedLog.length = 0; refreshCtrl(); };
  // 向きを回す：これから置くものと、いま置いたばかりのもの（まだ置いてある）をいっしょに回す
  $('#placeRot').onclick = () => {
    lastDir = (lastDir + 1) % 4;
    const e = placedLog[placedLog.length - 1];
    if (e && e.base === curBase && G.bases[e.base].objs[UC.key(e.x, e.y)] === e.o) { e.o.dir = lastDir; flash = { x: e.x, y: e.y, until: performance.now() + 400 }; UC.save(G); }
    Snd.click(); refreshCtrl();
  };

  /* ---------- 配置がえモード（置いたきかいの移動・撤去・90°回転） ---------- */
  let edit = null;   // { sel: 選んだきかい, moving: うつす先を待っている }
  $('#btnEdit').onclick = () => { edit = edit ? null : { sel: null, moving: false }; placing = null; nav = null; Snd.click(); refreshCtrl(); };
  $('#edEnd').onclick = () => { edit = null; refreshCtrl(); };
  $('#edRot').onclick = () => { const o = edit && edit.sel; if (!o) return; o.dir = (o.dir + 1) % 4; lastDir = o.dir; Snd.click(); UC.save(G); refreshCtrl(); };
  $('#edMove').onclick = () => { if (edit && edit.sel) { edit.moving = !edit.moving; Snd.click(); refreshCtrl(); } };
  $('#edDel').onclick = () => {
    const o = edit && edit.sel; if (!o) return;
    if (o.item || (o.stock && o.stock.length)) { toast('製品がのっているので撤去できません'); return; }
    const b = G.bases[curBase], back = Math.floor(UC.MACHINES[o.type].cost / 2);
    delete b.objs[UC.key(o.x, o.y)]; G.coin += back; edit.sel = null; edit.moving = false;
    Snd.put(); toast(`撤去しました（${back}恋ン もどった）`); UC.save(G); refreshTop(); refreshCtrl();
  };
  /* 置いたきかいの移動の代金 */
  const moveCost = o => Math.max(CFG.moveCostMin, Math.ceil(UC.MACHINES[o.type].cost * CFG.moveCostRate));
  function editTap(x, y) {
    const b = G.bases[curBase], o = b.objs[UC.key(x, y)];
    if (edit.moving && edit.sel) {
      const s = edit.sel;
      if (o === s) { edit.moving = false; refreshCtrl(); return; }
      if (!UC.canPlace(G, curBase, x, y)) { toast('そこにはうつせません'); return; }
      const mc = moveCost(s);
      if (G.coin < mc) { toast(`恋ンが足りません（移動は ${mc}恋ン）`); return; }
      G.coin -= mc; refreshTop(); toast(`移動しました（${mc}恋ン）`);
      delete b.objs[UC.key(s.x, s.y)]; s.x = x; s.y = y; b.objs[UC.key(x, y)] = s; delete b.coins[UC.key(x, y)];
      edit.moving = false; flash = { x, y, until: performance.now() + 500 };
      if (s.feed) s.feed = null;   // 動かしたら製造ラインからはずれる
      Snd.put(); UC.save(G); refreshCtrl(); askLine(b, s); return;
    }
    // 取り場・出荷ヤード・れいぞうこ・コンピュータは動かせない
    edit.sel = o && UC.MACHINES[o.type] ? o : null;
    if (o && !edit.sel) toast('これは動かせません');
    Snd.click(); refreshCtrl();
  }
  /* 取り消し：置いたきかいを新しい順に 1 つずつもどす（払った恋ンは全部もどる。製品がのっているものはもどせない） */
  const placedLog = [];
  $('#placeUndo').onclick = () => {
    while (placedLog.length) {
      const e = placedLog.pop(), b = G.bases[e.base], k = UC.key(e.x, e.y);
      if (b.objs[k] !== e.o) continue;   // もう撤去したもの
      if (e.o.item || (e.o.stock && e.o.stock.length)) { toast('製品がのっているので取り消せません'); placedLog.push(e); return; }
      delete b.objs[k]; G.coin += e.cost; Snd.put(); UC.save(G); refreshTop(); refreshCtrl();
      return;
    }
    refreshCtrl();
  };

  /* ---------- 指示書（BUILD） ---------- */
  let buildOpen = false, bTab = 'main', bSel = -1;
  function progList(r) { return bTab === 'main' ? r.prog.main : r.prog.f[+bTab]; }
  function openBuild() {
    const r = robot();
    if (!r) { toast('ちくわ君を選んでください'); return; }
    buildOpen = true; bSel = -1;
    openModal('指示書をつくる：' + r.name, '<div id="bWrap"></div>');
    drawBuild();
  }
  function drawBuild() {
    const r = robot(); if (!r) return;
    const list = progList(r), max = bTab === 'main' ? UC.MAIN_MAX : UC.FUNC_MAX;
    // ファンクションのタブでは、停止のピースは「ファンクション終了」（呼んだところへもどる）
    const fend = bTab !== 'main', stopIcon = fend ? '⏎' : UC.PIECES.stop.icon, stopName = fend ? 'F' + (+bTab + 1) + ' 終了' : UC.PIECES.stop.name;
    const pc = (v, i) => {
      const k = UC.pieceKey(v), P = UC.PIECES[k], n = UC.pieceArg(v);
      const ln = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯'[(lp.no[i] || 1) - 1] || '';
      const ca = String(v).split(':')[1] || 'hold', cneg = ca[0] === '!', cd = UC.CONDS.find(c => c.id === ca.replace('!', ''));
      const nm = k === 'fwd' ? (n ? `${n}歩進む` : 'ぶつかるまで') : k === 'loop' ? `${ln}${n ? n + '回' : 'ずっと'}` : k === 'end' || k === 'endif' ? `${ln}おわり` : k === 'if' ? `${ln}${cneg ? '✕' : ''}${cd ? cd.s : '?'}` : k === 'stop' ? stopName : P.name;
      return `<button class="piece${k === 'stop' ? ' stop' : ''}${lp.bad[i] ? ' bad' : ''}" data-i="${i}" style="--c:${P.col}"><span class="no">${i + 1}</span><span>${k === 'stop' ? stopIcon : P.icon}</span><small>${nm}</small></button>`;
    };
    const lp = UC.loopPairs(list);
    const selK = bSel >= 0 ? UC.pieceKey(list[bSel]) : '';
    // ピースがはまる場所の左端は「起動」（右に出っぱり）。ファンクションは呼ばれたところから始まる
    const head = `<div class="piece start" style="--c:#2E8B57"><span>▶</span><small>${bTab === 'main' ? '起動' : 'F' + (+bTab + 1) + ' はじめ'}</small></div>`;
    const tabs = [['main', 'メイン'], ['0', 'F1'], ['1', 'F2'], ['2', 'F3']];
    $('#bWrap').innerHTML = `
      <div class="tabs">${tabs.map(([k, n]) => `<button data-t="${k}" class="${bTab === k ? 'on' : ''}">${n}${k !== 'main' && r.prog.f[+k].length ? '・' + r.prog.f[+k].length : ''}</button>`).join('')}</div>
      <div class="cnt">${bTab === 'main' ? 'メイン指示書（最後まで行くと止まる）' : 'ファンクション ' + tabs.find(t => t[0] === bTab)[1] + '（メインから呼び出す）'}　${list.length}/${max}</div>
      <div class="prog" id="bProg">${head}${list.length ? list.map((k, i) => pc(k, i)).join('') : '<span class="empty">下のピースをタップしてつなげよう</span>'}</div>
      ${lp.ok ? '' : '<div class="steps" style="background:#FBE3E0">⚠ くり返し・場合わけの開始と終了が 1 対になっていません（赤い枠のピース）。このままでは RUN できません</div>'}
      ${selK === 'if' ? (() => { const a = String(list[bSel]).split(':')[1] || 'hold', neg = a[0] === '!', id = a.replace('!', ''); const gs = [...new Set(UC.CONDS.map(c => c.g))];
        return `<div class="steps" style="flex-wrap:wrap">${bSel + 1}番の場合わけ：<select id="bIf">${gs.map(g => `<optgroup label="${g}">${UC.CONDS.filter(c => c.g === g).map(c => `<option value="${c.id}" ${c.id === id ? 'selected' : ''}>${c.name}</option>`).join('')}</optgroup>`).join('')}</select>
        <select id="bIfNeg"><option value="">とき</option><option value="!" ${neg ? 'selected' : ''}>じゃないとき</option></select></div>`; })() : ''}
      ${selK === 'loop' ? `<div class="steps">${bSel + 1}番のくり返し：<select id="bLoop">${Array.from({ length: UC.LOOP_MAX }, (_, n) => n === 1 ? '' : `<option value="${n}" ${UC.pieceArg(list[bSel]) === n ? 'selected' : ''}>${n ? n + '回' : 'ずっと'}</option>`).join('')}</select></div>` : ''}
      ${selK === 'fwd' ? `<div class="steps">${bSel + 1}番の進む：<select id="bSteps">${Array.from({ length: UC.FWD_MAX + 1 }, (_, n) => `<option value="${n}" ${UC.pieceArg(list[bSel]) === n ? 'selected' : ''}>${n ? n + '歩' : 'ぶつかるまで'}</option>`).join('')}</select></div>` : ''}
      <div class="edrow"><button id="bL">◀ 前へ</button><button id="bR">後ろへ ▶</button><button id="bDel">けす</button><button id="bClr">ぜんぶけす</button></div>
      <div class="cnt">✌ 指示ピース（タップで${bSel >= 0 ? (bSel + 1) + '番のうしろに' : '最後に'}つなぐ。${fend ? '⏎ ファンクション終了は、呼んだところへもどる。右にへこみがないので最後だけ' : '■停止は右にへこみがないので最後だけ'}）</div>
      <div class="palette" id="bPal">${Object.keys(UC.PIECES).filter(k => !UC.PIECES[k].old).map(k => `<button class="piece${k === 'stop' ? ' stop' : ''}" data-k="${k}" style="--c:${UC.PIECES[k].col}"><span>${k === 'stop' ? stopIcon : UC.PIECES[k].icon}</span><small>${k === 'stop' ? stopName : UC.PIECES[k].name}</small><span class="pz">✌</span></button>`).join('')}</div>
      <div class="row" style="margin-top:14px"><button class="cbtn run" id="bRun">RUN してとじる</button></div>`;
    $('#bWrap').querySelectorAll('.tabs button').forEach(b => b.onclick = () => { bTab = b.dataset.t; bSel = -1; drawBuild(); });
    $('#bProg').querySelectorAll('.piece[data-i]').forEach(b => b.onclick = () => { const i = +b.dataset.i; bSel = bSel === i ? -1 : i; drawBuild(); });
    const st = $('#bSteps');
    if (st) st.onchange = () => { list[bSel] = +st.value ? 'fwd:' + st.value : 'fwd'; Snd.click(); edited(r); drawBuild(); };
    const lsel = $('#bLoop');
    if (lsel) lsel.onchange = () => { list[bSel] = 'loop:' + lsel.value; Snd.click(); edited(r); drawBuild(); };
    const isel = $('#bIf'), ineg = $('#bIfNeg');
    if (isel) isel.onchange = ineg.onchange = () => { list[bSel] = 'if:' + ineg.value + isel.value; Snd.click(); edited(r); drawBuild(); };
    // 停止は右にへこみがないので、いちばん最後にしか置けない（うしろに何もつなげない）
    const stopOk = l => { const i = l.indexOf('stop'); return i < 0 || (i === l.length - 1 && l.lastIndexOf('stop') === i); };
    $('#bPal').querySelectorAll('.piece').forEach(b => b.onclick = () => {
      if (list.length >= max) { toast('これ以上ならべられません'); return; }
      const k = b.dataset.k;
      const at = k === 'stop' ? list.length : (bSel >= 0 ? bSel + 1 : list.length);
      const v = k === 'loop' ? 'loop:2' : k === 'if' ? 'if:hold' : k;   // くり返しは 2 回から、場合わけは「持っているとき」から
      const next = list.slice(); next.splice(at, 0, v);
      if (!stopOk(next)) { toast(k === 'stop' ? stopName + 'はひとつだけです' : stopName + 'のうしろにはつなげません'); return; }
      list.splice(at, 0, v); bSel = at;
      Snd.click(); edited(r); drawBuild();
    });
    const swap = (i, j) => { const next = list.slice(); [next[i], next[j]] = [next[j], next[i]]; if (!stopOk(next)) { toast(stopName + 'は最後から動かせません'); return false; } [list[i], list[j]] = [list[j], list[i]]; return true; };
    $('#bL').onclick = () => { if (bSel > 0 && swap(bSel - 1, bSel)) { bSel--; edited(r); drawBuild(); } };
    $('#bR').onclick = () => { if (bSel >= 0 && bSel < list.length - 1 && swap(bSel + 1, bSel)) { bSel++; edited(r); drawBuild(); } };
    $('#bDel').onclick = () => { if (bSel >= 0) { list.splice(bSel, 1); bSel = Math.min(bSel, list.length - 1); edited(r); drawBuild(); } };
    $('#bClr').onclick = () => { if (list.length && confirm('このタブのピースをぜんぶけしますか？')) { list.length = 0; bSel = -1; edited(r); drawBuild(); } };
    $('#bRun').onclick = () => { closeModal(); $('#btnRun').onclick(); };
    markNow();
  }
  /* 指示書を変えたら、実行中のものはとめる（読みかけの番号がずれるため） */
  function edited(r) { if (r.running) { UC.stop(G, r); toast('指示書を変えたので停止しました'); refreshCtrl(); } }
  function markNow() {
    if (!buildOpen) return;
    const r = robot(); if (!r) return;
    const cur = r.running && r.cur && String(r.cur.w) === bTab ? r.cur.ip : -1;
    document.querySelectorAll('#bProg .piece').forEach(b => b.classList.toggle('now', +b.dataset.i === cur));
    document.querySelectorAll('#bProg .piece').forEach(b => b.classList.toggle('sel', +b.dataset.i === bSel));
  }

  /* ---------- お店 ---------- */
  let shopTab = 'machine';
  function openShop(tab) {
    shopTab = tab || shopTab;
    openModal('コンサル（社長のポケットマネー）', '<div id="sWrap"></div>');
    drawShop();
  }
  function drawShop() {
    const tabs = [['machine', 'きかい'], ['welfare', '福利厚生'], ['robot', 'ちくわ君'], ['base', '拠点']];
    const c = UC.cal(G.time), weekday = c.wd < 5;
    const row = (name, desc, cost, act, dis, label) => `<div class="item"><div class="tx"><b>${name}</b><small>${desc}</small></div><button data-a="${act}" ${dis || G.coin < cost ? 'disabled' : ''}>${label || cost.toLocaleString() + '恋ン'}</button></div>`;
    let h = `<div class="cnt">💰 ${Math.floor(G.coin).toLocaleString()}恋ン ／ ${esc(G.bases[curBase].name)}</div><div class="tabs">${tabs.map(([k, n]) => `<button data-t="${k}" class="${shopTab === k ? 'on' : ''}">${n}</button>`).join('')}</div>`;
    const b = G.bases[curBase];
    if (shopTab === 'machine') {
      h += '<div class="note">買うと、工場のマスをタップして置けます（続けて置ける）。置いたきかいはタップで回す・撤去・アップグレード。</div>';
      for (const k in UC.MACHINES) if (!UC.MACHINES[k].welfare) {
        if (k === 'curve') { const m = UC.MACHINES[k]; h += `<div class="item"><div class="tx"><b>${m.name}</b><small>${m.desc}</small></div><div class="bb"><button data-a="place:curve-R" ${G.coin < m.cost ? 'disabled' : ''}>右曲がり ${m.cost}恋ン</button><button data-a="place:curve-L" ${G.coin < m.cost ? 'disabled' : ''}>左曲がり ${m.cost}恋ン</button></div></div>`; continue; }
        h += row(UC.MACHINES[k].name, UC.MACHINES[k].desc, UC.MACHINES[k].cost, 'place:' + k, false, '置く ' + UC.MACHINES[k].cost + '恋ン');
      }
      h += '<h3 style="font-size:14px;margin:14px 0 2px">アップグレード（' + esc(b.name) + '）</h3>';
      for (const k in UC.UPG) { const lv = b.upg[k], cost = UC.UPG[k].costs[lv]; h += row(`${UC.UPG[k].name} Lv${lv}`, UC.UPG[k].desc, cost || 0, 'upg:' + k, cost == null, cost == null ? 'MAX' : null); }
    }
    if (shopTab === 'welfare') {
      h += '<div class="note">継続するものは工場に置きます。暖房・クーラーはちくわ君の「操作する」でスイッチオン。換気扇ルームは休けいのとき入室します。</div>';
      for (const k in UC.MACHINES) if (UC.MACHINES[k].welfare) h += row(UC.MACHINES[k].name + '（継続）', UC.MACHINES[k].desc, UC.MACHINES[k].cost, 'place:' + k, false, '置く ' + UC.MACHINES[k].cost + '恋ン');
      h += row('飲み会（スポット）', UC.SPOTS.nomikai.desc, UC.SPOTS.nomikai.cost, 'spot:nomikai', !weekday);
      h += row('BBQ（スポット）', UC.SPOTS.bbq.desc, UC.SPOTS.bbq.cost, 'spot:bbq', weekday);
      h += row('社員旅行（スポット）', UC.SPOTS.ryoko.desc, UC.SPOTS.ryoko.cost, 'spot:ryoko', G.time < G.travelUntil);
    }
    if (shopTab === 'robot') {
      const r = robot();
      if (r) {
        h += `<div class="cnt">${esc(r.name)}　体力 ${Math.round(r.hp)} ／ 精神力 ${Math.round(r.mp)}</div>`;
        h += row('有給', UC.CARE.yukyu.desc, UC.CARE.yukyu.cost, 'care:yukyu');
        h += row('すり身部品', UC.CARE.surimi.desc, UC.CARE.surimi.cost, 'care:surimi', !r.injured);
        if (G.bases.length > 1) h += `<div class="item"><div class="tx"><b>配置がえ</b><small>別の拠点へうつす（指示書はそのまま・停止する）</small></div><select id="mvSel">${G.bases.map((bb, i) => `<option value="${i}" ${i === r.base ? 'selected' : ''}>${esc(bb.name)}</option>`).join('')}</select></div>`;
      }
      h += '<h3 style="font-size:14px;margin:14px 0 2px">能力アップ（全員）</h3>';
      for (const k in UC.ABIL) { const lv = G.abil[k], cost = UC.ABIL[k].costs[lv]; h += row(`${UC.ABIL[k].name} Lv${lv}`, UC.ABIL[k].desc, cost || 0, 'abil:' + k, cost == null, cost == null ? 'MAX' : null); }
      const n = G.robots.length;
      h += row(`ちくわ君ロボの増設（${n}/${UC.ROBOT_MAX}台）`, 'ほんしゃに 1 台ふえる', UC.ROBOT_COST[n] || 0, 'robot', n >= UC.ROBOT_MAX, n >= UC.ROBOT_MAX ? 'MAX' : null);
    }
    if (shopTab === 'base') {
      h += `<div class="note">拠点のレベルは、その拠点の累計集荷数で上がります（50・100・300・500・1000・1500・2000個）。上がると取り場・出荷ヤードが増え、レベル5からヤードに製品指定がつきます。いまの${esc(G.bases[curBase].name)}：レベル${G.bases[curBase].lv}（最大${UC.maxLv(G.bases[curBase])}）</div>`;
      h += '<div class="note">拠点を増やすと、その拠点の取り場と出荷ヤードはランダムな場所にできます（取り場から離れた所）。ちくわ君は「ちくわ君」タブの配置がえでうつします。</div>';
      UC.SIZES.forEach((s, i) => { h += row('拠点の追加：' + s.name, `${s.w}×${s.h}マス・レベル${s.maxLv}まで`, s.cost, 'base:' + i); });
    }
    $('#sWrap').innerHTML = h;
    $('#sWrap').querySelectorAll('.tabs button').forEach(x => x.onclick = () => { shopTab = x.dataset.t; drawShop(); });
    const mv = $('#mvSel');
    if (mv) mv.onchange = () => { const r = robot(); if (UC.moveRobot(G, r, +mv.value)) { curBase = +mv.value; toast(r.name + 'を配置がえしました'); refreshAll(); drawShop(); } };
    $('#sWrap').querySelectorAll('button[data-a]').forEach(x => x.onclick = () => buy(x.dataset.a));
  }
  function buy(a) {
    const [k, v] = a.split(':'), b = G.bases[curBase], r = robot();
    const pay = c => { if (G.coin < c) { toast('恋ンが足りません'); return false; } G.coin -= c; Snd.coin(); return true; };
    CG.debug.add('buy', { a });
    if (k === 'place') { const [m, hd] = v.split('-'); placing = m; placeHand = hd || 'R'; edit = null; closeModal(); refreshCtrl(); return; }
    if (k === 'upg') { const c = UC.UPG[v].costs[b.upg[v]]; if (c != null && pay(c)) b.upg[v]++; }
    if (k === 'abil') { const c = UC.ABIL[v].costs[G.abil[v]]; if (c != null && pay(c)) G.abil[v]++; }
    if (k === 'care' && r) {
      if (v === 'yukyu' && pay(UC.CARE.yukyu.cost)) { r.mp = Math.min(100, r.mp + 35); if (r.sulk && r.mp >= 20) { r.sulk = false; r.bub = null; } toast(r.name + 'が有給でリフレッシュ！'); }
      if (v === 'surimi' && r.injured && pay(UC.CARE.surimi.cost)) { r.injured = false; r.hp = 60; r.bub = null; toast(r.name + 'の怪我がなおった！'); }
    }
    if (k === 'spot') {
      const all = G.robots;
      if (v === 'nomikai' && pay(UC.SPOTS.nomikai.cost)) { all.forEach(x => x.hp = Math.min(100, x.hp + 10)); toast('飲み会で体力 +10'); }
      if (v === 'bbq' && pay(UC.SPOTS.bbq.cost)) { all.forEach(x => x.hp = Math.min(100, x.hp + 10)); toast('BBQ で体力 +10'); }
      if (v === 'ryoko' && pay(UC.SPOTS.ryoko.cost)) {
        const c = UC.cal(G.time);
        G.travelUntil = (c.mi + 1) * 7 * 1440 + 8 * 60;
        all.forEach(x => { x.hp = Math.min(100, x.hp + 50); x.mp = Math.min(100, x.mp + 50); UC.stop(G, x); });
        G.bases.forEach(bb => bb.kanban = []);
        toast('社員旅行へ出発！ 来月まで工場はお休み');
      }
    }
    if (k === 'robot') { const e = UC.buyRobot(G); if (e) toast(e); else { Snd.ok(); toast('ちくわ君ロボがふえた！'); curBase = 0; selRobot = G.robots.length - 1; } }
    if (k === 'base') { const e = UC.buyBase(G, +v); if (e) toast(e); else { Snd.ok(); curBase = G.bases.length - 1; toast('新しい拠点ができた！'); } }
    UC.save(G); refreshAll(); drawShop();
  }

  /* ---------- シフト ---------- */
  function openShift() {
    openModal('シフト管理', '<div id="shWrap"></div>');
    drawShift();
  }
  function drawShift() {
    let h = '<div class="note">シフトを変えると、その日の集荷の予定は次の日から変わります。2交代は月ごとに昼夜が入れかわり、3交代は毎月ちがう直に入ります。</div>';
    G.robots.forEach((r, i) => {
      const w = UC.nextWindow(r, G.time);
      h += `<div class="item" style="display:block"><b>${esc(r.name)}</b>（${esc(G.bases[r.base].name)}）
        <div class="seg" style="margin:6px 0">${Object.keys(UC.SHIFTS).map(k => `<button data-r="${i}" data-s="${k}" class="${r.shift.type === k ? 'on' : ''}">${UC.SHIFTS[k].name}</button>`).join('')}</div>
        <small>${UC.SHIFTS[r.shift.type].desc}／月ごとの精神力 ${UC.SHIFTS[r.shift.type].monthMp}</small>
        ${r.shift.type !== 'teiji' ? `<div class="seg" style="margin-top:6px">${UC.SHIFTS[r.shift.type].slots.map((s, j) => `<button data-r="${i}" data-slot="${j}" class="${r.shift.slot === j ? 'on' : ''}">今月 ${j + 1}直スタート</button>`).join('')}</div>` : ''}
        <div style="font-size:12px;margin-top:4px">次の勤務：${w ? `${UC.cal(w.start).month}月${UC.cal(w.start).date}日 ${UC.fmtTime(w.start)}〜${UC.fmtTime(w.end)}（休けい ${UC.fmtTime(w.bs)}〜${UC.fmtTime(w.be)}）` : 'なし'}</div></div>`;
    });
    $('#shWrap').innerHTML = h;
    $('#shWrap').querySelectorAll('button[data-s]').forEach(b => b.onclick = () => { const r = G.robots[+b.dataset.r]; r.shift.type = b.dataset.s; r.shift.slot = 0; Snd.click(); CG.debug.add('shift', { r: +b.dataset.r, s: b.dataset.s }); drawShift(); refreshRobots(); });
    $('#shWrap').querySelectorAll('button[data-slot]').forEach(b => b.onclick = () => {
      const r = G.robots[+b.dataset.r], mi = UC.cal(G.time).mi, n = UC.SHIFTS[r.shift.type].slots.length;
      // 「今月この直」になるよう、月で回る分を引いておく
      r.shift.slot = ((+b.dataset.slot - mi) % n + n) % n; Snd.click(); drawShift(); refreshRobots();
    });
  }

  /* ---------- 好景気・不景気のカットイン ---------- */
  let cutT = 0;
  function cutin(ph) {
    if (ph === 'avg') { toast('📊 景気はおちついてきた（平均周期）'); return; }
    const el = $('#cutin'), up = ph === 'up';
    el.className = up ? 'up' : 'down';
    el.querySelector('.ci-ic').textContent = up ? '📈💰📈' : '📉☔📉';
    el.querySelector('.ci-big').textContent = up ? '好景気到来！' : '不景気…';
    el.querySelector('.ci-sm').textContent = up ? '製品の需要がどんどん増えていく！（上昇周期）' : '製品の需要がへっていく…（下落周期）';
    up ? Snd.ok() : Snd.ng();
    clearTimeout(cutT); cutT = setTimeout(() => el.classList.add('hide'), 2800);
  }
  $('#cutin').onclick = () => $('#cutin').classList.add('hide');

  /* ---------- 製品の需要（日経平均株価のような動き） ---------- */
  const MONTH_NOTE = { 3: '年度末', 8: 'お盆', 11: '年末前', 12: '年末の繁忙期', 1: '年明け' };
  const WEEK_NAME = ['月', '火', '水', '木', '金', '土', '日'];
  function demandTx() {
    const dm = G.demand || { v: 100 }, d = dm.prev ? (dm.v / dm.prev - 1) * 100 : 0;
    return `📈 需要 ${dm.v.toFixed(1)}（${d >= 0 ? '+' : ''}${d.toFixed(1)}%）・${{ avg: '平均', up: '好景気', down: '不景気' }[UC.economy(UC.cal(G.time).day).phase]}`;
  }
  /* 需要の折れ線（直近 28 日） */
  function demandChart(h) {
    if (!h || h.length < 2) return '<div class="cnt">（グラフは明日から出ます）</div>';
    const W = 300, H = 70, lo = Math.min(...h) - 2, hi = Math.max(...h) + 2;
    const pt = (v, i) => `${(i / (h.length - 1) * W).toFixed(1)},${(H - (v - lo) / (hi - lo) * H).toFixed(1)}`;
    const y100 = H - (100 - lo) / (hi - lo) * H, up = h[h.length - 1] >= h[0];
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:80px;background:#FFF8EA;border-radius:8px">
      ${y100 > 0 && y100 < H ? `<line x1="0" x2="${W}" y1="${y100}" y2="${y100}" stroke="#C9B48F" stroke-dasharray="4 3"/>` : ''}
      <polyline fill="none" stroke="${up ? '#D9534F' : '#2E7D5B'}" stroke-width="2" points="${h.map(pt).join(' ')}"/></svg>`;
  }

  /* ---------- かんばん ---------- */
  function openKanban() {
    const b = G.bases[curBase];
    const ys = UC.spots(b, 'yard'), nx = UC.nextLevel(b), L = UC.levelOf(b);
    const up = b.kanban.filter(k => k.got == null);
    const yname = k => { const y = b.objs[k.yard]; return y && y.type === 'yard' ? yardName(y) : 'ヤード1'; };
    let h = `<div class="note">コンピュータで受け取った、${esc(b.name)}の集荷の予定です（出荷ヤードごと）。時刻にヤードの製品が個数に足りないと、ちくわ君の精神力がへり、足りなかった数は次の集荷に上乗せされます。梱包ずみの製品は高く売れます。製品指定のあるヤードには、その製品しか置けません。</div>
      <div class="cnt">🏭 レベル ${b.lv}（最大 ${UC.maxLv(b)}）：累計集荷 ${b.shipped}個${nx ? `／次のレベルまで あと ${nx.need - b.shipped}個（レベル${nx.lv}：取り場${nx.src}・ヤード${nx.yard}${nx.spec === 'all' ? '・製品指定あり' : nx.spec === 'mix' ? '・製品指定あり／なし' : ''}）` : '（この拠点の最大です）'}</div>
      <div class="cnt">いまの出荷ヤード：${ys.map(y => `${yardName(y)} ${y.stock.length}個`).join('／')}</div>
      <h3 style="font-size:14px;margin:10px 0 4px">${demandTx()}</h3>
      ${demandChart(G.demand && G.demand.hist)}
      ${(() => { const c = UC.cal(G.time), e = UC.economy(c.day), cy = UC.CFG.demand.cycle; return `<div class="cnt">景気：<b>${UC.PHASE_NAME[e.phase]}</b>（あと約 ${Math.ceil(e.left / 7)}か月）。景気は 10 年で 1 周します：${cy.map(p => `${UC.PHASE_NAME[p.id].replace(/（.*）/, '')} ${p.years}年（年 ${p.rate >= 0 ? '+' : ''}${Math.round(p.rate * 100)}%）`).join(' → ')}。日経平均株価の過去の値動きをもとにしています。</div>`; })()}
      ${(() => { const c = UC.cal(G.time), D = UC.CFG.demand; return `<div class="cnt">集荷の個数 ＝ もとの個数 × 需要 ${(G.demand.v / 100).toFixed(2)} × ${c.month}月 ${D.month[c.month - 1]}${MONTH_NOTE[c.month] ? '（' + MONTH_NOTE[c.month] + '）' : ''} × ${WEEK_NAME[c.wd]}曜 ${D.week[c.wd]}。需要は日経平均株価のように毎日動きます（点線が 100＝平年なみ）。</div>`; })()}
      <h3 style="font-size:14px;margin:10px 0 4px">これからの集荷</h3>`;
    h += up.length ? `<table class="kb"><tr><th>時刻</th><th>ヤード</th><th>個数</th></tr>${up.map(k => { const c = UC.cal(k.t); return `<tr><td>${c.month}/${c.date} ${UC.fmtTime(k.t)}</td><td>${esc(yname(k))}</td><td>${k.need}個${k.carry ? `<small>（上乗せ${k.carry}）</small>` : ''}</td></tr>`; }).join('')}</table>` : '<div class="cnt">きょうの予定はありません（勤務日の 0:00 に届きます）</div>';
    h += '<h3 style="font-size:14px;margin:14px 0 4px">これまでの集荷</h3>';
    h += b.log.length ? `<table class="kb"><tr><th>時刻</th><th>ヤード</th><th>結果</th><th>売上</th></tr>${b.log.map(l => { const c = UC.cal(l.t); return `<tr><td>${c.month}/${c.date} ${UC.fmtTime(l.t)}</td><td>${l.yard || 1}</td><td class="${l.got >= l.need ? 'ok' : 'ng'}">${l.got}/${l.need}個</td><td>+${l.earn}</td></tr>`; }).join('')}</table>` : '<div class="cnt">まだありません</div>';
    h += `<div class="cnt" style="margin-top:10px">これまでの出荷 ${G.stats.shipped}個 ／ 売上 ${G.stats.earned.toLocaleString()}恋ン ／ 拾った恋ン ${G.stats.coins.toLocaleString()}</div>`;
    openModal('📋 かんばん', h);
  }

  /* ---------- 調べる（マスをタップ） ---------- */
  const OBJ_NAME = { src: '取り場（製造ラインの終点）', yard: '出荷ヤード', fridge: 'れいぞうこ', pc: 'コンピュータ' };
  const yardName = y => 'ヤード' + (y.no || 1) + (y.spec != null ? '（' + UC.PRODUCTS[y.spec].name + '指定）' : '');
  function objName(o) {
    const b = G.bases[curBase];
    if (o.type === 'src') return '取り場' + (UC.spots(b, 'src').length > 1 ? o.no : '') + '（製造ラインの終点）';
    if (o.type === 'yard') return '出荷' + yardName(o);
    return OBJ_NAME[o.type] || UC.MACHINES[o.type].name;
  }
  /* ---------- ナビ（オブジェクトまでの最短ルート） ---------- */
  let nav = null;   // { base, x, y, tiles, lines }
  const REL = ['まっすぐ', '右を向いて', 'うしろを向いて', '左を向いて'];
  const REL_END = ['', '右を向く', 'うしろを向く', '左を向く'];
  const REL_PIECE = ['', '↷', '⟲', '↶'];
  function navCalc(x, y) {
    const b = G.bases[curBase], r = robot(), o = b.objs[UC.key(x, y)];
    if (!r || !o) return null;
    const rx = Math.round(r.x), ry = Math.round(r.y);
    const adj = (a, c) => Math.abs(a - x) + Math.abs(c - y) === 1;
    const path = adj(rx, ry) ? [] : UC.findPath(b, rx, ry, adj);
    const name = objName(o);
    if (!path) return { base: curBase, x, y, tiles: [], lines: [name, 'ここからは とどきません'] };
    // 同じ向きに続く歩みをまとめて「〜を向いて N 歩」にする（ちくわ君の向きから見た左右）
    let dir = r.dir, px = rx, py = ry;
    const segs = [];
    for (const [nx, ny] of path) {
      const d = UC.DX.findIndex((dx, k) => dx === nx - px && UC.DY[k] === ny - py);
      if (segs.length && segs[segs.length - 1].d === d) segs[segs.length - 1].n++;
      else segs.push({ d, n: 1, rel: (d - dir + 4) % 4 });
      dir = d; px = nx; py = ny;
    }
    const fd = UC.DX.findIndex((dx, k) => dx === x - px && UC.DY[k] === y - py), fr = (fd - dir + 4) % 4;
    const lines = [name + 'まで ' + path.length + '歩'];
    segs.forEach(sg => lines.push(`${REL[sg.rel]} ${sg.n}歩`));
    if (fr) lines.push(REL_END[fr]);
    if (!path.length && !fr) lines.push('もう目の前です');
    const pcs = segs.map(sg => (REL_PIECE[sg.rel] || '') + '⬆' + sg.n).join(' ') + (fr ? ' ' + REL_PIECE[fr] : '');
    if (pcs.trim()) lines.push('ピース：' + pcs.trim());
    return { base: curBase, x, y, tiles: path, lines };
  }
  function inspect(x, y) {
    const b = G.bases[curBase], o = b.objs[UC.key(x, y)];
    const rb = G.robots.findIndex(r => r.base === curBase && Math.round(r.x) === x && Math.round(r.y) === y && !UC.inFridge(r));
    if (rb >= 0) { selRobot = rb; nav = null; refreshRobots(); refreshCtrl(); Snd.click(); return; }
    if (!o) { nav = null; return; }
    // 1 回目のタップはルートとナビ。同じものをもう一度タップすると、くわしく調べる
    if (!nav || nav.x !== x || nav.y !== y || nav.base !== curBase) {
      nav = navCalc(x, y);
      if (!nav) { if (!robot()) toast('ちくわ君を選ぶと、そこまでの道順を出します'); else return; }
      else { Snd.click(); return; }
    }
    nav = null;
    panel(x, y);
  }
  /* くわしく調べる画面（きかいの設定・回す・移動・撤去） */
  function panel(x, y) {
    const b = G.bases[curBase], o = b.objs[UC.key(x, y)];
    if (!o) return;
    const name = objName(o);
    const pname = p => p ? (p.packed ? '📦梱包ずみ' : '') + UC.PRODUCTS[p.t].name : 'なし';
    let h = '';
    if (o.type === 'src') h += `<p>製品が ${o.stock.length}/${CFG.srcMax}個 たまっています。勤務中、${Math.round(CFG.produceEvery / UC.levelOf(b).prod)}分ごとに1個できます。前に立って「持つ」で取れます。</p>`;
    if (o.type === 'yard') h += `<p>製品 ${o.stock.length}個。集荷の時刻にトラックが持っていきます。前に立って「置く」、またはコンベアで運びこめます。${o.spec != null ? `<b>${UC.PRODUCTS[o.spec].name}</b>しか置けません。` : ''}</p>`;
    if (o.type === 'fridge') h += '<p>休けい時間に、ちくわ君が自動で入って体力と精神力を回復します。</p>';
    if (o.type === 'pc') h += '<p>集荷の予定（かんばん）を受け取ります。</p>';
    if (UC.MACHINES[o.type]) h += `<p>${UC.MACHINES[o.type].desc}</p>`;
    if (UC.BELTS.includes(o.type) || o.type === 'pack') h += `<p>のっている製品：${pname(o.item)}</p>`;
    const lsrc = UC.BELTS.includes(o.type) && UC.srcNear(b, o.x, o.y), lon = !!UC.feedOf(b, o);
    if (lsrc) h += `<div class="item"><div class="tx"><b>製造ライン</b><small>${lon ? objName(UC.feedOf(b, o)) + 'に接続中。製品が自動で流れてきます' : '接続していません'}</small></div><button id="iLine">${lon ? 'はずす' : '接続する'}</button></div>`;
    if (o.type === 'src') { const n = Object.values(b.objs).filter(v => UC.feedOf(b, v) === o).length; if (n) h += `<p>製造ラインに接続したコンベア：${n}本。製品は自動でコンベアへ流れます。</p>`; }
    if (o.type === 'pool') h += `<p>製品 ${o.stock.length}/${UC.poolCap(b)}個</p>`;
    if ('on' in o) h += `<p>スイッチ：<b>${o.on ? 'オン' : 'オフ'}</b>（ちくわ君の「操作する」で切りかえ）</p>`;
    if (o.type === 'curve') h += `<p>${o.hand === 'L' ? '左曲がり' : '右曲がり'}（${o.hand === 'L' ? '左' : '右'}横から入って、矢印の向きへ出る。右・左は買ったときに決まります）</p>`;
    if (o.type === 'tee') {
      const PN = ['前', '右', '左'], one = o.one || 0, two = [0, 1, 2].filter(i => i !== one).map(i => PN[i]).join('・');
      h += `<p><b>${o.mode === 'split' ? '発散（1本→2本）' : '集約（2本→1本）'}</b>：${o.mode === 'split' ? `${PN[one]}から入って、${two}へ交互に出る` : `${two}から入って、${PN[one]}へ出る`}（前・右・左は矢印の向きから見た口）</p>
        <div class="cnt">しくみ</div><div class="seg"><button data-tm="merge" class="${o.mode !== 'split' ? 'on' : ''}">集約 2→1</button><button data-tm="split" class="${o.mode === 'split' ? 'on' : ''}">発散 1→2</button></div>
        <div class="cnt">1本側の口</div><div class="seg">${PN.map((n, i) => `<button data-to="${i}" class="${one === i ? 'on' : ''}">${n}</button>`).join('')}</div>`;
    }
    if (o.type === 'sorter') h += `<div class="cnt">左へよける製品</div><div class="seg">${UC.PRODUCTS.map((p, i) => `<button data-tg="${i}" class="${o.target === i ? 'on' : ''}">${p.name}</button>`).join('')}</div>`;
    const movable = !!UC.MACHINES[o.type];
    if (movable) h += `<div class="cnt" style="margin-top:12px">向き：<b>${ARROW[(o.dir + viewRot) % 4]}</b></div><div class="edrow"><button id="iRot">↻ 回す</button><button id="iMove">✥ 移動（${moveCost(o)}恋ン）</button><button id="iDel" class="pbtn red">撤去（${Math.floor(UC.MACHINES[o.type].cost / 2)}恋ン もどる）</button></div>`;
    openModal(name, h);
    const body = $('#mBody');
    const x0 = x, y0 = y;
    body.querySelectorAll('button[data-tg]').forEach(v => v.onclick = () => { o.target = +v.dataset.tg; Snd.click(); UC.save(G); panel(x0, y0); });
    body.querySelectorAll('button[data-tm]').forEach(v => v.onclick = () => { o.mode = v.dataset.tm; o.alt = 0; Snd.click(); UC.save(G); panel(x0, y0); });
    body.querySelectorAll('button[data-to]').forEach(v => v.onclick = () => { o.one = +v.dataset.to; o.alt = 0; Snd.click(); UC.save(G); panel(x0, y0); });
    if (lsrc) $('#iLine').onclick = () => { o.feed = lon ? null : UC.key(lsrc.x, lsrc.y); Snd.click(); UC.save(G); closeModal(); toast(lon ? '製造ラインからはずしました' : '製造ラインに接続しました'); };
    if (movable) {
      $('#iRot').onclick = () => { o.dir = (o.dir + 1) % 4; lastDir = o.dir; Snd.click(); UC.save(G); panel(x0, y0); };
      $('#iMove').onclick = () => { closeModal(); placing = null; nav = null; edit = { sel: o, moving: true }; Snd.click(); refreshCtrl(); toast('うつす先のマスをタップ'); };
      $('#iDel').onclick = () => {
        if (o.item || (o.stock && o.stock.length)) { toast('製品がのっているので撤去できません'); return; }
        delete b.objs[UC.key(x, y)]; G.coin += Math.floor(UC.MACHINES[o.type].cost / 2); Snd.put(); closeModal(); UC.save(G);
      };
    }
  }
  function placeAt(x, y) {
    const m = UC.MACHINES[placing];
    if (!UC.canPlace(G, curBase, x, y)) { toast('そこには置けません'); return; }
    if (G.coin < m.cost) { toast('恋ンが足りません'); placing = null; refreshCtrl(); return; }
    G.coin -= m.cost;
    const b = G.bases[curBase];
    // 向きは、最後に回したきかいと同じ（続けて置くコンベアがそろうように）
    const o = UC.put(b, placing, x, y, lastDir, { hand: placeHand });
    placedLog.push({ base: curBase, x, y, o, cost: m.cost });
    flash = { x, y, until: performance.now() + 500 };
    delete b.coins[UC.key(x, y)];
    Snd.put(); CG.debug.add('place', { m: placing, x, y });
    UC.save(G); refreshTop();
    askLine(b, o);
  }
  /* 取り場のまわり 1 マスにコンベアを置いたら、製造ラインにつなぐか聞く */
  function askLine(b, o) {
    if (!UC.BELTS.includes(o.type)) return;
    const s = UC.srcNear(b, o.x, o.y);
    if (!s) return;
    openModal('製造ラインに接続', `<p>${objName(s)}のとなりにコンベアを置きました。製造ラインに接続すると、取り場の製品が自動でこのコンベアへ流れていきます。</p>
      <div class="edrow" style="margin-top:12px"><button id="lnYes" class="pbtn">する</button><button id="lnNo">しない</button></div>`);
    $('#lnYes').onclick = () => { o.feed = UC.key(s.x, s.y); Snd.put(); UC.save(G); closeModal(); toast('製造ラインに接続しました'); };
    $('#lnNo').onclick = () => { o.feed = null; Snd.click(); UC.save(G); closeModal(); };
  }
  let lastDir = 0, flash = null;
  const ARROW = ['↘', '↙', '↖', '↗'];   // 向き（東・南・西・北）が画面でどちらを向くか


  /* ---------- 設定 ---------- */
  function openSettings() {
    const h = `
      <div class="item"><div class="tx"><b>あそびかた</b></div><button id="stHow">ひらく</button></div>
      <div class="item"><div class="tx"><b>おと</b></div><button id="stMute">${Snd.mute ? 'OFF' : 'ON'}</button></div>
      <div class="item"><div class="tx"><b>タイトルへもどる</b><small>自動でセーブされています</small></div><button id="stTitle">もどる</button></div>
      <h3 style="font-size:14px;margin:14px 0 4px">更新履歴</h3>
      ${HIST.map(([v, d, s]) => `<div class="cnt"><b>${v}</b>（${d}）${esc(s)}</div>`).join('')}
      <div id="stMove"></div>
      <div id="stDbg" style="margin-top:12px"></div>
      <h3 style="font-size:14px;margin:14px 0 4px">データ初期化</h3>
      <div class="cnt">赤いボタンを 2 秒長押しすると、保存データを消してタイトルへもどります。</div>
      <button class="pbtn hold" id="stReset"><i></i>長押しで初期化</button>
      <div class="cnt" style="margin-top:10px">バージョン ${UC.VERSION}</div>`;
    openModal('⚙ 設定', h);
    $('#stHow').onclick = () => howTo();
    $('#stMute').onclick = e => { Snd.mute = !Snd.mute; CG.ls.set('ugokase-chikuwa-mute', Snd.mute ? '1' : '0'); e.target.textContent = Snd.mute ? 'OFF' : 'ON'; };
    $('#stTitle').onclick = () => { UC.save(G); closeModal(); G = null; showTitle(); };
    CG.move.mount($('#stMove'), { keys: [UC.KEY, 'ugokase-chikuwa-mute'] });
    CG.debug.mount($('#stDbg'), { title: '🐞 不具合を報告する', placeholder: 'どんなことが起きた？' });
    const rb = $('#stReset'), bar = rb.querySelector('i');
    let t0 = 0, raf = 0;
    const tick = () => { const p = Math.min(1, (performance.now() - t0) / 2000); bar.style.width = p * 100 + '%'; if (p >= 1) { UC.clearSave(); closeModal(); G = null; showTitle(); toast('データを消しました'); return; } raf = requestAnimationFrame(tick); };
    rb.onpointerdown = () => { t0 = performance.now(); raf = requestAnimationFrame(tick); };
    rb.onpointerup = rb.onpointerleave = rb.onpointercancel = () => { cancelAnimationFrame(raf); bar.style.width = 0; };
  }

  /* ---------- 画面（canvas） ---------- */
  const cv = $('#view'), ctx = cv.getContext('2d');
  let DPR = 1, VW = 0, VH = 0;
  function resize() {
    const r = cv.getBoundingClientRect();
    DPR = Math.min(2, window.devicePixelRatio || 1);
    VW = r.width; VH = r.height;
    cv.width = Math.round(VW * DPR); cv.height = Math.round(VH * DPR);
  }
  window.addEventListener('resize', () => { if (G) resize(); });
  if (window.ResizeObserver) new ResizeObserver(() => { if (G) resize(); }).observe(cv);
  /* ページ上の座標 → canvas の中の座標（offsetX はブラウザによってずれることがあるので使わない） */
  const ptOf = e => { const rc = cv.getBoundingClientRect(); return [e.clientX - rc.left, e.clientY - rc.top]; };

  function cam() {
    if (cams[curBase]) return cams[curBase];
    const b = G.bases[curBase];
    // 拠点の全体（または一部）が入るように
    const w = (b.w + b.h) * UC.TW / 2, h = (b.w + b.h) * UC.TH / 2 + 70;
    const z = Math.max(0.7, Math.min(3, Math.min(VW / (w + 20), VH / (h + 20))));
    const [cx, cy] = UC.iso(b.w / 2, b.h / 2);
    return (cams[curBase] = { x: cx, y: cy - 20, z });
  }
  function toWorld(sx, sy) {
    const c = cam();
    return [(sx - VW / 2) / c.z + c.x, (sy - VH / 2) / c.z + c.y];
  }
  function toTile(sx, sy) {
    setView();
    const [wx, wy] = toWorld(sx, sy);
    const a = wx / (UC.TW / 2), b = wy / (UC.TH / 2);
    return UC.unrt(Math.floor((a + b) / 2), Math.floor((b - a) / 2));
  }
  /* 視点の回転（90° ずつ。4 回で 1 周）。画面のまん中に見えている所はそのまま */
  let viewRot = 0;
  function setView() { const b = G && G.bases[curBase]; UC.view.rot = viewRot; if (b) { UC.view.W = b.w; UC.view.H = b.h; } }
  function rotateView(k) {
    setView();
    const c = cam(), a = c.x / (UC.TW / 2), d = c.y / (UC.TH / 2);
    const u = (a + d) / 2, v = (d - a) / 2;
    // 回した座標 (u, v) → 世界の点（UC.rp の逆）
    const { W, H } = UC.view, p = viewRot === 0 ? [u, v] : viewRot === 1 ? [v, H - u] : viewRot === 2 ? [W - u, H - v] : [W - v, u];
    viewRot = (viewRot + k + 4) % 4; setView();
    const [nx, ny] = UC.iso(...p); c.x = nx; c.y = ny;
    Snd.click(); refreshCtrl();
  }
  $('#rotL').onclick = () => rotateView(3);
  $('#rotR').onclick = () => rotateView(1);

  /* 入力：ドラッグで移動・ピンチで拡大・タップで調べる／置く */
  const ptrs = new Map(); let drag = null, pinch = null, moved = false;
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, [...ptOf(e)]);
    if (ptrs.size === 1) { const [px, py] = ptOf(e); drag = { x: px, y: py, cx: cam().x, cy: cam().y }; moved = false; }
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: cam().z }; moved = true; }
  });
  cv.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) { hover = toTile(...ptOf(e)); return; }
    ptrs.set(e.pointerId, [...ptOf(e)]);
    const c = cam();
    if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()]; c.z = Math.max(0.4, Math.min(5, pinch.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d)); return; }
    if (drag) {
      const [px, py] = ptOf(e), dx = px - drag.x, dy = py - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
      if (moved) { c.x = drag.cx - dx / c.z; c.y = drag.cy - dy / c.z; }
    }
    hover = toTile(...ptOf(e));
  });
  const up = e => {
    if (ptrs.has(e.pointerId) && ptrs.size === 1 && !moved && G) {
      const [x, y] = toTile(...ptOf(e)), b = G.bases[curBase];
      const hit = placing || (edit && edit.moving) ? null : pickSprite(...ptOf(e));
      const [hx, hy] = hit || [x, y];
      if (hx >= 0 && hy >= 0 && hx < b.w && hy < b.h) { if (edit) editTap(hx, hy); else if (placing) placeAt(hx, hy); else inspect(hx, hy); }
    }
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (!ptrs.size) drag = null;
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { e.preventDefault(); const c = cam(); c.z = Math.max(0.4, Math.min(5, c.z * (e.deltaY < 0 ? 1.12 : 0.89))); }, { passive: false });
  $('#zin').onclick = () => { const c = cam(); c.z = Math.min(5, c.z * 1.25); };
  $('#zout').onclick = () => { const c = cam(); c.z = Math.max(0.4, c.z / 1.25); };
  let hover = null;
  /* 絵（ボクセル）の上をタップしたとき、いちばん手前のもの（きかい・取り場・ヤード・ちくわ君）のマス */
  function pickSprite(sx, sy) {
    const b = G.bases[curBase], [wx, wy] = toWorld(sx, sy);
    const cand = [];
    for (const o of Object.values(b.objs)) cand.push([o.x, o.y, UC.BELTS.includes(o.type) ? 'belt' : o.type, o.x, o.y]);
    G.robots.forEach(r => { if (r.base === curBase && !UC.inFridge(r)) { const [rx, ry] = robotPos(r); cand.push([rx, ry, 'robot', Math.round(r.x), Math.round(r.y)]); } });
    let best = null;
    for (const [x, y, m, tx, ty] of cand) {
      const [l, t0, w, h] = UC.spriteBox(m, 0, x, y), t = t0 - (m === 'robot' ? 4 : 0), [ru, rv] = UC.rt(x, y);
      if (wx >= l && wx <= l + w && wy >= t && wy <= t + h && (!best || ru + rv > best[2])) best = [tx, ty, ru + rv];
    }
    return best;
  }

  function floorOf(bi) {
    const b = G.bases[bi];
    const k = bi + ':' + viewRot;
    if (!floors[k]) floors[k] = UC.paintFloor(b);
    return floors[k];
  }

  function draw(tr) {
    const b = G.bases[curBase], c = cam();
    setView();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // 背景（絵）：工場の外の夕方の空と、遠くの屋根
    const cl = UC.cal(G.time), hr = cl.hh + cl.mm / 60, night = hr < 5 || hr >= 19, eve = hr >= 16 && hr < 19;
    const g = ctx.createLinearGradient(0, 0, 0, cv.height);
    if (night) { g.addColorStop(0, '#141B2E'); g.addColorStop(1, '#2A3442'); }
    else if (eve) { g.addColorStop(0, '#3C3463'); g.addColorStop(1, '#E59A6A'); }
    else { g.addColorStop(0, '#7FB7DA'); g.addColorStop(1, '#D9EEF4'); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.setTransform(DPR * c.z, 0, 0, DPR * c.z, DPR * (VW / 2 - c.x * c.z), DPR * (VH / 2 - c.y * c.z));
    ctx.imageSmoothingEnabled = false;
    const fl = floorOf(curBase);
    ctx.drawImage(fl.cv, -fl.ox, -fl.oy);
    // 夜は少し暗く（工場の照明）
    // 床の印
    const objs = Object.values(b.objs);
    objs.filter(o => o.type === 'yard').forEach(o => UC.drawYardMark(ctx, o.x, o.y));
    // 置くモードのマス
    if (placing && hover) {
      const [hx, hy] = hover, ok = UC.canPlace(G, curBase, hx, hy);
      if (hx >= 0 && hy >= 0 && hx < b.w && hy < b.h) {
        ctx.fillStyle = ok ? 'rgba(80,200,120,.45)' : 'rgba(220,70,60,.45)';
        ctx.beginPath(); [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([a, d], n) => { const p = UC.iso(hx + a, hy + d); n ? ctx.lineTo(...p) : ctx.moveTo(...p); }); ctx.closePath(); ctx.fill();
      }
    }
    // 配置がえ：選んだきかいの枠と、うつす先
    if (edit && edit.sel && b.objs[UC.key(edit.sel.x, edit.sel.y)] === edit.sel) {
      ctx.strokeStyle = '#FFE066'; ctx.lineWidth = 2.5; ctx.setLineDash([4, 3]);
      ctx.beginPath(); [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([a, d], n) => { const p = UC.iso(edit.sel.x + a, edit.sel.y + d); n ? ctx.lineTo(...p) : ctx.moveTo(...p); }); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
    }
    if (edit && edit.moving && hover) {
      const [hx, hy] = hover, ok = UC.canPlace(G, curBase, hx, hy);
      if (hx >= 0 && hy >= 0 && hx < b.w && hy < b.h) { ctx.fillStyle = ok ? 'rgba(80,200,120,.45)' : 'rgba(220,70,60,.45)'; ctx.beginPath(); [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([a, d], n) => { const p = UC.iso(hx + a, hy + d); n ? ctx.lineTo(...p) : ctx.moveTo(...p); }); ctx.closePath(); ctx.fill(); }
    }
    if (flash && performance.now() < flash.until) {
      ctx.fillStyle = 'rgba(255,224,102,.6)';
      ctx.beginPath(); [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([a, d], n) => { const p = UC.iso(flash.x + a, flash.y + d); n ? ctx.lineTo(...p) : ctx.moveTo(...p); }); ctx.closePath(); ctx.fill();
    }
    // ナビのルート（最短ルートのマス）
    if (nav && nav.base === curBase) {
      nav.tiles.forEach(([tx, ty], n) => {
        ctx.fillStyle = 'rgba(70,170,255,.38)';
        ctx.beginPath(); [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]].forEach(([a, d], m) => { const p = UC.iso(tx + a, ty + d); m ? ctx.lineTo(...p) : ctx.moveTo(...p); }); ctx.closePath(); ctx.fill();
        const [sx, sy] = UC.iso(tx + 0.5, ty + 0.5);
        ctx.fillStyle = '#0B4F8A'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(n + 1, sx, sy);
      });
      ctx.strokeStyle = '#FFE066'; ctx.lineWidth = 2;
      ctx.beginPath(); [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([a, d], m) => { const p = UC.iso(nav.x + a, nav.y + d); m ? ctx.lineTo(...p) : ctx.moveTo(...p); }); ctx.closePath(); ctx.stroke();
    }
    // 選んでいるちくわ君の足もと
    const sr = robot();
    // 奥から手前へ描く
    const list = [];
    const dep = (x, y) => { const [u, v] = UC.rt(x, y); return u + v; };   // 回した向きでの奥行き
    objs.forEach(o => list.push({ d: dep(o.x, o.y), z: 0, f: () => drawObj(o, tr) }));
    for (const k in b.coins) { const [x, y] = k.split(',').map(Number); list.push({ d: dep(x, y) - 0.1, z: 0, f: () => UC.drawCoin(ctx, x, y, tr) }); }
    G.robots.forEach((r, i) => {
      if (r.base !== curBase || UC.inFridge(r)) return;
      const [rx, ry] = robotPos(r);
      list.push({ d: dep(rx, ry) + 0.05, z: 1, f: () => drawRobot(r, i, rx, ry, tr, r === sr) });
    });
    list.sort((a, z) => a.d - z.d || a.z - z.z);
    list.forEach(o => o.f());
    // れいぞうこの中のちくわ君（数を出す）
    const inF = G.robots.filter(r => r.base === curBase && UC.inFridge(r));
    const fr = objs.find(o => o.type === 'fridge');
    if (inF.length && fr) { const [sx, sy] = UC.iso(fr.x + 0.5, fr.y + 0.5); label(sx, sy - 40, '🧊' + inF.map(r => r.name.replace('ちくわ', '')).join('・'), '#2E6E9E'); }
    // 吹き出し
    G.robots.forEach(r => {
      if (r.base !== curBase || UC.inFridge(r)) return;
      const [rx, ry] = robotPos(r), [sx, sy] = UC.iso(rx + 0.5, ry + 0.5);
      let s = r.bub ? r.bub.s : (r.mode === 'off' ? '💤' : r.brk && r.brk.phase === 'vent' ? '💨' : null);
      if (s) label(sx + 10, sy - 38, s, '#fff', '#3B2A1C');
    });
    if (nav && nav.base === curBase) navBubble(c);
  }
  /* ナビの吹き出し（画面の大きさのまま描く。オブジェクトの上） */
  function navBubble(c) {
    const [wx, wy] = UC.iso(nav.x + 0.5, nav.y + 0.5);
    let sx = (wx - c.x) * c.z + VW / 2, sy = (wy - c.y) * c.z + VH / 2 - 34 * c.z;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.font = 'bold 12px sans-serif';
    const lh = 16, w = Math.max(...nav.lines.map(l => ctx.measureText(l).width)) + 18, h = nav.lines.length * lh + 22;
    let bx = Math.max(6, Math.min(VW - w - 6, sx - w / 2)), by = sy - h - 8;
    if (by < 50) by = 50;
    ctx.fillStyle = 'rgba(255,253,247,.96)'; ctx.strokeStyle = '#3E8ED0'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, w, h, 10) : ctx.rect(bx, by, w, h); ctx.fill(); ctx.stroke();
    if (sy - 8 > by + h) { ctx.beginPath(); ctx.moveTo(Math.min(Math.max(sx, bx + 12), bx + w - 12) - 6, by + h); ctx.lineTo(Math.min(Math.max(sx, bx + 12), bx + w - 12), Math.min(sy, by + h + 10)); ctx.lineTo(Math.min(Math.max(sx, bx + 12), bx + w - 12) + 6, by + h); ctx.fillStyle = '#3E8ED0'; ctx.fill(); }
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    nav.lines.forEach((l, i) => { ctx.fillStyle = i === 0 ? '#0B4F8A' : '#3B2A1C'; ctx.fillText(l, bx + 9, by + 6 + i * lh); });
    ctx.fillStyle = '#7A6450'; ctx.font = '10px sans-serif'; ctx.fillText('もう一度タップで くわしく', bx + 9, by + 6 + nav.lines.length * lh);
  }
  function label(x, y, s, bg, fg) {
    ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(s).width + 8;
    ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2, y - 7, w, 14, 6) : ctx.rect(x - w / 2, y - 7, w, 14); ctx.fill();
    ctx.fillStyle = fg || '#fff'; ctx.fillText(s, x, y + 0.5);
  }
  function robotPos(r) {
    if (r.walk && r.path && r.path.length) { const [nx, ny] = r.path[0]; return [r.walk.fx + (nx - r.walk.fx) * r.walk.p, r.walk.fy + (ny - r.walk.fy) * r.walk.p]; }
    if (r.act && r.act.k === 'move') return [r.x + (r.act.tx - r.x) * r.act.p, r.y + (r.act.ty - r.y) * r.act.p];
    return [r.x, r.y];
  }
  function drawRobot(r, i, x, y, t, sel) {
    const [sx, sy] = UC.iso(x + 0.5, y + 0.5);
    ctx.fillStyle = sel ? 'rgba(255,224,102,.55)' : 'rgba(0,0,0,.22)';
    ctx.beginPath(); ctx.ellipse(sx, sy, 12, 6, 0, 0, Math.PI * 2); ctx.fill();
    const moving = (r.act && r.act.k === 'move') || r.walk;
    const bob = moving ? Math.abs(Math.sin(t * 14)) * 1.5 : 0;
    const shake = r.act && r.act.k === 'work' ? Math.sin(t * 40) * 0.6 : 0;
    UC.drawModel(ctx, 'robot', r.dir, x + shake / 8, y, 0, 0, bob);
    // 名札の色
    ctx.fillStyle = UC.ROBOT_COLORS[i]; ctx.fillRect(sx - 2, sy - 33 - bob, 4, 3);
    if (r.hold) UC.drawModel(ctx, UC.productModel(r.hold), 0, x, y, 2, 2, 34 + bob);
  }
  function drawObj(o, t) {
    const b = G.bases[curBase];
    if (UC.BELTS.includes(o.type)) {
      UC.drawModel(ctx, 'belt', o.dir % 2, o.x, o.y);
      const col = { belt: '#FFFFFF', curve: '#9FE0FF', tee: '#FFE066', wye: '#FFB3D1', sorter: o.on ? '#8CF08C' : '#AAAAAA' }[o.type];
      if (o.type === 'wye') { UC.drawArrow(ctx, o.x, o.y, (o.dir + 2) % 4, (o.dir + 3) % 4, col); UC.drawArrow(ctx, o.x, o.y, (o.dir + 2) % 4, (o.dir + 1) % 4, col, t * 0.5); }
      else if (o.type === 'sorter') { UC.drawArrow(ctx, o.x, o.y, (o.dir + 2) % 4, o.dir, '#FFFFFF', t * 0.5); UC.drawArrow(ctx, o.x, o.y, null, (o.dir + 3) % 4, col); }
      else if (o.type === 'curve') UC.drawArrow(ctx, o.x, o.y, UC.curveFrom(o), o.dir, col, t * 0.5);
      else if (o.type === 'tee') {
        const p = UC.teePorts(o);
        if (o.mode === 'split') p.pair.forEach((d, n) => UC.drawArrow(ctx, o.x, o.y, p.single, d, '#FFB070', n ? t * 0.5 : null));
        else p.pair.forEach((d, n) => UC.drawArrow(ctx, o.x, o.y, d, p.single, col, n ? t * 0.5 : null));
      }
      else UC.drawArrow(ctx, o.x, o.y, null, o.dir, col, t * 0.5);
      if (o.type === 'sorter') { const [sx, sy] = UC.iso(o.x + 0.5, o.y + 0.5); label(sx, sy - 16, UC.PRODUCTS[o.target].name, 'rgba(30,40,36,.7)'); }
      else if (UC.feedOf(b, o)) { const [sx, sy] = UC.iso(o.x + 0.5, o.y + 0.5); label(sx, sy - 16, 'ライン', '#C2551A'); }
      if (o.item) {
        const d = UC.outDir(o), p = Math.min(1, o.prog) - 0.5;
        UC.drawModel(ctx, UC.productModel(o.item), 0, o.x + DX[d] * p * 0.8, o.y + DY[d] * p * 0.8, 2, 2, 7);
      }
      return;
    }
    UC.drawModel(ctx, o.type, o.dir, o.x, o.y);
    const [sx, sy] = UC.iso(o.x + 0.5, o.y + 0.5);
    if (o.type === 'src') {
      o.stock.slice(0, 3).forEach((p, i) => UC.drawModel(ctx, UC.productModel(p), 0, o.x, o.y, 5 - i, 2.5, 4 + i * 2));
      const many = UC.spots(b, 'src').length > 1 ? o.no : '';
      label(sx, sy - 34, '取り場' + many + (o.stock.length ? ' ' + o.stock.length : ''), '#C2551A');
    }
    if (o.type === 'yard') {
      o.stock.slice(0, 8).forEach((p, i) => UC.drawModel(ctx, UC.productModel(p), 0, o.x, o.y, 1 + (i % 2) * 3, 1 + (Math.floor(i / 2) % 2) * 3, 4 + Math.floor(i / 4) * 9));
      const many = UC.spots(b, 'yard').length > 1 ? o.no : '';
      label(sx, sy - 30, '出荷' + many + (o.spec != null ? ' ' + UC.PRODUCTS[o.spec].name : '') + ' ' + o.stock.length, o.spec != null ? '#8A5A00' : '#B38600');
    }
    if (o.type === 'pool') { if (o.stock.length) UC.drawModel(ctx, UC.productModel(o.stock[o.stock.length - 1]), 0, o.x, o.y, 2, 2, 4); label(sx, sy - 18, o.stock.length + '/' + UC.poolCap(b), '#2E5E8E'); }
    if (o.type === 'pack' && o.item) UC.drawModel(ctx, UC.productModel(o.item), 0, o.x, o.y, 2, 2, 12);
    if ((o.type === 'heater' || o.type === 'cooler')) label(sx, sy - 26, o.on ? 'ON' : 'OFF', o.on ? '#2E8B57' : '#777');
    if (o.type === 'vent') {
      // 換気扇ルームに入っているちくわ君の煙
      const inV = G.robots.some(r => r.base === curBase && r.brk && r.brk.phase === 'vent' && Math.abs(r.x - o.x) + Math.abs(r.y - o.y) === 1);
      if (inV) for (let i = 0; i < 4; i++) { const k = (t * 0.6 + i / 4) % 1; ctx.fillStyle = `rgba(230,230,230,${0.7 - k * 0.7})`; ctx.beginPath(); ctx.arc(sx - 10 - k * 6, sy - 24 - k * 18, 3 + k * 4, 0, Math.PI * 2); ctx.fill(); }
    }
    if (o.type === 'pc') { const next = b.kanban.find(k => k.got == null); if (next && next.t - G.time < 60) label(sx, sy - 30, '📋' + UC.fmtTime(next.t), '#1E6E50'); }
  }

  /* ---------- ループ ---------- */
  let last = 0, acc = 0, saveT = 0, uiT = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    const t = ts / 1000;
    const dt = Math.min(0.1, last ? t - last : 0); last = t;
    if (!G) return;
    if (speed > 0 && $('#modal').classList.contains('hide') || speed > 0 && buildOpen) {
      let mins = dt / CFG.secPerMin * speed * (isFastForward() ? CFG.offShiftSpeed : 1);
      while (mins > 0) { const s = Math.min(0.25, mins); UC.step(G, s); mins -= s; }
    }
    draw(t);
    uiT += dt; if (uiT > 0.15) { uiT = 0; if (nav) { const n = nav.base === curBase && G.bases[curBase].objs[UC.key(nav.x, nav.y)] ? navCalc(nav.x, nav.y) : null; nav = n; } refreshTop(); refreshRobots(); refreshCtrl(); refreshHud(); markNow(); }
    saveT += dt; if (saveT > 5) { saveT = 0; UC.save(G); }
  }
  requestAnimationFrame(loop);
  document.addEventListener('visibilitychange', () => { if (document.hidden && G) UC.save(G); });
  window.addEventListener('pagehide', () => { if (G) UC.save(G); });

  /* テスト用（dev/test.py から使う） */
  window.UCT = { get edit() { return edit; }, setDir(d) { lastDir = d; }, get nav() { return nav; }, clearNav() { nav = null; },
    /* マスの中の点を、ページの上の座標に（lift は上へずらす px） */
    screenOf(x, y, lift = 0) { setView(); const c = cam(), [wx, wy] = UC.iso(x, y), rc = cv.getBoundingClientRect(); return [rc.left + (wx - c.x) * c.z + VW / 2, rc.top + (wy - lift - c.y) * c.z + VH / 2]; }, get G() { return G; }, set G(v) { G = v; }, startGame, setSpeed, inspect, robot, get curBase() { return curBase; }, rotateView, get viewRot() { return viewRot; } };

  showTitle();
})();
