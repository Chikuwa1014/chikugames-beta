/**
 * ちくわゲームズ 共通部品 v1 — room.js（オンライン対戦のルーム）。core.js・share.js の後に読む。
 * 見た目は room.css（ロビー画面を使うときだけ）。
 *
 * 仕組みは共通ルール「8. 通信対戦・マルチプレイ」とまわせ！ちくわルーレットの「みんなで決める」と同じ：
 *   仲介（worker/index.js の MultiRoom、/<フォルダ>/ws）で WebRTC の接続情報を交換し、あとは端末どうしが直接やりとり。
 *   最初に入った端末が親（ID "0"）。親が子それぞれと 1 対 1 でつながる星型。部屋コードは 4 桁の数字。
 *   子はつながったら仲介を閉じる。親は新しい人のために開けたまま（切れたら 2 秒後につなぎ直す）。
 *   新しいゲームで使うときは worker/index.js の WS_GAMES に「フォルダ名: 台数」を足す。
 *
 * ゲーム側が書くのは「メッセージを受け取ったときの処理」だけ：
 *   const room = CG.room.create({
 *     max: 4,                                  // 1部屋の台数（親を含む。WS_GAMES と同じ数に）
 *     name: () => myName,                      // 自分の名前（メンバー一覧に出る）
 *     onMessage(from, m) {},                   // 相手からのデータ（親が受けると from は子の ID、子が受けると "0"）
 *     onMembers(list) {},                      // メンバーが変わった [{ id, name, host }]
 *     onReady() {},                            // 部屋に入れた（親：部屋ができた／子：親とつながった）
 *     onClose(text) {},                        // 部屋から出された・親がいなくなった（text は理由）
 *     onStatus(text, isErr) {}                 // 「つないでいます…」などの途中経過
 *   });
 *   room.createRoom();  room.join('1234');  room.leave();
 *   room.takeOver('1234')  // 親がいなくなった部屋を、同じコードで親として作り直す（親の引き継ぎ。2026-10-25 追加）
 *   room.rejoin('1234')    // 親が引き継がれた部屋へ、子としてつなぎ直す（新しい親がまだなら少し待ってくり返す）
 *   room.send(m)        // 子→親
 *   room.sendTo(id, m)  // 親→その子     room.broadcast(m)  // 親→全員の子
 *   room.role ('host'|'guest'|null)  room.code  room.myId  room.members  room.inviteUrl()
 *
 * ロビー画面（部屋を作る・参加・招待のリンク／コード／QR・メンバー一覧・退出）がほしいときは
 *   CG.room.lobby(el, room, { nameKey: 'xxx-name', inviteMsg: 'いっしょに遊ぼう！' })
 *
 * 進行（乱数・勝ち負け・時間）は親が決めて配る。子は操作を送るだけにする（共通ルール 8 章）。
 * アーティファクトでは WebRTC と WebSocket が使えないので、確認は手元のテスト（common/dev/）と本番で行う。
 * 接続先は ?signal=ws://localhost:8787/<フォルダ>/ws で上書きできる（手元のテスト用）。
 */
