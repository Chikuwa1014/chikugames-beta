/* うごかせ！ちくわくん — 定数・調整用の数値・名前の表 */
(function () {
  const UC = window.UC = window.UC || {};

  UC.VERSION = '1.2.0';
  UC.KEY = 'ugokase-chikuwa-v1';

  /* 向き：0＝東（+x）・1＝南（+y）・2＝西（-x）・3＝北（-y） */
  UC.DX = [1, 0, -1, 0];
  UC.DY = [0, 1, 0, -1];

  /* ---------- 調整用の数値（バランスはここで変える） ---------- */
  UC.CFG = {
    secPerMin: 0.25,        // 等速のとき、ゲーム内の 1 分が何秒か（1 時間＝15 秒）
    offShiftSpeed: 12,      // だれも勤務していないときの自動早送りの倍率
    startCoin: 300,         // はじめの恋ン
    // ちくわ君の動き（ゲーム内の分）
    moveMin: 1,             // 1 マス進むのにかかる分
    turnMin: 0.5, holdMin: 1, workMin: 8, opMin: 1, bumpMin: 0.5, callMin: 0.2,
    // 工場
    produceEvery: 20,       // 取り場に製品が出てくる間隔（分。勤務中だけ）
    srcMax: 5,              // 取り場にたまる最大数
    moveCostRate: 0.2, moveCostMin: 5,   // 置いたきかいの移動の代金（買った値段の 2 割・最低 5 恋ン。仮）
    beltMin: 2,             // コンベアが 1 マス運ぶのにかかる分
    poolCap: 5,             // 製品プールの初期の容量
    coinEvery: 30,          // 恋ンが落ちる間隔（分。勤務中だけ）
    coinMaxOnFloor: 6,
    coinValue: [5, 15],     // 落ちている恋ンの額（月がたつと少し増える）
    // かんばん（集荷）
    kanbanEvery: 180,       // 勤務の始まりから何分ごとに集荷が来るか（最後は勤務の終わり）
    kanbanBase: 3,          // 集荷で求められる個数のもと（月ごとに増える）
    kanbanMax: 12,
    carryMax: 8,            // 足りなかった数を次の集荷に上乗せするのは、1 回あたりこの数まで（仮）
    // 製品の需要（日経平均株価のような動き。毎日 0:00 に変わる。100 が平年なみ）
    demand: {
      // 景気の周期（10 年で 1 周。下の UC.NIKKEI のサンプルから決めた。ゲームの 1 年＝84 日）
      //   平均周期 3 年（年 ±0%）→ 上昇周期 4 年（年 +18%）→ 下落周期 3 年（年 −20%。上がった分をほぼもどす）
      cycle: [
        { id: 'avg', years: 3, rate: 0 },
        { id: 'up', years: 4, rate: 0.18 },
        { id: 'down', years: 3, rate: -0.198 },
      ],
      vol: 0.022,           // 1 日の変動の大きさ（対数。日経平均の年 20% ほどの変動を、1 年＝84 日にわけたもの）
      revert: 0.08,         // 周期の線へもどろうとする強さ
      shock: 0.03, shockSize: 0.08,   // ニュースで大きく動く確率と大きさ
      min: 55, max: 230,
      month: [0.9, 1.0, 1.15, 1.0, 0.95, 1.0, 1.0, 0.85, 1.05, 1.05, 1.1, 1.25],   // 1〜12 月（3 月＝年度末・8 月＝お盆・12 月＝年末）
      week: [1.1, 1.0, 1.0, 1.05, 1.15, 0.85, 0.8],   // 月〜日（月曜＝週明け・金曜＝週末前）
    },
    price: 12, pricePacked: 30,  // 集荷で入る恋ン（1 個あたり。梱包ずみは高い）
    okMental: 3, ngMental: -10,  // 集荷でそろった・足りなかったときの精神力
    // 体力・精神力（1 時間あたり）
    workHp: -4.5,           // 勤務中（指示書を実行中）の体力
    workMp: -1,             // 勤務中（指示書を実行中）の精神力
    summerHp: -2,           // 夏（6〜8 月）：勤務中の体力の減りに足す
    winterMp: -2,           // 冬（12〜2 月）：勤務中の精神力
    fridgeHeal: 20,         // れいぞうこの中で回復する体力
    fridgeMp: 10,           // れいぞうこの中で回復する精神力
    lowMp: 30,              // 精神力がこれより低いと動きがおそくなる
    lowMpSlow: 0.7,
    breakMin: 60, breakLongPlus: 15, // 休けい（勤務 8 時間以上は +15 分）
  };

  /* 需要の周期を決めるのに使った、日経平均株価の年末の終値（円・おおよそ）。ゲームでは読み込まず、参考に残すだけ。
     下落周期：1990〜92（年 −20% 前後）・2000〜02（年 −20% 前後）・2007〜08（2008 は −42%）
     平均周期：1993〜96（年 ±10% の中）・2009〜12（年 ±0% 前後）・2016〜19（年 ±0〜15%）
     上昇周期：2003〜06（年 +20% 前後）・2013〜15（年 +20% 前後）・2020〜21・2023〜24（年 +15〜25%）
     → 上昇は年 +18%・3〜4 年、下落は年 −20%・2〜3 年、平均は 3〜4 年。10 年で 1 周（平均 3・上昇 4・下落 3）とした */
  UC.NIKKEI = {
    1989: 38916, 1990: 23849, 1991: 22984, 1992: 16925, 1993: 17417, 1994: 19723, 1995: 19868, 1996: 19361,
    1997: 15259, 1998: 13842, 1999: 18934, 2000: 13786, 2001: 10543, 2002: 8579, 2003: 10677, 2004: 11489,
    2005: 16111, 2006: 17226, 2007: 15308, 2008: 8860, 2009: 10546, 2010: 10229, 2011: 8455, 2012: 10395,
    2013: 16291, 2014: 17451, 2015: 19034, 2016: 19114, 2017: 22765, 2018: 20015, 2019: 23657, 2020: 27444,
    2021: 28792, 2022: 26095, 2023: 33464, 2024: 39895,
  };
  UC.PHASE_NAME = { avg: '平均周期', up: '上昇周期（好景気）', down: '下落周期（不景気）' };

  /* 製品（何に使うかわからない部品ばかり） */
  UC.PRODUCTS = [
    { id: 'neji', name: 'ネジ' },
    { id: 'bane', name: 'バネ' },
    { id: 'hane', name: '羽車' },
    { id: 'suna', name: '綺麗な砂' },
    { id: 'sakana', name: '魚' },
  ];

  /* シフト（勤務の時刻は分。24:00 をこえるものは翌日へまたぐ） */
  UC.SHIFTS = {
    teiji: { name: '定時シフト', days: 5, slots: [[540, 1080]], monthMp: 0, desc: '9:00〜18:00・5日出勤' },
    nikotai: { name: '2交代', days: 4, slots: [[360, 1080], [1080, 1800]], monthMp: -1, desc: '6:00〜18:00／18:00〜6:00・4日出勤・月ごとに入れかえ' },
    sankotai: { name: '3交代', days: 4, slots: [[360, 1080], [840, 1560], [1200, 1920]], monthMp: -5, desc: '6:00〜18:00／14:00〜翌2:00／20:00〜翌8:00・4日出勤・毎月ちがう直' },
  };

  /* 拠点のレベル（その拠点の累計集荷数で上がる。2026-10-27 開発者の指定）
     src・yard：取り場・出荷ヤードの数、prod：生産量の倍率、spec：ヤードの製品指定（none なし・all あり・mix あり／なし混在）、kb：集荷数を増やす数（仮） */
  UC.LEVELS = [
    { lv: 1, need: 0, src: 1, yard: 1, prod: 1, spec: 'none', kb: 0 },
    { lv: 2, need: 50, src: 1, yard: 2, prod: 1, spec: 'none', kb: 0 },
    { lv: 3, need: 100, src: 2, yard: 2, prod: 1, spec: 'none', kb: 0 },
    { lv: 4, need: 300, src: 2, yard: 3, prod: 1, spec: 'none', kb: 0 },
    { lv: 5, need: 500, src: 3, yard: 3, prod: 1.1, spec: 'all', kb: 1 },
    { lv: 6, need: 1000, src: 4, yard: 3, prod: 1.1, spec: 'all', kb: 1 },
    { lv: 7, need: 1500, src: 6, yard: 6, prod: 1.2, spec: 'mix', kb: 2 },
    { lv: 8, need: 2000, src: 8, yard: 8, prod: 1.2, spec: 'mix', kb: 2 },
  ];
  UC.SPOT_GAP = 3;   // 取り場どうし・ヤードどうしは、まわり 3 マス以内に置かない

  /* 拠点の大きさ */
  UC.SIZES = [
    { w: 16, h: 8, cost: 3000, name: 'S（16×8）', maxLv: 5 },
    { w: 32, h: 16, cost: 9000, name: 'M（32×16）', maxLv: 6 },
    { w: 64, h: 32, cost: 25000, name: 'L（64×32）', maxLv: 8 },
  ];

  /* きかい（お店で買って置くもの） */
  UC.MACHINES = {
    belt: { name: 'コンベア（直線）', cost: 30, desc: '矢印の向きへ製品を運ぶ' },
    curve: { name: 'コンベア（90°曲線）', cost: 30, desc: '横から入った製品を矢印の向きへ曲げる。右曲がり・左曲がりは買うときに選ぶ' },
    tee: { name: 'Tコンベア', cost: 50, desc: '3つの口で、集約（2本→1本）と発散（1本→2本・交互）を切りかえる。1本側の口（前・右・左）も選べる（置いたあとタップ）' },
    wye: { name: 'Yコンベア', cost: 50, desc: '製品を左・右へ交互に分ける' },
    sorter: { name: 'ふりわけそうち', cost: 120, desc: '決めた製品だけ左へ、ほかはまっすぐ。「操作する」でオン／オフ' },
    pack: { name: '梱包台', cost: 200, desc: '製品を置いて「作業する」と梱包。集荷で高く売れる' },
    pool: { name: '製品プール', cost: 150, desc: '製品をためておける（はじめは 5 個）' },
    heater: { name: '暖房', cost: 300, desc: '冬の減りを防ぐ。「操作する」でスイッチオン', welfare: true },
    cooler: { name: 'スポットクーラー', cost: 300, desc: '夏の減りを防ぐ。「操作する」でスイッチオン', welfare: true },
    vend: { name: '無料自販機', cost: 250, desc: '休けいのたびに体力 +10', welfare: true },
    vent: { name: '換気扇ルーム', cost: 400, desc: '休けいのたびに精神力 +10（部屋に入る）', welfare: true },
  };
  UC.BELTS = ['belt', 'curve', 'tee', 'wye', 'sorter'];

  /* 福利厚生（その場で使うもの） */
  UC.SPOTS = {
    nomikai: { name: '飲み会', cost: 100, desc: '平日だけ。全員の体力 +10' },
    bbq: { name: 'BBQ', cost: 120, desc: '休日だけ。全員の体力 +10' },
    ryoko: { name: '社員旅行', cost: 1500, desc: '工場を 1 ヶ月止めて、全員の体力・精神力 +50' },
  };

  /* ちくわ君への買いもの */
  UC.CARE = {
    yukyu: { name: '有給', cost: 150, desc: '精神力 +35' },
    surimi: { name: 'すり身部品', cost: 80, desc: '怪我をなおす（体力 60 で復帰）' },
  };
  UC.ABIL = {
    spd: { name: 'あしの速さ', costs: [300, 800, 2000], desc: '進むのが速くなる' },
    tough: { name: 'がんじょう', costs: [400, 1000, 2500], desc: '勤務中の体力の減りが少なくなる' },
  };
  UC.UPG = {
    beltSpd: { name: 'コンベアの速さ', costs: [200, 600, 1500], desc: 'その拠点のコンベアが速くなる' },
    poolCap: { name: '製品プールの容量', costs: [150, 400, 1000], desc: '+5 個ずつ' },
  };
  UC.ROBOT_COST = [0, 1500, 4000];   // 2 台目・3 台目
  UC.ROBOT_MAX = 3;

  /* 指示ピース（パズルのピースと、ピース＝平和✌ のダブルミーニング。開発者の指定） */
  UC.PIECES = {
    fwd: { name: '進む', icon: '⬆', col: '#3E8ED0' },
    left: { name: '左に向く', icon: '↶', col: '#6C63C9' },
    right: { name: '右に向く', icon: '↷', col: '#6C63C9' },
    back: { name: 'うしろを向く', icon: '⟲', col: '#6C63C9' },
    hold: { name: '持つ／置く', icon: '✋', col: '#D98A2B', old: true },   // β0.2 までのピース（パレットには出さない）
    take: { name: '持つ', icon: '✋', col: '#D98A2B' },
    put: { name: '置く', icon: '📥', col: '#C07020' },
    work: { name: '作業する', icon: '🔨', col: '#4E9A51' },
    op: { name: '操作する', icon: '⏻', col: '#C94A4A' },
    if: { name: '場合わけ', icon: '❓', col: '#2E9C9C' },          // 'if:hold'＝持っているとき、'if:!hold'＝持っていないとき
    endif: { name: '場合わけおわり', icon: '❗', col: '#2E9C9C' },
    loop: { name: 'くり返し', icon: '🔁', col: '#B0567E' },     // 'loop:3'＝3 回、'loop:0'＝ずっと
    end: { name: 'くり返しおわり', icon: '↩', col: '#B0567E' },
    stop: { name: '停止', icon: '■', col: '#3B3B3B' },   // 右にへこみがない＝いちばん最後にだけ置ける
    f1: { name: 'F1', icon: 'F1', col: '#7A7A7A' },
    f2: { name: 'F2', icon: 'F2', col: '#7A7A7A' },
    f3: { name: 'F3', icon: 'F3', col: '#7A7A7A' },
  };
  UC.MAIN_MAX = 16;   // メイン指示書のピース数（仮）
  UC.FUNC_MAX = 8;    // ファンクションのピース数（仮）
  UC.LOOP_MAX = 20;   // くり返しの回数の上限（0 は「ずっと」）
  UC.FWD_MAX = 20;    // 進むピースの歩数の上限（0 は「ぶつかるまで」）
  /* 指示書の 1 つのピースは文字列。進むは 'fwd'（ぶつかるまで）か 'fwd:3'（3 歩） */
  UC.pieceKey = pc => String(pc).split(':')[0];
  UC.pieceArg = pc => +(String(pc).split(':')[1] || 0);
  /* くり返し・場合わけの開始と終了の組（どちらもかならず 1 対。入れ子できる。くり返しと場合わけが交差するのはだめ）
     pair[開始]＝終了・pair[終了]＝開始、no[i]＝何組目か、ok＝ぜんぶ 1 対か */
  const OPEN = { loop: 'end', if: 'endif' }, CLOSE = { end: 'loop', endif: 'if' };
  UC.loopPairs = function (list) {
    const st = [], pair = {}, no = {}, bad = {};
    let n = 0, ok = true;
    list.forEach((pc, i) => {
      const k = UC.pieceKey(pc);
      if (OPEN[k]) { st.push(i); no[i] = ++n; }
      if (CLOSE[k]) {
        const top = st[st.length - 1];
        if (top == null || UC.pieceKey(list[top]) !== CLOSE[k]) { ok = false; bad[i] = 1; return; }
        st.pop(); pair[top] = i; pair[i] = top; no[i] = no[top];
      }
    });
    st.forEach(i => { ok = false; bad[i] = 1; });
    return { pair, no, bad, ok };
  };

  /* 場合わけの条件（プルダウン）。g はグループ、s はピースに書く短い名前 */
  UC.CONDS = [
    { id: 'ok', g: '直前のピース', name: '直前のピースがうまくいった', s: '直前OK' },
    { id: 'fsrc', g: '前のマス', name: '前が取り場', s: '前:取り場' },
    { id: 'fsrcp', g: '前のマス', name: '前の取り場に製品がある', s: '取り場に製品' },
    { id: 'fyard', g: '前のマス', name: '前が出荷ヤード', s: '前:ヤード' },
    { id: 'fyardok', g: '前のマス', name: '前のヤードに、持っている製品を置ける', s: 'ヤードに置ける' },
    { id: 'fbelt', g: '前のマス', name: '前がコンベア', s: '前:コンベア' },
    { id: 'fbeltp', g: '前のマス', name: '前のコンベアに製品がある', s: 'コンベアに製品' },
    { id: 'fpoolp', g: '前のマス', name: '前の製品プールに製品がある', s: 'プールに製品' },
    { id: 'fpack', g: '前のマス', name: '前が梱包台', s: '前:梱包台' },
    { id: 'ffree', g: '前のマス', name: '前に進める（なにもない）', s: '前があいてる' },
    { id: 'hold', g: '持っている製品', name: '製品を持っている', s: '持っている' },
    { id: 'packed', g: '持っている製品', name: '持っている製品が梱包ずみ', s: '梱包ずみ' },
    { id: 't0', g: '持っている製品', name: '持っている製品がネジ', s: 'ネジ' },
    { id: 't1', g: '持っている製品', name: '持っている製品がバネ', s: 'バネ' },
    { id: 't2', g: '持っている製品', name: '持っている製品が羽車', s: '羽車' },
    { id: 't3', g: '持っている製品', name: '持っている製品が綺麗な砂', s: '綺麗な砂' },
    { id: 't4', g: '持っている製品', name: '持っている製品が魚', s: '魚' },
  ];

  UC.WEEK = ['月', '火', '水', '木', '金', '土', '日'];
  UC.season = m => (m >= 3 && m <= 5) ? 'spring' : (m >= 6 && m <= 8) ? 'summer' : (m >= 9 && m <= 11) ? 'autumn' : 'winter';
  UC.SEASON_NAME = { spring: '🌸春', summer: '🌻夏', autumn: '🍁秋', winter: '⛄冬' };

  UC.ROBOT_NAMES = ['ちくわ1号', 'ちくわ2号', 'ちくわ3号'];
  UC.ROBOT_COLORS = ['#E9A55B', '#7FB4E6', '#E68FB0'];   // 名札の色
})();
