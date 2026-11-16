/* 荒野開拓記（仮） — 画面（HUD・つぎの目標・パネル・お知らせ）と、作る（クラフト） */
(function () {
  const MZ = window.MZ, T = MZ.T;
  const $ = s => document.querySelector(s);
  const U = MZ.ui = { open: false, modal: false, dirty: true, tab: 'inv', acc: 0, sig: '' };
  MZ.paused = false;

  /* ---------- つぎの目標（上から見て、最初に満たしていない 1 行） ---------- */
  const inv = k => MZ.state.inv[k], tl = k => MZ.state.tools[k], has = t => MZ.town.has(t);
  /* done：その目標を満たしているか。先へ進むと減る物（ロープ・原木など）は、
     「使ったあとの姿」も満たしているとみなす（すでに満たしている目標は飛ばす） */
  const roped = () => inv('rope') >= 1 || tl('pick') >= 2 || tl('axe') >= 2 || has('house') || has('well');
  MZ.GOALS = [
    { done: () => inv('grass') >= 3 || roped(), text: () => '草むらをたたいて草を 3 つ集めよう（' + inv('grass') + '／3）' },
    { done: roped, text: () => '草 3 つでロープを作ろう（「持ち物」→「材料」）' },
    { done: () => inv('log') >= 4 || has('bench'), text: () => '木を切って原木を 4 つ集めよう（' + inv('log') + '／4）' },
    { done: () => has('bench'), text: () => '石を 2 つ集めて、作業台を建てよう（「持ち物」→「建てる」→ 作業台。石 ' + inv('stone') + '／2）' },
    { done: () => tl('pick') >= 2, text: () => '作業台の近くで石のつるはしを作ろう（「持ち物」→「道具」）' },
    { done: () => MZ.town.info.roads > 0, text: () => '小屋から土の道をのばそう（「持ち物」→「建てる」→ 土の道）' },
    { done: () => MZ.town.info.homeSum > 0, text: () => '板を作って（「材料」）、道に面した所に木の家を建てよう（「建てる」）' },
    { done: () => has('well'), text: () => '井戸を建てよう（「持ち物」→「建てる」→ 井戸）' },
    { done: () => has('field'), text: () => '畑をつくろう（「持ち物」→「建てる」→ 畑）' },
    { done: () => MZ.town.info.cap > 0 && MZ.state.pop >= MZ.town.info.cap, text: () => '移住者を待とう（家・水・食料のいちばん少ない数まで来る）' },
    { done: () => has('kiln'), text: () => '粘土を掘ってかまどを建てよう（「建てる」→ かまど）' },
    { done: () => has('furnace'), text: () => 'れんがを作って（「材料」）炉を建てよう（「建てる」→ 炉）' },
    { done: () => inv('ingot') >= 1 || tl('axe') >= 3 || tl('pick') >= 3, text: () => '鉄の鉱脈を掘って、炉の近くで鉄インゴットを作ろう（「材料」）' },
    { done: () => MZ.state.stage >= 1, text: () => '人口 10 で集落にしよう（家・井戸・畑をふやす）（人口 ' + MZ.state.pop + '／10）' },
    { done: () => has('lumber'), text: () => 'きこり小屋を建てよう（「建てる」→ きこり小屋）' },
    { done: () => tl('axe') >= 3 && tl('pick') >= 3, text: () => '鉄の道具をそろえよう（作業台の近くで「道具」）' },
    /* 村（段階 T.villageStage）から先。区切り 3 で「土地を広げよう」を、倉庫と「人口 200 で町」のあいだに足す */
    { done: () => MZ.state.stage >= T.villageStage, text: () => '人口 ' + MZ.STAGES[T.villageStage].pop + ' で' + MZ.STAGES[T.villageStage].name + 'にしよう（れんがの家は 4 人住める）（人口 ' + MZ.state.pop + '／' + MZ.STAGES[T.villageStage].pop + '）' },
    { done: () => has('quarry'), text: () => MZ.BUILDS.quarry.name + 'を建てよう（石が自動でたまる）' },
    { done: () => has('claypit'), text: () => MZ.BUILDS.claypit.name + 'を建てよう（粘土が自動でたまる）' },
    { done: () => MZ.town.list().some(b => b.t === 'workshop' && b.mk), text: () => MZ.BUILDS.workshop.name + 'を建てて、「仕事場」タブでつくる物をえらぼう' },
    { done: () => has('shop'), text: () => MZ.BUILDS.shop.name + 'を建てよう（' + T.shopFree + ' 人より先は店が要る）' },
    { done: () => MZ.town.info.paved > 0, text: () => '小屋からの道に' + MZ.BUILDS.stoneroad.name + 'をつなごう（面した家は ' + MZ.BUILDS.stoneroad.pave + ' 人多く住める）' },
    { done: () => has('bigfield'), text: () => MZ.BUILDS.bigfield.name + 'をつくろう（' + MZ.BUILDS.bigfield.food + ' 人分の食料）' },
    { done: () => has('storehouse'), text: () => MZ.BUILDS.storehouse.name + 'を建てよう（自動でたまる上限がふえる）' },
    { done: () => MZ.state.stage >= T.villageStage + 1, text: () => '人口 ' + MZ.STAGES[T.villageStage + 1].pop + ' で' + MZ.STAGES[T.villageStage + 1].name + 'にしよう（家・水・食料・店をふやす）（人口 ' + MZ.state.pop + '／' + MZ.STAGES[T.villageStage + 1].pop + '）' },
    { done: () => false, text: () => 'ここまでが今の版です' }
  ];
  /* 上から見て、最初に満たしていない 1 行 */
  MZ.currentGoal = function () {
    const g = MZ.GOALS.find(x => !x.done());
    return g ? g.text() : '';
  };

  /* ---------- お知らせ ---------- */
  U.notice = function (text, kind) {
    const box = $('#notes'); if (!box) return;
    const now = performance.now();
    if (U.lastText === text && now - U.lastAt < 2000) return;   // 同じ文を 2 秒以内にくり返さない
    U.lastText = text; U.lastAt = now;
    const d = document.createElement('div'); d.className = 'note' + (kind ? ' ' + kind : ''); d.textContent = text;
    box.appendChild(d);
    while (box.children.length > 5) box.removeChild(box.firstChild);
    setTimeout(() => d.remove(), 3800);
    U.dirty = true;
  };
  U.banner = function (text) {
    const b = $('#banner'); b.textContent = text; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  };

  /* ---------- 確認の小さい画面 ---------- */
  U.confirm = function (text, ok) {
    $('#dlgText').textContent = text; $('#dlg').hidden = false; U.modal = true;
    const close = () => { $('#dlg').hidden = true; U.modal = false; };
    $('#dlgOk').onclick = () => { close(); ok(); };
    $('#dlgNo').onclick = close;
  };

  /* ---------- 作る（クラフト） ---------- */
  /* 作れない理由（作れるなら空） */
  const times = (cost, n) => { const o = {}; Object.keys(cost).forEach(k => { o[k] = cost[k] * n; }); return o; };
  MZ.craftReason = function (r, n) {
    const s = MZ.state; n = n || 1;
    if (r.stage && s.stage < r.stage) return MZ.STAGES[r.stage].name + '（人口 ' + MZ.STAGES[r.stage].pop + '）で解放';
    if (r.tool && s.tools[r.tool[0]] >= r.tool[1]) return '作った';
    if (!MZ.afford(n > 1 ? times(r.cost, n) : r.cost)) return '材料が足りない';
    if (r.at && !MZ.nearBuilding(r.at)) return MZ.BUILDS[r.at].name + 'の近くで';
    return '';
  };
  /* 作る。n は 1 か 5（省略は 1）。5 は材料のレシピ（tab: 'mat'）だけ。5 回ぶんの材料があり、設備の近くにいるときだけ作れる */
  MZ.craft = function (key, n) {
    const r = MZ.RECIPES.find(x => x.key === key), s = MZ.state;
    n = n || 1;
    if (!r || (n !== 1 && (n !== 5 || r.tab !== 'mat')) || MZ.craftReason(r, n)) return false;
    Object.keys(r.cost).forEach(k => { s.inv[k] -= r.cost[k] * n; });
    if (r.give) Object.keys(r.give).forEach(k => { s.inv[k] += r.give[k] * n; });
    if (r.tool) s.tools[r.tool[0]] = r.tool[1];
    U.notice(n > 1 ? r.name + 'を ' + n + ' 回作った（' + Object.keys(r.give).map(k => '＋' + r.give[k] * n + ' ' + MZ.ITEMS[k]).join(' ') + '）' : r.name + 'を作った');
    U.dirty = true; MZ.saveNow();
    return true;
  };

  /* ---------- パネル ---------- */
  U.panel = function (open) {
    if (open === U.open) return;
    U.open = open; MZ.paused = open; document.body.classList.toggle('panelopen', open);
    $('#panel').hidden = !open;
    if (open) {
      MZ.player.keys = {}; MZ.player.hitHeld = false;
      if (document.pointerLockElement) document.exitPointerLock();
      U.sig = ''; U.render();
    }
  };
  const chips = cost => Object.keys(cost).map(k => { const ok = MZ.state.inv[k] >= cost[k]; return '<span class="chip' + (ok ? '' : ' no') + '">' + MZ.ITEMS[k] + ' ' + MZ.state.inv[k] + '／' + cost[k] + '</span>'; }).join('');
  function recipeRows(tab) {
    return '<ul class="rl">' + MZ.RECIPES.filter(r => r.tab === tab).map(r => {
      const why = MZ.craftReason(r), give = r.give ? Object.keys(r.give).map(k => MZ.ITEMS[k] + '×' + r.give[k]).join(' ') : '';
      return '<li><div class="rt"><b>' + r.name + '</b>' + (give ? '<span> → ' + give + '</span>' : '') + (r.note ? '<span>' + r.note + '</span>' : '') + '</div>'
        + '<div class="cs">' + chips(r.cost) + '</div>'
        + (r.at ? '<div class="at' + (MZ.nearBuilding(r.at) ? '' : ' no') + '">' + MZ.BUILDS[r.at].name + 'の近くで</div>' : '')
        + '<div class="acts"><button class="act" data-craft="' + r.key + '"' + (why ? ' disabled' : '') + '>' + (why === '作った' ? '作った' : '作る') + '</button>'
        + (r.tab === 'mat' ? '<button class="act x5" data-craft5="' + r.key + '"' + (MZ.craftReason(r, 5) ? ' disabled' : '') + ' aria-label="' + r.name + 'を 5 回作る">×5</button>' : '') + '</div>'
        + (why && why !== '作った' && why.indexOf('の近くで') < 0 ? '<div class="why">' + why + '</div>' : '') + '</li>';
    }).join('') + '</ul>';
  }
  function buildRows() {
    let h = '<button class="act wide" data-remove="1">こわす（材料が半分もどる）</button><ul class="rl">';
    MZ.BUILD_ORDER.forEach(k => {
      const d = MZ.BUILDS[k], lock = MZ.town.lockReason(k), ok = !lock && MZ.afford(d.cost);
      h += '<li><div class="rt"><b>' + d.name + '</b><span>' + d.note + '</span></div><div class="cs">' + chips(d.cost) + '</div>'
        + '<button class="act" data-build="' + k + '"' + (ok ? '' : ' disabled') + '>えらぶ</button>'
        + (lock ? '<div class="why">' + lock + '</div>' : '') + '</li>';
    });
    h += '</ul>';
    return h;
  }
  /* 仕事場タブ：仕事場（jobs のある建物）と商店を id の順に。工房には、つくる物のボタン */
  function workRows() {
    const Tn = MZ.town, list = Tn.list().filter(b => { const d = MZ.BUILDS[b.t]; return d.jobs || d.shop; }), nth = {};
    if (!list.length) return '<p class="small">仕事場はまだ無い（' + MZ.BUILDS.lumber.name + 'は' + MZ.STAGES[MZ.BUILDS.lumber.stage].name + 'から、' + MZ.BUILDS.quarry.name + '・' + MZ.BUILDS.claypit.name + '・' + MZ.BUILDS.workshop.name + 'は' + MZ.STAGES[MZ.BUILDS.quarry.stage].name + 'から）</p>' + capLine();
    let h = '<ul class="rl wk">';
    Tn.jobs();
    list.forEach(b => {
      const d = MZ.BUILDS[b.t], br = Tn.bearing(b);
      nth[b.t] = (nth[b.t] || 0) + 1;
      h += '<li><div class="rt"><b>' + d.name + ' ' + nth[b.t] + '</b><span>' + br.dir + ' ' + br.dist + 'm</span></div>';
      if (d.shop) h += '<div class="wl">店 ' + d.shop + ' 人分</div>';
      else {
        const j = Tn.jobsById[b.id], ws = Tn.workState(b);
        let mk = '';
        if (d.craft) { const r = b.mk && MZ.RECIPES.find(x => x.key === b.mk); mk = d.every + ' 秒ごとに ' + (r ? r.name + '（' + Object.keys(r.give).map(k => MZ.ITEMS[k] + ' ' + r.give[k]).join('・') + '）' : 'えらんだ物'); }
        else mk = d.every + ' 秒ごとに ' + Object.keys(d.makes).map(k => MZ.ITEMS[k] + ' ' + d.makes[k]).join('・');
        h += '<div class="wl">働く人 ' + (j ? (j.running ? j.need : j.staff) : 0) + '／' + d.jobs + '</div><div class="wl">' + mk + '</div>'
          + '<div class="wl st-' + ws.st + '">' + ws.text + '</div>';
        if (d.craft) {
          h += '<div class="mks">' + d.craft.map(k => { const r = MZ.RECIPES.find(x => x.key === k); return '<button class="mk" data-make="' + k + '" data-bid="' + b.id + '" aria-pressed="' + (b.mk === k) + '">' + r.name + '</button>'; }).join('')
            + '<button class="mk" data-make="" data-bid="' + b.id + '" aria-pressed="' + (!b.mk) + '">止める</button></div>';
        }
      }
      h += '</li>';
    });
    return h + '</ul>' + capLine();
  }
  function capLine() {
    const n = MZ.town.count('storehouse');
    return '<p class="small capl">自動でたまる上限：' + MZ.autoCap() + '（倉庫 ' + n + '）</p>';
  }
  /* 自動でたまる物（建っている仕事場の makes と、工房があれば craft の give）。持ち物タブでは「石 120／上限 250」の形で出す */
  function autoItems() {
    const set = {};
    MZ.town.list().forEach(b => {
      const d = MZ.BUILDS[b.t];
      if (d.makes) Object.keys(d.makes).forEach(k => { set[k] = 1; });
      if (d.craft) d.craft.forEach(c => { const r = MZ.RECIPES.find(x => x.key === c); if (r) Object.keys(r.give).forEach(k => { set[k] = 1; }); });
    });
    return set;
  }
  function invRows() {
    const s = MZ.state, au = autoItems(), cap = MZ.autoCap();
    return '<h4>持ち物</h4><ul class="inv">' + MZ.ITEM_ORDER.map(k => au[k]
      ? '<li class="auto' + (s.inv[k] >= cap ? ' over' : '') + '"><span>' + MZ.ITEMS[k] + '</span><b>' + s.inv[k] + '／上限 ' + cap + '</b></li>'
      : '<li><span>' + MZ.ITEMS[k] + '</span><b>' + s.inv[k] + '</b></li>').join('') + '</ul>'
      + '<h4>道具</h4><ul class="inv tl"><li><span>斧</span><b>' + (MZ.TOOLS.axe[s.tools.axe] || '素手') + '</b></li><li><span>つるはし</span><b>' + (MZ.TOOLS.pick[s.tools.pick] || '素手') + '</b></li></ul>'
      + '<h4>街</h4><p class="small">' + MZ.STAGES[s.stage].name + '　人口 ' + s.pop + '／上限 ' + MZ.town.info.cap + '</p>';
  }
  U.render = function () {
    const body = $('#pbody'); if (!body) return;
    let h = U.tab === 'inv' ? invRows() : U.tab === 'build' ? buildRows() : U.tab === 'work' ? workRows() : recipeRows(U.tab);
    if (h !== U.sig) { const sc = body.scrollTop; body.innerHTML = h; body.scrollTop = sc; U.sig = h; }
    document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === U.tab ? 'true' : 'false'));
  };

  /* ---------- 建築中の見た目 ---------- */
  U.modeChanged = function () {
    const m = MZ.build.mode;
    document.body.classList.toggle('building', m !== 'none');
    document.body.classList.toggle('removing', m === 'remove');
    $('#bPlace').textContent = m === 'remove' ? 'こわす' : '置く';
  };

  /* ---------- 毎フレーム（0.15 秒ごとに文字を直す） ---------- */
  U.update = function (dt) {
    U.acc += dt;
    if (U.acc < 0.15) return;
    U.acc = 0;
    const s = MZ.state, I = MZ.town.info;
    $('#goal').textContent = MZ.currentGoal();
    const cls = k => I.low[k] ? ' class="low"' : '';
    $('#pop').innerHTML = MZ.STAGES[s.stage].name + '｜人口 ' + s.pop + '／上限 ' + I.cap + '　<span' + cls('home') + '>家 ' + I.homeSum + '</span>・<span' + cls('water') + '>水 ' + I.water + '</span>・<span' + cls('food') + '>食料 ' + I.food + '</span>'
      + (s.stage >= T.villageStage ? '・<span' + cls('shop') + '>店 ' + I.shop + '</span>' : '')
      + (I.unconnected ? '<br><em>道が小屋とつながっていない家がある</em>' : '');
    /* ねらい */
    const a = MZ.aim, el = $('#aim'), dot = $('#dot');
    if (MZ.build.mode !== 'none' || U.open || !a) { el.hidden = true; dot.classList.remove('hot'); }
    else {
      const d = MZ.NODES[a.k]; let txt = d.name + 'を' + d.verb, cant = '';
      if (d.tool && s.tools[d.tool] < d.need) cant = MZ.TOOLS[d.tool][d.need] + 'が必要';
      const hp = a.hp < 0 ? d.hp : a.hp;
      el.hidden = false; dot.classList.add('hot');
      el.innerHTML = '<b>' + txt + '</b>' + (cant ? '<div class="cant">' + cant + '</div>' : '<div class="bar"><i style="width:' + Math.round((1 - hp / d.hp) * 100) + '%"></i></div>');
    }
    /* 近くの仕事場・商店の 1 行（パネルを開いているとき・建築中は出さない） */
    const wk = $('#wk');
    if (wk) {
      const nb = (U.open || MZ.build.mode !== 'none') ? null : MZ.town.nearWork();
      if (!nb) wk.hidden = true;
      else {
        const d = MZ.BUILDS[nb.t];
        let txt;
        if (d.shop) txt = d.name + '：' + d.shop + ' 人分の店';
        else { const ws = MZ.town.workState(nb); txt = d.name + '：' + (ws.st === 'run' ? '動いている（' + ws.what + '。' + ws.text.replace(/^動いている（/, '').replace(/）$/, '') + '）' : ws.text); }
        wk.hidden = false; if (wk.textContent !== txt) wk.textContent = txt;
      }
    }
    /* 建築中のひとこと */
    const b = MZ.build, hint = $('#hint');
    if (b.mode === 'none') hint.hidden = true;
    else {
      hint.hidden = false;
      const keys = MZ.touch ? '' : (b.mode === 'place' ? '　R 回す・左クリック／E 置く・Q やめる' : '　左クリック／E こわす・Q やめる');
      if (b.mode === 'place') hint.innerHTML = MZ.BUILDS[b.key].name + (b.ok ? '' : '　<em>置けない（' + b.reason + '）</em>') + keys;
      else hint.innerHTML = (b.target ? MZ.BUILDS[MZ.town.byId[b.target].t].name + 'をこわす' : 'こわす物をねらう') + keys;
    }
    if (U.open) U.render();
  };

  /* ---------- 準備 ---------- */
  U.init = function () {
    $('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { U.tab = b.dataset.tab; U.sig = ''; U.render(); } });
    $('#pbody').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      if (b.dataset.craft) { MZ.craft(b.dataset.craft); U.render(); }
      else if (b.dataset.craft5) { MZ.craft(b.dataset.craft5, 5); U.render(); }
      else if (b.dataset.bid) { MZ.setMake(+b.dataset.bid, b.dataset.make || null); U.sig = ''; U.render(); }
      else if (b.dataset.build) MZ.startBuild(b.dataset.build);
      else if (b.dataset.remove) MZ.startRemove();
    });
    $('#pClose').addEventListener('click', () => U.panel(false));
    $('#pReset').addEventListener('click', () => U.confirm('いまの街を消して、さいしょからはじめます。よろしいですか？', MZ.resetAll));
    $('#bBag').addEventListener('click', () => U.panel(!U.open));
    $('#bView').addEventListener('click', () => MZ.toggleView());
    U.modeChanged();
  };
})();
