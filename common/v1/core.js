/**
 * ちくわゲームズ 共通部品 v1 — core.js（いちばん最初に読み込む）
 *
 * どのゲームでも使う小さな道具をまとめたもの。ほかの共通部品（share・save・debug・room）はこれを前提にする。
 * すべて window.CG（ちくわゲームズ）の下に置き、ゲームの変数や関数と名前がぶつからないようにする。
 *
 *   読み込み：ゲームの HTML で script タグの src に ../common/v1/core.js を書く（ほかの共通部品より先）
 *   ※ 共通部品のコメントには閉じタグ（スラッシュ＋script）を書かない。1 ファイルに埋め込んだとき、そこで script が終わってしまう
 *   CG.init({ game: 'shop-sim', title: 'ちいさなお店', version: '1.2.0' });
 *
 * 仕様を変えて古いゲームが動かなくなるときは v1 を直さず、common/v2/ を作る（公開済みのゲームを壊さない）。
 * 使い方の全体はリポジトリ直下の CLAUDE.md「14. 共通部品」と common/README.md。
 */
(function () {
    const CG = window.CG || (window.CG = {});
    CG.LIB = 'v1';

    /** ゲームの情報（init で決める）。game はフォルダ名＝URL、デバッグ送信・マルチの宛先にも使う */
    CG.info = { game: '', title: '', version: '' };
    CG.init = function (o) {
        Object.assign(CG.info, o || {});
        return CG;
    };

    /** localStorage の読み書き（失敗しても止まらない。プライベートモードなど） */
    CG.ls = {
        get(k, d = null) {
            try {
                const v = localStorage.getItem(k);
                return v === null ? d : v;
            }
            catch (e) {
                return d;
            }
        },
        set(k, v) {
            try {
                localStorage.setItem(k, v);
                return true;
            }
            catch (e) {
                return false;
            }
        },
        del(k) {
            try {
                localStorage.removeItem(k);
            }
            catch (e) { }
        },
        getJSON(k, d = null) {
            const v = CG.ls.get(k, null);
            if (v === null)
                return d;
            try {
                return JSON.parse(v);
            }
            catch (e) {
                return d;
            }
        },
        setJSON(k, v) {
            return CG.ls.set(k, JSON.stringify(v));
        }
    };

    /** HTML に埋め込むときの書き換え（< と & と "） */
    CG.esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

    /** 2桁ゼロ埋め */
    CG.p2 = n => String(n).padStart(2, '0');

    /** いま開いているゲームの公開 URL（? と # は付けない） */
    CG.pageUrl = () => location.origin + location.pathname;

    /**
     * 文字列をコピーする。成功なら true。
     * 新しい方法（clipboard）がだめなら、見えない入力欄を使う昔の方法を試す。prompt() は使わない（アーティファクトで働かない）
     */
    CG.copy = async function (text) {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        }
        catch (e) { }
        const t = document.createElement('textarea');
        t.value = text;
        t.setAttribute('readonly', '');
        t.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
        document.body.append(t);
        t.select();
        let ok = false;
        try {
            ok = document.execCommand('copy');
        }
        catch (e) { }
        t.remove();
        return ok;
    };

    /** ファイルとして保存（ダウンロード）。data は文字列か Blob */
    CG.download = function (name, data, type = 'application/json') {
        const blob = data instanceof Blob ? data : new Blob([data], { type });
        const u = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = u;
        a.download = name;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(u), 10000);
    };

    /** ファイルを文字列で読む（Promise） */
    CG.readText = file => new Promise((ok, ng) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result));
        r.onerror = () => ng(new Error('ファイルを読み取れませんでした。'));
        r.readAsText(file);
    });

    /** 画面の下に短いお知らせを出す（ms ミリ秒で消える） */
    let toastTimer = 0;
    CG.toast = function (msg, ms = 2200) {
        let el = document.getElementById('cg-toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'cg-toast';
            el.setAttribute('role', 'status');
            el.style.cssText = 'position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:9999;' +
                'max-width:calc(100vw - 32px);padding:10px 16px;border-radius:12px;background:rgba(30,30,30,.92);color:#fff;font-size:14px;' +
                'line-height:1.4;box-shadow:0 4px 14px rgba(0,0,0,.3);transition:opacity .2s;pointer-events:none;text-align:center';
            document.body.append(el);
        }
        el.textContent = msg;
        el.style.opacity = '1';
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.style.opacity = '0', ms);
    };
})();
