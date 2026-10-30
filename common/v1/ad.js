/**
 * ちくわゲームズ 共通部品 v1 — ad.js（広告。core.js の後に読む）
 *
 * リワード広告（最後まで見るとごほうびがもらえる広告）の入り口。AdSense の「ゲーム向け広告（Ad Placement API）」の adBreak を使う。
 * いまは広告を出していない（CG.ad.on が false）。そのあいだは ready() が false を返すので、ゲームは広告のボタンを出さない。
 *
 *   出すとき：CG.ad.on を true にし、CG.ad.client に 'ca-pub-…' を書く（AdSense の許可が降りてから。号口 CLAUDE.md 8 章の外部読み込みの例外）
 *   開発で試す：URL に ?ad=test を付けて開くと、本物の広告の代わりに「数秒待つだけの仮の広告」が出る（広告サービスは読み込まない）
 *
 *   if (CG.ad.ready()) … ボタンを出す
 *   CG.ad.kinds()                 → 見られる広告の種類 [{ k, n, m }]（m＝ごほうびの倍率。本物の広告は長さを選べないので1種類）
 *   CG.ad.reward({ kind, name })  → Promise<boolean>（最後まで見たら true、閉じた・広告が無いときは false）
 */
(function () {
    const CG = window.CG || (window.CG = {});
    const test = /[?&]ad=test\b/.test(location.search);

    /** 仮の広告の種類（?ad=test のときだけ。長いほどごほうびが多い） */
    const TEST_KINDS = [
        { k: 'short', n: '短い広告（15秒）', m: 1, sec: 5 },
        { k: 'long', n: '長い広告（30秒）', m: 2.5, sec: 10 }
    ];
    const REAL_KINDS = [{ k: 'std', n: '広告', m: 1 }];

    let loaded = false;
    /** 広告サービスを読み込む（本物のときだけ・1回だけ） */
    function load() {
        if (loaded || !CG.ad.client)
            return;
        loaded = true;
        const s = document.createElement('script');
        s.async = true;
        s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(CG.ad.client);
        s.crossOrigin = 'anonymous';
        s.dataset.adFrequencyHint = '30s';
        document.head.appendChild(s);
        window.adsbygoogle = window.adsbygoogle || [];
        window.adBreak = window.adConfig = function (o) { window.adsbygoogle.push(o); };
        window.adConfig({ preloadAdBreaks: 'on', sound: 'on' });
    }

    /** 仮の広告（画面を暗くして、数えたら閉じる。途中で閉じると false） */
    function fake(K) {
        return new Promise(res => {
            const o = document.createElement('div');
            o.setAttribute('role', 'dialog');
            o.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.82);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;font:700 16px system-ui,sans-serif;text-align:center;padding:24px';
            let n = K.sec;
            o.innerHTML = '<div style="font-size:13px;opacity:.7">開発用の仮の広告（?ad=test）</div><div style="font-size:42px">📺</div><div>' + K.n + '</div><div data-n style="font-size:28px">' + n + '</div><button type="button" style="font:inherit;padding:8px 18px;border-radius:999px;border:0;background:#fff;color:#222">閉じる（ごほうびなし）</button>';
            document.body.appendChild(o);
            const end = ok => {
                clearInterval(t);
                o.remove();
                res(ok);
            };
            const t = setInterval(() => {
                n--;
                o.querySelector('[data-n]').textContent = n;
                if (n <= 0)
                    end(true);
            }, 1000);
            o.querySelector('button').onclick = () => end(false);
        });
    }

    CG.ad = {
        /** 広告を出すか（AdSense の許可が降りたら true にする） */
        on: false,
        /** AdSense のサイト運営者 ID（'ca-pub-…'）。決まったら書く */
        client: '',
        /** 開発用の仮の広告か */
        test,
        /** 広告のボタンを出してよいか */
        ready() {
            if (test)
                return true;
            if (!this.on || !this.client)
                return false;
            load();
            return true;
        },
        /** 見られる広告の種類 */
        kinds() {
            return test ? TEST_KINDS.map(k => ({ k: k.k, n: k.n, m: k.m })) : REAL_KINDS.slice();
        },
        /** リワード広告を見せる。最後まで見たら true */
        reward(o = {}) {
            if (!this.ready())
                return Promise.resolve(false);
            if (test)
                return fake(TEST_KINDS.find(k => k.k === o.kind) || TEST_KINDS[0]);
            return new Promise(res => {
                let got = false;
                window.adBreak({
                    type: 'reward',
                    name: o.name || 'reward',
                    beforeReward: show => show(),
                    adViewed: () => { got = true; },
                    adDismissed: () => { got = false; },
                    adBreakDone: () => res(got)
                });
            });
        }
    };
})();
