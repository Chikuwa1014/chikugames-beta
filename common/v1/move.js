/**
 * ちくわゲームズ 共通部品 v1 — move.js（セーブの引っ越し）。core.js・save.js の後に読む。
 *
 * ゲームの保存（localStorage）は、ページのアドレス（ドメイン）ごとに別になる。
 * 古いアドレスから新しいアドレスへ・別の端末へ、そのゲームの保存をまるごと運ぶための画面を作る。
 * 中身は CG.save のセーブコード（CK1.〜）とファイル。包みの data は { move: 1, keys: { 保存キー: 文字列 } }。
 *
 *   CG.move.mount(document.getElementById('move'), {
 *       keys: ['stage-kobo-v1', 'stage-kobo-progress'],   // 運ぶ保存キー（デバッグログなどは入れない）
 *   });
 *
 * 読み込むときは、keys に書いたキーだけを書き込む（コードに別のキーが入っていても書かない）。
 * コードに無いキーは消さずにそのまま残す。書き込んだらページを読み直す。
 * 手順の説明はトップの /hikkoshi/（引っ越しの手順）。
 */
(function () {
    const CG = window.CG;
    const MOVE_VER = 1;

    /** 見た目（ゲームの配色に合わせやすいよう、色は文字色と --cg-accent だけ使う） */
    const CSS = '.cg-mv{margin:12px 0;text-align:left}' +
        '.cg-mv>summary{cursor:pointer;font-weight:700}' +
        '.cg-mv-b{margin-top:8px;font-size:14px;line-height:1.6}' +
        '.cg-mv-b p{margin:6px 0}' +
        '.cg-mv-row{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}' +
        '.cg-mv button{font:inherit;font-size:14px;padding:7px 12px;border-radius:10px;cursor:pointer;color:inherit;' +
        'background:transparent;border:1.5px solid var(--cg-accent,#C9772E)}' +
        '.cg-mv button.cg-mv-go{background:var(--cg-accent,#C9772E);color:#fff;border-color:transparent}' +
        '.cg-mv textarea{box-sizing:border-box;width:100%;min-height:64px;font:12px/1.4 ui-monospace,monospace;' +
        'padding:6px;border-radius:8px;border:1px solid rgba(128,128,128,.5);background:rgba(128,128,128,.08);color:inherit;word-break:break-all}' +
        '.cg-mv-msg{font-size:13px;margin:4px 0;min-height:1em}' +
        '.cg-mv-msg.ng{color:#d33}' +
        '.cg-mv-ask{padding:8px;border-radius:10px;border:1.5px dashed var(--cg-accent,#C9772E);margin:6px 0}' +
        '.cg-mv a{color:inherit}';

    function addCss() {
        if (document.getElementById('cg-mv-css'))
            return;
        const s = document.createElement('style');
        s.id = 'cg-mv-css';
        s.textContent = CSS;
        document.head.append(s);
    }

    /** いまの保存を集める（無いキーは入れない） */
    function collect(keys) {
        const out = {};
        for (const k of keys) {
            const v = CG.ls.get(k, null);
            if (v !== null)
                out[k] = v;
        }
        return out;
    }

    /** 包みを確かめる（だめなら Error）。形とゲーム名は CG.save が確かめ済み */
    function checkBox(box, keys) {
        const d = box.data;
        if (d.move !== 1 || !d.keys || typeof d.keys !== 'object')
            throw new Error('引っ越し用のコードではありません。「セーブの引っ越し」で作ったコードを入れてください。');
        if (box.v > MOVE_VER)
            throw new Error('新しい版で作られたコードです。ページを読み直して、ゲームを最新にしてください。');
        const ok = Object.keys(d.keys).filter(k => keys.includes(k) && typeof d.keys[k] === 'string');
        if (!ok.length)
            throw new Error('このコードにはセーブデータが入っていません。');
        return ok;
    }

    /** 日時を短く（2026/10/27 13:05） */
    function when(at) {
        const a = new Date(at);
        return isNaN(a) ? '' : a.getFullYear() + '/' + (a.getMonth() + 1) + '/' + a.getDate() + ' ' + a.getHours() + ':' + CG.p2(a.getMinutes());
    }

    CG.move = {
        collect,

        /** el の中に「セーブの引っ越し」の欄（開け閉めできる）を作る */
        mount(el, opt) {
            if (!el)
                return;
            addCss();
            const keys = (opt && opt.keys) || [];
            const game = CG.info.game, title = CG.info.title || game;
            const d = document.createElement('details');
            d.className = 'cg-mv';
            d.innerHTML =
                '<summary>💾 セーブの引っ越し（保存・読み込み）</summary>' +
                '<div class="cg-mv-b">' +
                '<p>新しいアドレスや別の端末で、続きから遊ぶための機能です。手順は <a href="../hikkoshi/">引っ越しの手順</a> を見てください。</p>' +
                '<p><b>① 前のアドレス・前の端末で</b>：コードを作って、コピーします。</p>' +
                '<div class="cg-mv-row"><button type="button" class="cg-mv-go" data-a="make">コードを作ってコピー</button>' +
                '<button type="button" data-a="file">ファイルに保存</button></div>' +
                '<textarea class="cg-mv-out" readonly hidden aria-label="セーブの引っ越しコード"></textarea>' +
                '<p><b>② 新しいアドレス・新しい端末で</b>：コードを貼って、読み込みます。</p>' +
                '<textarea class="cg-mv-in" placeholder="ここにコード（CK1.〜）を貼る" aria-label="引っ越しコードを貼る欄"></textarea>' +
                '<div class="cg-mv-row"><button type="button" class="cg-mv-go" data-a="read">コードを読み込む</button>' +
                '<button type="button" data-a="open">ファイルから読む</button></div>' +
                '<input type="file" accept=".json,application/json" hidden>' +
                '<div class="cg-mv-ask" hidden></div>' +
                '<div class="cg-mv-msg" role="status"></div>' +
                '</div>';
            el.append(d);

            const $ = s => d.querySelector(s);
            const out = $('.cg-mv-out'), inp = $('.cg-mv-in'), file = $('input[type=file]'), ask = $('.cg-mv-ask'), msg = $('.cg-mv-msg');
            const say = (t, ng) => {
                msg.textContent = t;
                msg.classList.toggle('ng', !!ng);
            };

            /** 運ぶ包みを作る（保存が無ければ null） */
            const pack = () => {
                const got = collect(keys);
                if (!Object.keys(got).length) {
                    say('このアドレスには、まだ ' + title + ' のセーブデータがありません。', true);
                    return null;
                }
                return Object.assign(CG.save.wrap({ move: 1, keys: got }, MOVE_VER), { from: location.host });
            };

            /** 読み込んだ包みを、確認してから書き込む */
            const offer = async (p) => {
                ask.hidden = true;
                let box, ok;
                try {
                    box = await p;
                    ok = checkBox(box, keys);
                }
                catch (e) {
                    say(e.message || '読み込めませんでした。', true);
                    return;
                }
                say('');
                ask.innerHTML = '<p>' + CG.esc(title) + ' のセーブデータ（' + CG.esc(when(box.at)) +
                    (box.from ? '・' + CG.esc(box.from) : '') + ' で作成）を読み込みます。<br>' +
                    '<b>このアドレスにある今のセーブデータは上書きされます。</b></p>' +
                    '<div class="cg-mv-row"><button type="button" class="cg-mv-go" data-a="yes">上書きして読み込む</button>' +
                    '<button type="button" data-a="no">やめる</button></div>';
                ask.hidden = false;
                ask.onclick = e => {
                    const a = e.target.dataset && e.target.dataset.a;
                    if (a === 'no') {
                        ask.hidden = true;
                        say('読み込みをやめました。');
                    }
                    if (a !== 'yes')
                        return;
                    const bad = ok.filter(k => !CG.ls.set(k, box.data.keys[k]));
                    ask.hidden = true;
                    if (bad.length) {
                        say('保存できませんでした（プライベートモードでは保存できません）。', true);
                        return;
                    }
                    say('読み込みました。ページを読み直します…');
                    CG.toast('セーブデータを読み込みました');
                    setTimeout(() => location.reload(), 900);
                };
            };

            d.addEventListener('click', async e => {
                const a = e.target.dataset && e.target.dataset.a;
                if (a === 'make') {
                    const box = pack();
                    if (!box)
                        return;
                    out.value = await CG.save.toCode(box);
                    out.hidden = false;
                    out.select();
                    const c = await CG.copy(out.value);
                    say(c ? 'コピーしました。新しいアドレスで「② コードを貼る」欄に貼ってください。' : 'コピーできませんでした。上の欄のコードを長押しして全部コピーしてください。', !c);
                }
                else if (a === 'file') {
                    const box = pack();
                    if (!box)
                        return;
                    const t = new Date();
                    CG.save.toFile(box, title + '_引っ越し_' + t.getFullYear() + CG.p2(t.getMonth() + 1) + CG.p2(t.getDate()) + '.json');
                    say('ファイルを保存しました。新しいアドレスで「ファイルから読む」を押して選んでください。');
                }
                else if (a === 'read') {
                    if (!inp.value.trim()) {
                        say('コードを貼ってから押してください。', true);
                        return;
                    }
                    offer(CG.save.fromCode(inp.value));
                }
                else if (a === 'open')
                    file.click();
            });
            file.addEventListener('change', () => {
                if (file.files[0])
                    offer(CG.save.fromFile(file.files[0]));
                file.value = '';
            });
            return d;
        }
    };
})();
