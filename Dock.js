document.addEventListener('DOMContentLoaded', () => {
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

    const SCHEMA = [
        { key: 'mode', label: '動畫類型', en: 'Animation', type: 'seg', options: [
            ['loop', '連續滾動'], ['pingpong', '來回滾動'], ['step', '逐字跳動'], ['page', '分頁淡入']
        ] },
        { key: 'latin', label: '英數排列', en: 'Alphanumeric', type: 'seg', options: [
            ['rotate', '橫躺 90°'], ['stack', '逐字直排']
        ] },
        { key: 'charGap', label: '字距', en: 'Letter Spacing', type: 'range', min: -30, max: 80, step: 2, unit: 'px' },
        { key: 'latinGap', label: '英數橫躺字距', en: 'Latin Spacing', type: 'range', min: -10, max: 40, step: 1, unit: 'px', when: { latin: 'rotate' } },
        { key: 'speed', label: '滾動速度', en: 'Speed', type: 'range', min: 5, max: 300, step: 5, unit: 'px/s', modes: ['loop', 'pingpong'] },
        { key: 'gap', label: '尾端到句首空白', en: 'Loop Gap', type: 'range', min: 0, max: 600, step: 10, unit: 'px', modes: ['loop'] },
        { key: 'pause', label: '停留時間', en: 'Pause', type: 'range', min: 0, max: 10, step: 0.5, unit: 's' },
        { key: 'stepLines', label: '每次跳動字數', en: 'Step Chars', type: 'range', min: 1, max: 20, step: 1, unit: '字', modes: ['step'] },
        { key: 'vAlign', label: '未超出時垂直位置', en: 'Vertical', type: 'seg', options: [['top', '靠上'], ['center', '置中']] }
    ];

    const editPage = document.getElementById('editPage');
    const settingsPage = document.getElementById('settingsPage');
    const textInput = document.getElementById('textInput');
    const list = document.getElementById('settingsList');
    const bc = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL) : null;

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

    let S = { ...DEFAULTS };
    try {
        const raw = localStorage.getItem(KEY);
        if (raw) S = sanitize(JSON.parse(raw));
    } catch (e) { /* use defaults */ }

    function save() {
        localStorage.setItem(KEY, JSON.stringify(S));
        if (bc) bc.postMessage({ type: 'settings', data: S });
    }

    const items = {};

    function fmt(def, v) {
        return def.type === 'range' ? v + (def.unit ? ' ' + def.unit : '') : '';
    }

    function affectsVisibility(key) {
        return key === 'mode' || key === 'latin';
    }

    SCHEMA.forEach(def => {
        const el = document.createElement('section');
        el.className = 'setting-item';

        const head = document.createElement('div');
        head.className = 'setting-header';
        head.innerHTML = `<h3 data-en="${def.en}">${def.label}</h3>
            <span class="setting-value"></span>
            <button class="reset-btn" title="重置"><span class="material-icons">refresh</span></button>`;
        el.appendChild(head);

        const valueEl = head.querySelector('.setting-value');
        const body = document.createElement('div');
        el.appendChild(body);

        let refresh;

        if (def.type === 'range') {
            const input = document.createElement('input');
            input.type = 'range';
            input.min = def.min;
            input.max = def.max;
            input.step = def.step;
            input.addEventListener('input', () => {
                S[def.key] = parseFloat(input.value);
                valueEl.textContent = fmt(def, S[def.key]);
                save();
            });
            body.appendChild(input);
            refresh = () => {
                input.value = S[def.key];
                valueEl.textContent = fmt(def, S[def.key]);
            };
        } else {
            const seg = document.createElement('div');
            seg.className = 'seg';
            def.options.forEach(([val, label]) => {
                const b = document.createElement('button');
                b.textContent = label;
                b.dataset.val = String(val);
                b.addEventListener('click', () => {
                    S[def.key] = val;
                    refresh();
                    if (affectsVisibility(def.key)) updateVisibility();
                    save();
                });
                seg.appendChild(b);
            });
            body.appendChild(seg);
            refresh = () => {
                seg.querySelectorAll('button').forEach(b =>
                    b.classList.toggle('on', b.dataset.val === String(S[def.key])));
            };
        }

        head.querySelector('.reset-btn').addEventListener('click', () => {
            S[def.key] = DEFAULTS[def.key];
            refresh();
            if (affectsVisibility(def.key)) updateVisibility();
            save();
        });

        list.appendChild(el);
        items[def.key] = { el, refresh };
    });

    function updateVisibility() {
        SCHEMA.forEach(def => {
            const show = (!def.modes || def.modes.includes(S.mode)) &&
                (!def.when || Object.keys(def.when).every(k => S[k] === def.when[k]));
            items[def.key].el.classList.toggle('hidden', !show);
        });
    }

    function refreshAll() {
        SCHEMA.forEach(def => items[def.key].refresh());
        updateVisibility();
        textInput.value = S.text;
    }

    textInput.addEventListener('input', () => {
        S.text = textInput.value;
        save();
    });

    document.getElementById('clearBtn').addEventListener('click', () => {
        if (confirm('確定清除文字？')) {
            S.text = '';
            textInput.value = '';
            save();
        }
    });

    document.getElementById('replayBtn').addEventListener('click', () => {
        if (bc) bc.postMessage({ type: 'replay' });
        else save();
    });

    document.getElementById('resetAllBtn').addEventListener('click', () => {
        if (confirm('確定將所有設定重置為預設值？（文字會保留）')) {
            S = { ...DEFAULTS, text: S.text };
            refreshAll();
            save();
        }
    });

    function showEditPage() {
        editPage.classList.add('active');
        settingsPage.classList.remove('active');
    }

    function showSettingsPage() {
        settingsPage.classList.add('active');
        editPage.classList.remove('active');
        editPage.classList.add('slide-left');
        setTimeout(() => editPage.classList.remove('slide-left'), 300);
    }

    document.getElementById('settingsBtn').addEventListener('click', showSettingsPage);
    document.getElementById('setTextBtn').addEventListener('click', showEditPage);
    document.getElementById('backBtn').addEventListener('click', showEditPage);
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && settingsPage.classList.contains('active')) showEditPage();
    });

    refreshAll();
    save();
});