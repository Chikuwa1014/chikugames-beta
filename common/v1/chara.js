/**
 * ちくわゲームズ 共通部品 v1 — chara.js（ちくわくんの決まった絵。core.js の後に読み込む）
 *
 * ドット絵のちくわくんを canvas に描く。絵は 16×22 ドット。ほかの変数には頼らない。
 *
 *   読み込み：script タグの src に ../common/v1/chara.js
 *   CG.chara.chikuwakun(ctx, x, y, scale, pose, t)   // 足もとのまんなか (x, y) に描く
 *   const cv = CG.chara.canvas('happy', { scale: 4, animate: true });   // 描いた canvas 要素
 *   document.body.append(cv);
 *
 * ※ コメントには閉じタグ（スラッシュ＋script）を書かない（core.js の注意書きと同じ）
 */
(function () {
    const CG = window.CG || (window.CG = {});
    const chara = CG.chara = CG.chara || {};

    /** 使える pose：正面・喜ぶ・困る・寝る */
    chara.POSES = ['front', 'happy', 'sad', 'sleep'];

    /**
     * canvas() が使う枠の大きさ（scale 1 のとき、ドット数）。
     * 体は 16×22。腕・きらめき・寝るときのナイトキャップと「Z」がはみ出す分を足してある。
     * 足もとのまんなかは (w / 2, h - 2)（下の 2 ドットは影のぶん）
     */
    chara.SIZE = { w: 24, h: 30 };

    /**
     * ちくわくんを描く。
     * (x, y)：足もとのまんなか。scale：1ドットの大きさ（ctx の単位）。
     * pose：'front'（正面）・'happy'（喜ぶ）・'sad'（困る）・'sleep'（寝る）。t：秒（止めるときは 0）。
     * 絵は 16×22 ドット（寝るときは上にナイトキャップと「Z」が出る）。焼き色のついたちくわ。上に穴、正面に顔
     */
    chara.chikuwakun = function (ctx, x, y, scale, pose, t) {
        const s = scale, T = t || 0, ox = Math.round(x), oy = Math.round(y);
        let bob = 0;
        if (pose === 'happy') bob = -Math.round(Math.abs(Math.sin(T * 5)) * 2);
        else if (pose === 'sleep') bob = Math.sin(T * 1.6) > 0 ? 1 : 0;
        else if (pose === 'front') bob = Math.sin(T * 2.2) > 0.75 ? -1 : 0;
        const d = (dx, dy, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(ox + dx * s, oy + (dy + bob) * s, w * s, h * s); };
        const OUT = '#4A2810', CREAM = '#F3DDB2', CREAM_SH = '#E2C48E', YAKI = '#C9772E', YAKI_D = '#B5651F',
              RIM = '#E9A55B', RIM_D = '#D98B45', HOLE = '#6B3A17', EYE = '#2A1A10', CHEEK = '#EE9A86', MOUTH = '#7A3A1A';
        ctx.save();
        // 影（はねても地面に残す）
        ctx.globalAlpha = 0.28; ctx.fillStyle = '#000'; ctx.fillRect(ox - 6 * s, oy, 12 * s, s); ctx.globalAlpha = 1;
        // 腕（体のうしろ）
        if (pose === 'happy') { d(-10, -18, 3, 4, OUT); d(-9, -17, 1, 2, CREAM); d(7, -18, 3, 4, OUT); d(8, -17, 1, 2, CREAM); }
        else if (pose === 'front') { d(-9, -9, 2, 4, OUT); d(-9, -8, 1, 2, CREAM); d(7, -9, 2, 4, OUT); d(8, -8, 1, 2, CREAM); }
        else if (pose === 'sad') { d(-9, -7, 2, 4, OUT); d(-9, -6, 1, 2, CREAM); d(7, -7, 2, 4, OUT); d(8, -6, 1, 2, CREAM); }
        // ふちどり
        d(-6, -22, 12, 1, OUT); d(-7, -21, 14, 1, OUT); d(-8, -20, 16, 19, OUT); d(-7, -1, 14, 1, OUT);
        // 上の穴とふち
        d(-6, -21, 12, 1, RIM); d(-7, -20, 14, 2, RIM); d(-4, -20, 8, 1, HOLE); d(-3, -19, 6, 1, HOLE); d(-7, -18, 14, 1, RIM_D);
        // 焼き色の帯（上）と焦げ
        d(-7, -17, 14, 4, YAKI); d(-5, -16, 2, 1, YAKI_D); d(2, -15, 3, 1, YAKI_D);
        // 白いところ（顔）
        d(-7, -13, 14, 9, CREAM); d(6, -13, 1, 9, CREAM_SH);
        // 焼き色の帯（下）
        d(-7, -4, 14, 2, YAKI); d(-7, -2, 14, 1, YAKI_D); d(3, -4, 2, 1, YAKI_D);
        // 顔
        if (pose === 'happy') {
            d(-5, -10, 1, 1, EYE); d(-4, -11, 2, 1, EYE); d(-2, -10, 1, 1, EYE);
            d(1, -10, 1, 1, EYE); d(2, -11, 2, 1, EYE); d(4, -10, 1, 1, EYE);
            d(-2, -8, 4, 2, MOUTH); d(-1, -7, 2, 1, '#E0705E');
            d(-6, -8, 2, 1, CHEEK); d(4, -8, 2, 1, CHEEK);
            if (Math.floor(T * 4) % 2 === 0) { d(-11, -21, 1, 1, '#FFE38A'); d(10, -22, 1, 1, '#FFE38A'); d(11, -12, 1, 1, '#FFE38A'); }
        } else if (pose === 'sad') {
            d(-4, -11, 2, 2, EYE); d(2, -11, 2, 2, EYE);
            d(-5, -13, 2, 1, EYE); d(-3, -14, 1, 1, EYE); d(3, -13, 2, 1, EYE); d(2, -14, 1, 1, EYE);
            d(-2, -7, 1, 1, MOUTH); d(-1, -8, 2, 1, MOUTH); d(1, -7, 1, 1, MOUTH);
            d(-6, -8, 2, 1, CHEEK); d(4, -8, 2, 1, CHEEK);
            d(8, -16, 1, 1, '#CFEAFF'); d(8, -15, 1, 2, '#8FC7F0');
        } else if (pose === 'sleep') {
            d(-5, -10, 3, 1, EYE); d(2, -10, 3, 1, EYE);
            d(-1, -7, 2, 1, MOUTH);
            d(-6, -8, 2, 1, CHEEK); d(4, -8, 2, 1, CHEEK);
            // ナイトキャップ
            d(-6, -23, 11, 2, '#3F5FA8'); d(-4, -25, 7, 2, '#3F5FA8'); d(1, -26, 3, 1, '#3F5FA8'); d(4, -26, 2, 2, '#F4F1E8'); d(-6, -22, 11, 1, '#F4F1E8');
            // Z
            for (let i = 0; i < 2; i++) {
                const ph = (T * 0.45 + i * 0.5) % 1, zx = 7 + i * 2 + Math.round(ph * 3), zy = -26 - Math.round(ph * 7);
                ctx.globalAlpha = 1 - ph; const c = '#DCE6FF';
                d(zx, zy, 3, 1, c); d(zx + 1, zy + 1, 1, 1, c); d(zx, zy + 2, 3, 1, c);
                ctx.globalAlpha = 1;
            }
        } else {
            if ((T % 3.4) < 0.13) { d(-4, -10, 2, 1, EYE); d(2, -10, 2, 1, EYE); }
            else { d(-4, -12, 2, 3, EYE); d(2, -12, 2, 3, EYE); d(-4, -12, 1, 1, '#FFFFFF'); d(2, -12, 1, 1, '#FFFFFF'); }
            d(-1, -8, 2, 1, MOUTH);
            d(-6, -8, 2, 1, CHEEK); d(4, -8, 2, 1, CHEEK);
        }
        ctx.restore();
    };

    /**
     * ちくわくんを描いた canvas 要素を返す。
     *   opt.scale：1ドットの大きさ（既定 4）。opt.animate：true なら動かす（要素が DOM から外れたら止まる）
     * 動かすのは、要素が DOM に入ってから。prefers-reduced-motion のときは動かさず、止めた絵のまま。
     */
    chara.canvas = function (pose, opt) {
        opt = opt || {};
        const scale = opt.scale || 4;
        const p = chara.POSES.includes(pose) ? pose : 'front';
        const cv = document.createElement('canvas');
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const w = chara.SIZE.w * scale, h = chara.SIZE.h * scale;
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
        cv.style.width = w + 'px';
        cv.style.height = h + 'px';
        cv.style.imageRendering = 'pixelated';
        cv.setAttribute('aria-hidden', 'true');
        const ctx = cv.getContext('2d');
        const draw = t => {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, cv.width, cv.height);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.imageSmoothingEnabled = false;
            chara.chikuwakun(ctx, w / 2, h - 2 * scale, scale, p, t);
        };
        draw(0);
        const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (opt.animate && !still) {
            let t0 = 0, seen = false;
            const loop = now => {
                if (cv.isConnected) seen = true;
                else if (seen) return;   // DOM から外れたら止める
                if (!t0) t0 = now;
                draw((now - t0) / 1000);
                requestAnimationFrame(loop);
            };
            requestAnimationFrame(loop);
        }
        return cv;
    };
})();