(function () {
    const CG = window.CG;
    const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

    /** URL の ?room=1234 */
    function codeFromUrl() {
        const c = new URLSearchParams(location.search).get('room');
        return c && /^[0-9]{4}$/.test(c) ? c : null;
    }

    function create(o) {
        o = Object.assign({ game: CG.info.game, max: 8, name: () => 'ななし' }, o || {});
        // 呼び出し先：create の o と、room.on で足したもの（ロビー画面など）
        const L = {};
        const call = (k, ...a) => {
            for (const f of [o[k], ...(L[k] || [])]) {
                try {
                    f && f(...a);
                }
                catch (e) {
                    console.error(e);
                }
            }
        };
        const signalUrl = () => new URLSearchParams(location.search).get('signal') ||
            (location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host + '/' + o.game + '/ws';

        // 接続の状態（ws：仲介、peers：親から見た子、pc/dc：子から見た親）
        let ws = null, mode = null, leaving = false, chain = Promise.resolve(), timer = 0;
        let peers = new Map(), pc = null, dc = null, pendingIce = [], connected = false;
        let names = new Map();

        const R = {
            role: null, code: null, myId: null, members: [],
            /** 出来事を受け取る関数を足す（k は onMessage・onMembers・onReady・onClose・onStatus） */
            on(k, f) {
                (L[k] || (L[k] = [])).push(f);
            },
            get open() {
                return R.role === 'host' ? true : connected;
            },

            createRoom(tries = 0) {
                const code = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
                call('onStatus', '部屋を作っています…');
                openSignal(code, 'create', tries);
            },
            join(code) {
                code = String(code || '').trim();
                if (!/^[0-9]{4}$/.test(code)) {
                    call('onStatus', '4桁の数字を入力してください', true);
                    return false;
                }
                call('onStatus', '部屋をさがしています…');
                openSignal(code, 'join', 0);
                return true;
            },
            /** 親の引き継ぎ：同じ部屋コードで親になる（すでに親がいれば子として入る） */
            takeOver(code) {
                call('onStatus', '部屋を引き継いでいます…');
                openSignal(String(code), 'takeover', 0);
            },
            /** 親の引き継ぎ：新しい親へ子としてつなぎ直す（新しい親がまだいなければ、0.7 秒ごとにくり返す） */
            rejoin(code) {
                call('onStatus', '部屋につなぎ直しています…');
                openSignal(String(code), 'rejoin', 0);
            },
            leave() {
                reset();
                R.members = [];
                call('onMembers', []);
            },
            send(m) {
                if (dc && dc.readyState === 'open')
                    dc.send(JSON.stringify(m));
            },
            sendTo(id, m) {
                const p = peers.get(id);
                if (p && p.dc && p.dc.readyState === 'open')
                    p.dc.send(JSON.stringify(m));
            },
            broadcast(m) {
                const s = JSON.stringify(m);
                for (const p of peers.values())
                    if (p.dc && p.dc.readyState === 'open')
                        p.dc.send(s);
            },
            /** 招待リンク（?room= と、手元のテスト用の ?signal= を引き継ぐ） */
            inviteUrl() {
                const u = new URL(CG.pageUrl());
                u.searchParams.set('room', R.code);
                const sig = new URLSearchParams(location.search).get('signal');
                if (sig)
                    u.searchParams.set('signal', sig);
                return u.toString();
            }
        };

        function sendSignal(m) {
            if (ws && ws.readyState === WebSocket.OPEN)
                ws.send(JSON.stringify(m));
        }

        function reset() {
            leaving = true;
            clearTimeout(timer);
            try {
                ws && ws.close();
            }
            catch (e) { }
            for (const p of peers.values()) {
                try {
                    p.dc && p.dc.close();
                }
                catch (e) { }
                try {
                    p.pc.close();
                }
                catch (e) { }
            }
            try {
                dc && dc.close();
            }
            catch (e) { }
            try {
                pc && pc.close();
            }
            catch (e) { }
            ws = null;
            peers = new Map();
            pc = null;
            dc = null;
            pendingIce = [];
            connected = false;
            chain = Promise.resolve();
            names = new Map();
            R.role = R.code = R.myId = null;
        }

        function fail(text) {
            reset();
            call('onStatus', text, true);
            call('onClose', text);
        }

        function openSignal(code, m, tries) {
            const keep = m === 'reconnect';
            if (!keep)
                reset();
            leaving = false;
            mode = m;
            R.code = code;
            let s;
            try {
                s = new WebSocket(signalUrl() + '?room=' + code);
            }
            catch (e) {
                fail('サーバーに接続できません');
                return;
            }
            ws = s;
            s.onerror = () => {
                if (ws === s && !connected && R.role !== 'host')
                    fail('サーバーに接続できません');
            };
            s.onclose = () => {
                if (ws !== s || leaving)
                    return;
                ws = null;
                if (R.role === 'host') {
                    call('onStatus', '仲介サーバーにつなぎ直しています…');
                    clearTimeout(timer);
                    timer = setTimeout(() => {
                        if (R.role === 'host' && !leaving)
                            openSignal(R.code, 'reconnect', 0);
                    }, 2000);
                }
            };
            s.onmessage = e => {
                let msg;
                try {
                    msg = JSON.parse(e.data);
                }
                catch (err) {
                    return;
                }
                chain = chain.then(() => onSignal(msg, tries)).catch(err => console.error(err));
            };
        }

        /** 引き継ぎ（takeover・rejoin）で、まだつながらないときにやり直す */
        function retryLater(code, m, tries) {
            leaving = true;
            try {
                ws && ws.close();
            }
            catch (e) { }
            ws = null;
            clearTimeout(timer);
            if (tries >= 14)
                return fail('部屋が見つかりませんでした');
            timer = setTimeout(() => openSignal(code, m, tries + 1), 700);
        }

        /** 親：いまの人数（自分＋つながった子＋つなぎ途中の子） */
        const headcount = () => 1 + peers.size;

        async function onSignal(msg, tries) {
            switch (msg.type) {
                case 'role':
                    if (mode === 'create' && msg.role !== 'host') {
                        // たまたま使用中のコードだった → 別のコードで作り直す
                        if (tries < 6)
                            return R.createRoom(tries + 1);
                        return fail('部屋を作れませんでした。もう一度お試しください');
                    }
                    if (mode === 'reconnect') {
                        if (msg.role !== 'host') {
                            call('onStatus', '部屋コードがほかの人に使われたため、新しい人は入れません', true);
                            leaving = true;
                            try {
                                ws.close();
                            }
                            catch (e) { }
                            return;
                        }
                        call('onStatus', '');
                        return;
                    }
                    if (mode === 'join' && msg.role === 'host')
                        return fail('その部屋は見つかりません');
                    // 引き継ぎ：新しい親がまだいない（自分が親になってしまった）ので、出なおす
                    if (mode === 'rejoin' && msg.role === 'host')
                        return retryLater(R.code, mode, tries);
                    R.role = msg.role;
                    R.myId = msg.id;
                    if (R.role === 'host') {
                        names.set('0', String(o.name()));
                        pushMembers();
                        call('onStatus', '');
                        call('onReady');
                    }
                    else {
                        call('onStatus', '親とつないでいます…');
                        makeGuestPeer();
                    }
                    return;
                case 'full':
                    return fail('その部屋は満員です');
                case 'host-left':
                    if (!connected && (mode === 'rejoin' || mode === 'takeover'))
                        return retryLater(R.code, mode, tries);
                    if (!connected)
                        fail('部屋が閉じられました');
                    return;
                case 'reject':
                    return fail(msg.reason === 'full' ? 'その部屋は満員です（' + o.max + '人まで）' : '参加できませんでした');

                // ---- 親 ----
                case 'peer-joined': {
                    if (R.role !== 'host')
                        return;
                    if (headcount() >= o.max) {
                        sendSignal({ type: 'reject', to: msg.id, reason: 'full' });
                        return;
                    }
                    const p = makeHostPeer(msg.id);
                    p.dc = p.pc.createDataChannel('game');
                    setupHostChannel(msg.id, p.dc);
                    await p.pc.setLocalDescription(await p.pc.createOffer());
                    sendSignal({ type: 'offer', to: msg.id, sdp: p.pc.localDescription });
                    return;
                }
                case 'answer': {
                    const p = peers.get(msg.from);
                    if (!p)
                        return;
                    await p.pc.setRemoteDescription(msg.sdp);
                    for (const c of p.ice)
                        await p.pc.addIceCandidate(c);
                    p.ice = [];
                    return;
                }
                case 'peer-left': {
                    const p = peers.get(msg.id);
                    if (p && !p.open)
                        dropPeer(msg.id);
                    return;
                }

                // ---- 子 ----
                case 'offer':
                    await pc.setRemoteDescription(msg.sdp);
                    for (const c of pendingIce)
                        await pc.addIceCandidate(c);
                    pendingIce = [];
                    await pc.setLocalDescription(await pc.createAnswer());
                    sendSignal({ type: 'answer', to: '0', sdp: pc.localDescription });
                    return;

                case 'ice':
                    if (R.role === 'host') {
                        const p = peers.get(msg.from);
                        if (!p)
                            return;
                        if (p.pc.remoteDescription)
                            await p.pc.addIceCandidate(msg.c);
                        else
                            p.ice.push(msg.c);
                    }
                    else if (pc) {
                        if (pc.remoteDescription)
                            await pc.addIceCandidate(msg.c);
                        else
                            pendingIce.push(msg.c);
                    }
                    return;
            }
        }

        // ---- 親：子ごとの接続 ----
        function makeHostPeer(id) {
            const c = new RTCPeerConnection({ iceServers: ICE_SERVERS });
            const p = { pc: c, dc: null, ice: [], open: false };
            peers.set(id, p);
            c.onicecandidate = e => {
                if (e.candidate)
                    sendSignal({ type: 'ice', to: id, c: e.candidate });
            };
            c.onconnectionstatechange = () => {
                if (c.connectionState === 'failed')
                    dropPeer(id);
            };
            return p;
        }
        function setupHostChannel(id, ch) {
            ch.onopen = () => {
                const p = peers.get(id);
                if (p)
                    p.open = true;
            };
            ch.onmessage = e => {
                let m;
                try {
                    m = JSON.parse(e.data);
                }
                catch (err) {
                    return;
                }
                if (m && m._ === 'hello') {
                    names.set(id, String(m.name || 'ななし').slice(0, 12));
                    pushMembers();
                    return;
                }
                call('onMessage', id, m);
            };
            ch.onclose = () => dropPeer(id);
        }
        function dropPeer(id) {
            const p = peers.get(id);
            if (!p)
                return;
            peers.delete(id);
            try {
                p.pc.close();
            }
            catch (e) { }
            if (names.delete(id))
                pushMembers();
        }
        /** 親：メンバー一覧を作って全員に配る（あいさつ済みの子だけ） */
        function pushMembers() {
            R.members = [...names].map(([id, name]) => ({ id, name, host: id === '0' }));
            R.broadcast({ _: 'members', list: R.members });
            call('onMembers', R.members);
        }

        // ---- 子：親との接続 ----
        function makeGuestPeer() {
            pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
            pc.onicecandidate = e => {
                if (e.candidate)
                    sendSignal({ type: 'ice', to: '0', c: e.candidate });
            };
            pc.ondatachannel = e => {
                dc = e.channel;
                setupGuestChannel(dc);
            };
            pc.onconnectionstatechange = () => {
                if (pc && pc.connectionState === 'failed')
                    lost('親とつながりませんでした（ネットワークを確認してください）');
            };
        }
        function setupGuestChannel(ch) {
            ch.onopen = () => {
                connected = true;
                // 仲介はもう不要
                leaving = true;
                try {
                    ws && ws.close();
                }
                catch (e) { }
                ws = null;
                leaving = false;
                R.send({ _: 'hello', name: String(o.name()) });
                call('onStatus', '');
                call('onReady');
            };
            ch.onmessage = e => {
                let m;
                try {
                    m = JSON.parse(e.data);
                }
                catch (err) {
                    return;
                }
                if (m && m._ === 'members') {
                    R.members = Array.isArray(m.list) ? m.list : [];
                    call('onMembers', R.members);
                    return;
                }
                call('onMessage', '0', m);
            };
            ch.onclose = () => {
                if (connected && !leaving)
                    lost('親との接続が切れました');
            };
        }
        function lost(text) {
            const was = connected;
            reset();
            R.members = [];
            call('onStatus', text, true);
            call('onClose', text, was);
        }

        return R;
    }

    /**
     * ロビー画面（共通の見た目。room.css）。el の中に作り、room の状態に合わせて書き換える。
     * opt.nameKey：名前を覚えておく localStorage のキー（無ければ名前欄なし）
     * opt.inviteMsg：招待を送るときの文面（#ちくわげーむず は自動で付く）
     * opt.tags：招待の文面に付けるゲーム固有のハッシュタグ
     * room を作るときの name に CG.room.lobbyName(opt) を渡すと、名前欄の値を使う。
     * ロビーの表示中に ?room= 付きで開かれていたら、部屋コードを入れておく（autoJoin: false で止められる）。
     * 名前欄があるときは名前を入れてから「参加する」を押してもらう。名前欄がないときは、そのまま自動で参加する
     */
    function lobby(el, room, opt) {
        opt = Object.assign({ autoJoin: true, title: 'みんなで遊ぶ' }, opt || {});
        let status = '', isErr = false;
        const st = { status: (t, e) => { status = t || ''; isErr = !!e; draw(); }, draw: () => draw() };
        room.on('onStatus', st.status);
        room.on('onMembers', () => draw());
        room.on('onReady', () => draw());
        room.on('onClose', () => draw());
        const nm = opt.nameKey ? CG.ls.get(opt.nameKey, '') : '';

        function draw() {
            const inRoom = room.role === 'host' || (room.role === 'guest' && room.open);
            let h = '<div class="cg-room">';
            if (!inRoom) {
                h += '<div class="cg-room-title">' + CG.esc(opt.title) + '</div>';
                if (opt.nameKey)
                    h += '<label class="cg-room-label">なまえ<input class="cg-room-name" maxlength="10" placeholder="ななし" value="' + CG.esc(el.querySelector('.cg-room-name') ? el.querySelector('.cg-room-name').value : nm) + '"></label>';
                h += '<button type="button" class="cg-room-btn" data-cg="create">🏠 部屋を作る</button>' +
                    '<div class="cg-room-or">または 部屋コードで参加</div>' +
                    '<div class="cg-room-joinrow"><input class="cg-room-code" inputmode="numeric" maxlength="4" placeholder="1234" value="' + CG.esc(el.querySelector('.cg-room-code') ? el.querySelector('.cg-room-code').value : '') + '">' +
                    '<button type="button" class="cg-room-btn cg-room-alt" data-cg="join">参加する</button></div>';
            }
            else {
                h += '<div class="cg-room-head"><span>部屋コード</span><b class="cg-room-num">' + CG.esc(room.code) + '</b>' +
                    '<span class="cg-room-role">' + (room.role === 'host' ? '親' : '子') + '</span></div>';
                if (room.role === 'host') {
                    h += '<div class="cg-room-invite"><button type="button" class="cg-room-btn" data-cg="share">' + (navigator.share ? '📤 招待リンクを送る' : '📋 招待リンクをコピー') + '</button>' +
                        (navigator.share ? '<button type="button" class="cg-room-btn cg-room-alt" data-cg="copy">📋 リンクをコピー</button>' : '') +
                        '<div class="cg-room-qr"></div></div>';
                }
                h += '<div class="cg-room-label">メンバー（' + room.members.length + '）</div><ul class="cg-room-members">' +
                    room.members.map(m => '<li>' + (m.host ? '👑 ' : '') + CG.esc(m.name) + (m.id === room.myId ? '（自分）' : '') + '</li>').join('') + '</ul>' +
                    '<button type="button" class="cg-room-btn cg-room-alt" data-cg="leave">退出する</button>';
            }
            if (status)
                h += '<div class="cg-room-msg' + (isErr ? ' cg-room-err' : '') + '">' + CG.esc(status) + '</div>';
            el.innerHTML = h + '</div>';
            const q = el.querySelector('.cg-room-qr');
            if (q && window.QRCode) {
                try {
                    new QRCode(q, { text: room.inviteUrl(), width: 160, height: 160, correctLevel: QRCode.CorrectLevel.M });
                }
                catch (e) { }
            }
        }

        el.addEventListener('click', async e => {
            const b = e.target.closest('[data-cg]');
            if (!b)
                return;
            const a = b.dataset.cg;
            saveName();
            if (a === 'create')
                room.createRoom();
            if (a === 'join')
                room.join(el.querySelector('.cg-room-code').value);
            if (a === 'leave') {
                room.leave();
                status = '';
                draw();
            }
            if (a === 'share' || a === 'copy') {
                const url = room.inviteUrl(), s = { msg: (opt.inviteMsg || 'いっしょに遊ぼう！') + '（部屋コード ' + room.code + '）', tags: opt.tags, url };
                if (a === 'share' && navigator.share) {
                    try {
                        await navigator.share({ title: CG.info.title || document.title, text: s.msg + '\n' + CG.share.tags(s).map(t => '#' + t).join(' '), url });
                    }
                    catch (err) { }
                }
                else
                    st.status(await CG.copy(url) ? 'リンクをコピーしました。みんなに送ってください' : 'コピーできませんでした。部屋コードを伝えてください', false);
            }
        });
        el.addEventListener('keydown', e => {
            if (e.key === 'Enter' && (e.target.classList.contains('cg-room-code') || (e.target.classList.contains('cg-room-name') && el.querySelector('.cg-room-code').value)))
                el.querySelector('[data-cg="join"]').click();
        });
        function saveName() {
            const i = el.querySelector('.cg-room-name');
            if (i && opt.nameKey)
                CG.ls.set(opt.nameKey, i.value.trim().slice(0, 10));
        }
        draw();
        const c = codeFromUrl();
        if (opt.autoJoin && c && !room.role) {
            const i = el.querySelector('.cg-room-code');
            if (i)
                i.value = c;
            if (el.querySelector('.cg-room-name')) {
                // 名前欄があるときは、すぐには参加しない。名前を入れてから「参加する」を押してもらう
                // （招待リンク・QR で開いた人が名前を入れられないのを防ぐ）
                st.status('部屋 ' + c + ' に招待されています。なまえを入れて「参加する」を押してください', false);
                try {
                    el.querySelector('.cg-room-name').focus();   // status で書き直したあとの欄
                }
                catch (e) { }
            }
            else
                room.join(c);
        }
        return st;
    }

    /** ロビーの名前欄（無ければ覚えている名前）を返す。create の name に渡す */
    const lobbyName = opt => () => {
        const i = document.querySelector('.cg-room-name');
        const v = (i ? i.value : CG.ls.get(opt.nameKey, '')) || '';
        return v.trim().slice(0, 10) || 'ななし';
    };

    CG.room = { create, lobby, lobbyName, codeFromUrl };
})();
