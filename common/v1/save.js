/**
 * ちくわゲームズ 共通部品 v1 — save.js（セーブデータのファイルとセーブコード）。core.js の後に読む。
 *
 * ゲームの自動保存（localStorage）はゲームごとに書く。ここは「端末をまたいで持ち運ぶ」ための部品。
 * 中身は どちらも同じ「包み」{ game, v, at, data } で、game がちがうデータは読み込めない。
 *
 *   const box = CG.save.wrap(state, 2);              // 包み（v はゲームのセーブ形式の版）
 *   CG.save.toFile(box, 'ちいさなお店_….json');       // ファイルに書き出す
 *   const box2 = await CG.save.fromFile(file);       // ファイルから読む（だめなら Error。message は日本語）
 *   const code = await CG.save.toCode(box);          // セーブコード（文字列）にする
 *   const box3 = await CG.save.fromCode(code);       // セーブコードを読む（だめなら Error）
 *
 * セーブコードの形：CK1.<本体>.<チェック値>
 *   CK1 … 本体は JSON を deflate で縮めて base64url にしたもの
 *   CK0 … 縮める仕組みが無いブラウザ用（JSON をそのまま base64url）
 *   チェック値はゲーム名を混ぜたハッシュ。書き換えたコード・別のゲームのコードははじく（共通ルール 7 章）
 * 読み込み側は、v がゲームの今の版より新しいときは「ゲームを最新にして」とエラーにすること（box.v を見る）。
 */
(function () {
    const CG = window.CG;
    const err = t => new Error(t);

    /** ハッシュ（FNV-1a。つくれ！おでん横丁の checksum と同じ式。塩はゲーム名） */
    function checksum(str, game) {
        let h = 0x811c9dc5;
        for (const ch of 'chikuwa-' + game + str) {
            h ^= ch.charCodeAt(0);
            h = Math.imul(h, 0x01000193) >>> 0;
        }
        return h.toString(36);
    }

    /** バイト列 ⇔ base64url */
    function b64e(bytes) {
        let s = '';
        for (let i = 0; i < bytes.length; i += 0x8000)
            s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    function b64d(t) {
        const s = atob(t.replace(/-/g, '+').replace(/_/g, '/'));
        const b = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++)
            b[i] = s.charCodeAt(i);
        return b;
    }

    /** deflate（使えるブラウザだけ） */
    const canZip = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
    async function pipe(bytes, stream) {
        const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
        return new Uint8Array(await out.arrayBuffer());
    }

    /** 包みが正しい形か（game が合っているか）。だめなら Error */
    function check(box) {
        if (!box || typeof box !== 'object' || typeof box.game !== 'string')
            throw err('セーブデータの形ではありません。');
        // 共通部品より前の ちいさなお店（v1.1.x）は中身を state に入れていた。読めるようにそろえる
        if (!box.data && box.state && typeof box.state === 'object')
            box.data = box.state;
        if (box.game !== CG.info.game)
            throw err('このゲームのセーブデータではありません。');
        if (typeof box.v !== 'number' || !box.data || typeof box.data !== 'object')
            throw err('セーブデータが壊れています。');
        return box;
    }

    CG.save = {
        checksum,

        /** 包む（at は保存した日時） */
        wrap(data, v) {
            return { game: CG.info.game, v, at: new Date().toISOString(), data };
        },

        /** ファイルに書き出す */
        toFile(box, name) {
            CG.download(name, JSON.stringify(box), 'application/json');
        },

        /** ファイルから読む */
        async fromFile(file) {
            if (!file)
                throw err('ファイルが選ばれていません。');
            const t = await CG.readText(file);
            let box;
            try {
                box = JSON.parse(t);
            }
            catch (e) {
                throw err('ファイルを読み取れませんでした（JSONではありません）。');
            }
            return check(box);
        },

        /** セーブコードにする */
        async toCode(box) {
            const raw = new TextEncoder().encode(JSON.stringify(box));
            let head = 'CK0', body = raw;
            if (canZip) {
                try {
                    body = await pipe(raw, new CompressionStream('deflate-raw'));
                    head = 'CK1';
                }
                catch (e) {
                    body = raw;
                }
            }
            const p = head + '.' + b64e(body);
            return p + '.' + checksum(p, CG.info.game);
        },

        /** セーブコードを読む（前後の空白・改行は無視） */
        async fromCode(code) {
            const t = String(code || '').replace(/\s+/g, '');
            const m = t.match(/^(CK[01])\.([A-Za-z0-9_-]+)\.([0-9a-z]+)$/);
            if (!m)
                throw err('セーブコードの形ではありません。全部コピーできているか確かめてください。');
            if (checksum(m[1] + '.' + m[2], CG.info.game) !== m[3])
                throw err('セーブコードが正しくありません（途中が欠けている・書き換えた・別のゲームのコード）。');
            let bytes;
            try {
                bytes = b64d(m[2]);
                if (m[1] === 'CK1') {
                    if (!canZip)
                        throw err('このブラウザではこのセーブコードを読めません。ブラウザを新しくしてください。');
                    bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
                }
                return check(JSON.parse(new TextDecoder().decode(bytes)));
            }
            catch (e) {
                throw e && /セーブ|ブラウザ/.test(e.message) ? e : err('セーブコードを読み取れませんでした。');
            }
        }
    };
})();
