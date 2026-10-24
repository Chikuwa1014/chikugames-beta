/**
 * ちくわゲームズ 共通部品 v1 — share.js（SNS 共有）。core.js の後に読む。
 *
 * 共通ルール「5. SNS 共有」をそのまま形にしたもの。#ちくわげーむず は必ず付く（書き忘れても足す）。
 *
 *   const s = { msg: 'ちいさなお店を開いたけど倒産しちゃった！', tags: ['ちいさなお店'], url: CG.pageUrl() };
 *   CG.share.text(s)         // 文面（URL 込み）。コピー用の窓などに
 *   CG.share.open(s, file)   // 端末の共有メニュー（画像 file があれば添付）。使えなければ X の投稿画面
 *   CG.share.links(s)        // { x, line, facebook } のリンク先
 *   CG.share.copy(s)         // 文面をコピー（成功なら true）
 *
 * tags は # を付けずに書く。ゲーム固有のタグを先に、ちくわげーむず が最後に来る。
 */
(function () {
    const CG = window.CG;
    const SITE_TAG = 'ちくわげーむず';

    /** タグの並び（# なし、重複なし、ちくわげーむず を最後に） */
    function tagList(s) {
        const t = (s.tags || []).map(x => String(x).replace(/^#/, '')).filter(x => x && x !== SITE_TAG);
        return [...new Set(t), SITE_TAG];
    }
    const urlOf = s => s.url || CG.pageUrl();

    CG.share = {
        TAG: SITE_TAG,
        tags: tagList,

        /** 文面（本文・ハッシュタグ・URL を改行でつなぐ） */
        text(s) {
            return s.msg + '\n' + tagList(s).map(t => '#' + t).join(' ') + '\n' + urlOf(s);
        },

        /** 各 SNS の投稿画面の URL。Facebook は文面を渡せないので hashtag に #ちくわげーむず */
        links(s) {
            const e = encodeURIComponent, u = urlOf(s);
            return {
                x: 'https://x.com/intent/tweet?text=' + e(s.msg) + '&url=' + e(u) + '&hashtags=' + e(tagList(s).join(',')),
                line: 'https://social-plugins.line.me/lineit/share?url=' + e(u) + '&text=' + e(s.msg + '\n' + tagList(s).map(t => '#' + t).join(' ')),
                facebook: 'https://www.facebook.com/sharer/sharer.php?u=' + e(u) + '&hashtag=' + e('#' + SITE_TAG)
            };
        },

        /** X の投稿画面を開く */
        x(s) {
            window.open(CG.share.links(s).x, '_blank', 'noopener');
        },

        /**
         * 共有する。端末の共有メニューが使えればそれ（file があれば画像付き）、だめなら X の投稿画面。
         * 結果は 'shared'（共有メニュー）・'cancel'（とじた）・'x'（X を開いた）
         */
        async open(s, file) {
            const text = CG.share.text(s);
            const withFile = file ? { text, files: [file] } : null;
            const plain = { title: s.title || CG.info.title || document.title, text: s.msg + '\n' + tagList(s).map(t => '#' + t).join(' '), url: urlOf(s) };
            const data = withFile && navigator.canShare && navigator.canShare(withFile) ? withFile : (navigator.share && !file ? plain : null);
            if (data) {
                try {
                    await navigator.share(data);
                    return 'shared';
                }
                catch (e) {
                    if (e && e.name === 'AbortError')
                        return 'cancel';
                }
            }
            CG.share.x(s);
            return 'x';
        },

        /** 文面をコピー */
        copy(s) {
            return CG.copy(CG.share.text(s));
        }
    };
})();
