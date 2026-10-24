/**
 * ちくわゲームズ 共通部品 v1 — debug.js（デバッグ報告）。core.js の後に読む。
 *
 * 遊んでいる人の端末で「操作・出来事・エラー」を直近 max 件だけ localStorage に残し、
 * 不具合が起きたらメモを付けて開発者に送る。サーバーは worker/index.js の /<フォルダ>/debug（D1 chikuwa-debug）。
 * 新しいゲームで使うときは worker/index.js の DEBUG_GAMES にフォルダ名を足す。
 *
 *   CG.debug.init({ snap: () => ({ d: state.day }) });  // snap：1件ごとに付ける「いまの状態」の要約（任意）
 *   CG.debug.add('open', { m: 100 });                    // 1件記録
 *   CG.debug.wrap('buy', { before: () => state.money, after: (m0) => ({ dm: state.money - m0 }) });
 *                                                        // window.buy を包んで、呼ばれたことを記録
 *   const r = await CG.debug.send(note, { state });      // 送信 → { ok:true, code } か { ok:false, t }
 *   CG.debug.mount(el);                                  // 送信欄（メモ・ボタン・受付番号）を el に作る（自前の見た目にしたいゲームは使わない）
 *
 * エラー（error・unhandledrejection）は init だけで自動的に記録される。
 * アーティファクト版からは送れない（公開サイトのみ）。そのときは「公開サイトから送って」と表示する。
 */
(function () {
    const CG = window.CG;
    let opt = { key: '', max: 300, url: 'debug', snap: null };
    let log = [];
    let started = false;

    function persist() {
        CG.ls.setJSON(opt.key, log);
    }

    const D = CG.debug = {
        /** 記録の一覧（古い順） */
        get log() {
            return log;
        },

        init(o) {
            opt = Object.assign(opt, o || {});
            if (!opt.key)
                opt.key = CG.info.game + '-debuglog';
            const v = CG.ls.getJSON(opt.key, []);
            log = Array.isArray(v) ? v : [];
            if (!started) {
                started = true;
                addEventListener('error', e => D.add('error', {
                    msg: String(e.message), src: (e.filename || '').split('/').pop() + ':' + e.lineno + ':' + e.colno,
                    st: e.error && e.error.stack ? String(e.error.stack).slice(0, 800) : undefined
                }));
                addEventListener('unhandledrejection', e => D.add('error', { msg: 'promise: ' + String(e.reason).slice(0, 300) }));
            }
            D.add('boot', { v: CG.info.version });
            return D;
        },

        /** 1件記録する（t：時刻、ev：何が起きたか、＋ snap の結果、＋ extra） */
        add(ev, extra) {
            let s = {};
            try {
                s = opt.snap ? opt.snap() || {} : {};
            }
            catch (e) { }
            log.push(Object.assign({ t: Date.now(), ev }, s, extra || {}));
            if (log.length > opt.max)
                log = log.slice(-opt.max);
            persist();
        },

        /**
         * グローバル関数 window[name] を包んで、呼ばれたことを記録する（ゲームの動きは変えない）。
         * before() の戻り値が after(前の値, 引数, 戻り値) に渡り、after の戻り値（オブジェクト）が記録に足される。
         */
        wrap(name, h) {
            const f = window[name];
            if (typeof f !== 'function')
                return;
            h = h || {};
            window[name] = function (...args) {
                let b;
                try {
                    b = h.before ? h.before() : undefined;
                }
                catch (e) { }
                const r = f.apply(this, args);
                let x = {};
                try {
                    x = h.after ? h.after(b, args, r) || {} : {};
                }
                catch (e) { }
                D.add(name, Object.assign({ a: args.length ? args : undefined }, x));
                return r;
            };
        },

        /** 記録を消す */
        clear() {
            log = [];
            persist();
        },

        /**
         * 送る。extra はゲームの状態など（state 全体を入れてよい。1件 300KB まで）。
         * 戻り値：{ ok:true, code:'受付番号' } か { ok:false, t:'理由' }
         */
        async send(note, extra) {
            const body = Object.assign({
                game: CG.info.game, version: CG.info.version, note: String(note || '').trim().slice(0, 500),
                at: new Date().toISOString(), screen: innerWidth + 'x' + innerHeight, ua: navigator.userAgent
            }, extra || {}, { log });
            try {
                const r = await fetch(opt.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
                let j = null;
                try {
                    j = await r.json();
                }
                catch (e) { }
                if (r.ok && j && j.ok) {
                    D.add('sent', { code: j.code });
                    return { ok: true, code: j.code };
                }
                return { ok: false, t: (j && j.error) || '送信できませんでした（' + r.status + '）。公開サイトから送ってください。' };
            }
            catch (e) {
                return { ok: false, t: '送信できませんでした。通信状態を確かめるか、公開サイトから送ってください。' };
            }
        },

        /**
         * 送信欄を el の中に作る（共通の見た目。class は cg-dbg-*）。
         * o.title：見出し、o.extra()：送るときに足すデータ、o.placeholder：メモの例
         */
        mount(el, o) {
            o = o || {};
            let msg = null;
            const draw = () => {
                const note = el.querySelector('textarea') ? el.querySelector('textarea').value : '';
                el.innerHTML = '<div class="cg-dbg"><b>' + CG.esc(o.title || '🐞 不具合を報告する') + '</b>' +
                    '<textarea rows="2" maxlength="500" placeholder="' + CG.esc(o.placeholder || 'どんなことが起きた？（任意）') + '"></textarea>' +
                    '<button type="button"' + (msg && msg.busy ? ' disabled' : '') + '>' + (msg && msg.busy ? '送信中…' : '🐞 デバッグログを送る') + '</button>' +
                    '<div class="cg-dbg-meta">直近' + log.length + '件の操作と、いまのゲームの状態を開発者に送ります。</div>' +
                    (msg && msg.ok ? '<div class="cg-dbg-ok">✅ 送信しました。受付番号 <b>' + CG.esc(msg.code) + '</b>（開発者に伝えてください）</div>' : '') +
                    (msg && msg.t ? '<div class="cg-dbg-ng">⚠ ' + CG.esc(msg.t) + '</div>' : '') + '</div>';
                el.querySelector('textarea').value = msg && msg.ok ? '' : note;
                el.querySelector('button').onclick = async () => {
                    const n = el.querySelector('textarea').value;
                    msg = { busy: true };
                    draw();
                    msg = await D.send(n, o.extra ? o.extra() : {});
                    draw();
                };
            };
            draw();
        }
    };
})();
