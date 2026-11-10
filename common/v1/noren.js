/**
 * ちくわゲームズ 共通部品 v1 — noren.js（のれん型の戻るボタン。core.js の後に読み込む）
 *
 * 見た目は yokocho.css（クラス cg-noren）。ゲームの左上などに「← 横丁へ」を置く。
 *
 *   読み込み：link で ../common/v1/yokocho.css、script で ../common/v1/noren.js
 *   CG.noren.mount(document.getElementById('back'));                 // その要素の中に入れる
 *   CG.noren.mount(null, { href: '../', label: '横丁へ', ai: true }); // 省略すると body の先頭。ai は夜の地の上で使う藍
 *
 * ※ コメントには閉じタグ（スラッシュ＋script）を書かない（core.js の注意書きと同じ）
 */
(function () {
    const CG = window.CG || (window.CG = {});
    CG.noren = CG.noren || {};

    /** target に「← 横丁へ」の a 要素を入れて、その a 要素を返す。target を省略すると body の先頭 */
    CG.noren.mount = function (target, opt) {
        const o = Object.assign({ href: '../', label: '横丁へ', ai: false }, opt || {});
        const a = document.createElement('a');
        a.className = 'cg-noren' + (o.ai ? ' cg-noren--ai' : '');
        a.href = o.href;
        a.setAttribute('aria-label', 'ちくわゲームズのトップ（おでん横丁）へ戻る');
        const nuno = document.createElement('span');
        nuno.className = 'cg-noren__nuno';
        nuno.textContent = '← ' + o.label;
        a.appendChild(nuno);
        if (target) target.appendChild(a);
        else document.body.insertBefore(a, document.body.firstChild);
        return a;
    };
})();
