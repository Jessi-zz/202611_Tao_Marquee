(() => {
    const KEY = 'zzMarquee';
    const CHANNEL = 'zzMarquee';

    const DEFAULTS = {
        text: '在停駐視窗輸入文字',
        mode: 'loop',
        latin: 'rotate',
        charGap: 0,
        latinGap: 0,
        speed: 40,
        gap: 160,
        pause: 2,
        stepLines: 4,
        vAlign: 'top'
    };

    const MODE_IDS = ['loop', 'pingpong', 'step', 'page'];
    const LIVE_KEYS = new Set(['speed', 'pause']);

    const root = document.documentElement;
    const vp = document.getElementById('viewport');
    const track = document.getElementById('track');
    const c1 = document.getElementById('copy1');
    const c2 = document.getElementById('copy2');

    let S = { ...DEFAULTS };
    let raf = 0;
    let last = 0;
    let anim = null;
    let H = 0, contentH = 0, lh = 0, baseY = 0;

    function sanitize(data) {
        const out = { ...DEFAULTS };
        Object.keys(DEFAULTS).forEach(k => { if (data && k in data) out[k] = data[k]; });
        if (!MODE_IDS.includes(out.mode)) out.mode = 'loop';
        if (out.latin !== 'stack') out.latin = 'rotate';
        out.charGap = Number(out.charGap);
        if (!isFinite(out.charGap)) out.charGap = 0;
        out.latinGap = Number(out.latinGap);
        if (!isFinite(out.latinGap)) out.latinGap = 0;
        return out;
    }

    function load() {
        try {
            const raw = localStorage.getItem(KEY);
            if (raw) S = sanitize(JSON.parse(raw));
        } catch (e) { /* use defaults */ }
    }

    function applyGap() {
        root.style.setProperty('--char-gap', S.charGap + 'px');
        root.style.setProperty('--latin-gap', S.latinGap + 'px');
    }

    /* Text layout */
    const TOKEN = /[\x21-\x7E](?:[\x20-\x7E]*[\x21-\x7E])?|\n|[ \t]|[\s\S]/gu;
    const VERT = /[—‘-‟‥…⺀-鿿豈-﫿︐-︟︰-﹏＀-￯\u{20000}-\u{3FFFF}]/u;

    function mk(cls, tag) {
        const e = document.createElement(tag || 'div');
        e.className = cls;
        return e;
    }

    function cell(kind, text, extra) {
        const c = mk('cell' + (extra ? ' ' + extra : ''));
        const s = mk(kind, 'span');
        s.textContent = text;
        c.appendChild(s);
        return c;
    }

    function spacer(full) {
        return mk(full ? 'sp nl' : 'sp');
    }

    function build(parent, text, latin) {
        const frag = document.createDocumentFragment();
        const src = String(text || '').replace(/\r\n?/g, '\n');
        for (const m of src.matchAll(TOKEN)) {
            const t = m[0];
            if (t === '\n') {
                frag.appendChild(spacer(true));
            } else if (t === ' ' || t === '\t') {
                frag.appendChild(spacer(false));
            } else if (/^[\x21-\x7E]/.test(t)) {
                if (latin === 'rotate') {
                    frag.appendChild(cell('v', t, 'run'));
                } else {
                    for (const ch of t) {
                        frag.appendChild(ch === ' ' ? spacer(false) : cell('h', ch));
                    }
                }
            } else {
                frag.appendChild(cell(VERT.test(t) ? 'v' : 'h', t));
            }
        }
        parent.replaceChildren(frag);
    }

    function applyText() {
        build(c1, S.text, S.latin);
        build(c2, S.text, S.latin);
    }

    /* Animations */
    const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

    function setPos(pos) {
        track.style.transform = `translate3d(0, ${baseY - pos}px, 0)`;
    }

    function modeLoop() {
        let pos = 0, wait = S.pause;
        const total = contentH + S.gap;
        setPos(0);
        return dt => {
            if (wait > 0) { wait -= dt; return; }
            pos += S.speed * dt;
            if (pos >= total) { pos = 0; wait = S.pause; }
            setPos(pos);
        };
    }

    function modePingPong() {
        const max = contentH - H;
        let pos = 0, dir = 1, wait = S.pause;
        setPos(0);
        return dt => {
            if (wait > 0) { wait -= dt; return; }
            pos += dir * S.speed * dt;
            if (pos >= max) { pos = max; dir = -1; wait = S.pause; }
            else if (pos <= 0) { pos = 0; dir = 1; wait = S.pause; }
            setPos(pos);
        };
    }

    function modeStep() {
        const max = contentH - H;
        const stepH = lh * Math.max(1, S.stepLines);
        let pos = 0, from = 0, to = 0, t = 0, phase = 'hold', wait = S.pause;
        setPos(0);
        return dt => {
            if (phase === 'hold') {
                wait -= dt;
                if (wait > 0) return;
                if (pos >= max - 0.5) { phase = 'fadeout'; t = 0; }
                else { from = pos; to = Math.min(pos + stepH, max); t = 0; phase = 'tween'; }
            }
            if (phase === 'tween') {
                t += dt;
                const k = Math.min(t / 0.45, 1);
                pos = from + (to - from) * ease(k);
                setPos(pos);
                if (k >= 1) { phase = 'hold'; wait = S.pause; }
                return;
            }
            if (phase === 'fadeout') {
                t += dt;
                track.style.opacity = 1 - Math.min(t / 0.4, 1);
                if (t >= 0.4) { pos = 0; setPos(0); phase = 'fadein'; t = 0; }
                return;
            }
            if (phase === 'fadein') {
                t += dt;
                track.style.opacity = Math.min(t / 0.4, 1);
                if (t >= 0.4) { track.style.opacity = 1; phase = 'hold'; wait = S.pause; }
            }
        };
    }

    function modePage() {
        const max = contentH - H;
        const pageH = Math.max(lh, Math.floor(H / lh) * lh);
        const pages = Math.ceil(max / pageH) + 1;
        let idx = 0, t = 0, phase = 'hold', wait = S.pause;
        setPos(0);
        return dt => {
            if (phase === 'hold') {
                wait -= dt;
                if (wait > 0) return;
                phase = 'fadeout'; t = 0;
            }
            if (phase === 'fadeout') {
                t += dt;
                track.style.opacity = 1 - Math.min(t / 0.4, 1);
                if (t >= 0.4) {
                    idx = (idx + 1) % pages;
                    setPos(Math.min(idx * pageH, max));
                    phase = 'fadein'; t = 0;
                }
                return;
            }
            if (phase === 'fadein') {
                t += dt;
                track.style.opacity = Math.min(t / 0.4, 1);
                if (t >= 0.4) { track.style.opacity = 1; phase = 'hold'; wait = S.pause; }
            }
        };
    }

    const MODES = { loop: modeLoop, pingpong: modePingPong, step: modeStep, page: modePage };

    function tick(now) {
        const dt = Math.min((now - last) / 1000, 0.1);
        last = now;
        if (anim) anim(dt);
        raf = requestAnimationFrame(tick);
    }

    function restart() {
        cancelAnimationFrame(raf);
        anim = null;
        track.style.opacity = 1;

        const pad = parseFloat(getComputedStyle(track).top) || 0;
        const fs = parseFloat(getComputedStyle(c1).fontSize) || 52;
        const lhRatio = parseFloat(getComputedStyle(root).getPropertyValue('--line-height')) || 1.4;

        H = vp.clientHeight - 2 * pad;
        contentH = c1.offsetHeight;
        lh = fs * lhRatio + S.charGap;
        const overflow = contentH > H + 1;

        vp.classList.toggle('scrolling', overflow);
        c2.style.display = (overflow && S.mode === 'loop') ? 'block' : 'none';
        c2.style.marginTop = S.gap + 'px';

        if (!overflow) {
            baseY = S.vAlign === 'center' ? Math.max(0, (H - contentH) / 2) : 0;
            setPos(0);
            return;
        }
        baseY = 0;
        anim = (MODES[S.mode] || modeLoop)();
        last = performance.now();
        raf = requestAnimationFrame(tick);
    }

    /* Sync with dock */
    function receive(data) {
        const next = sanitize(data);
        const changed = Object.keys(next).filter(k => next[k] !== S[k]);
        S = next;
        applyGap();
        if (changed.includes('text') || changed.includes('latin')) applyText();
        if (changed.includes('text')) loadFont();
        if (changed.length && !changed.every(k => LIVE_KEYS.has(k))) restart();
    }

    window.addEventListener('storage', e => {
        if (e.key !== KEY || !e.newValue) return;
        try { receive(JSON.parse(e.newValue)); } catch (err) { /* ignore */ }
    });

    if ('BroadcastChannel' in window) {
        const bc = new BroadcastChannel(CHANNEL);
        bc.onmessage = e => {
            const m = e.data || {};
            if (m.type === 'settings') receive(m.data);
            else if (m.type === 'replay') restart();
        };
    }

    function loadFont() {
        if (!document.fonts) return;
        document.fonts.load('40px "GenWanMin2 TC R"', S.text).finally(restart);
    }

    let resizeTimer = 0;
    const resizeObserver = new ResizeObserver(() => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(restart, 100);
    });
    resizeObserver.observe(vp);
    resizeObserver.observe(c1);

    load();
    applyGap();
    applyText();
    restart();
    loadFont();
    if (document.fonts) document.fonts.ready.then(restart);
})();
