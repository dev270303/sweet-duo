/* =====================================================================
   social.js — chat, emoji reactions, poke and player profiles
   Shared by every Game Room game. Works for 2 players or a table of 4.

   Usage:
     const social = Social.create({
       theme: 'dark' | 'auto',            // 'auto' follows the phone's light/dark setting
       send: msg => ...,                   // how to deliver a message to the other player(s)
       anchorFor: sid => element | null,   // where a player sits on screen (for bubbles/reactions)
       pokeTarget: () => sid | null,       // whose turn it is (poke goes to them); null = everyone
       dock: { chat: el, react: el }       // optional: put the two buttons inside your layout
     });
     social.mountProfile(lobbyElement);    // name + avatar picker
     social.setMode('online' | 'bot' | 'off');
     social.hello();                       // announce yourself after connecting
     if (social.handle(msg)) return;       // in your data handler, before game messages
   All messages use types starting with "s:". A host relaying for several
   guests should pass every "s:" message on to the other guests.

   Simple 2-player style (one shared instance per page):
     Social.profilePicker(el);
     Social.init({ send, anchorFor: () => el, shakeEl, onPeer: p => ..., chatBtn, reactBtn });
     Social.reset('message'); Social.setBot({ name, avatar }); Social.show(true); Social.hello();
     if (Social.handle(msg)) return;
     Social.botSay(text, null, delay); Social.botReact(index, null, delay); Social.oppName();
   ===================================================================== */
(function () {
  'use strict';

  const AVATARS = ['😎', '🦊', '🐼', '🐯', '🦁', '🐸', '👻', '🤠', '🦄', '🐙', '🍕', '🚀'];
  const REACTS = ['😂', '😮', '😡', '😎', '🔥', '👏', '😭', '😈', '🤝', '💀'];
  const QUICK = ['Nice one!', 'Hurry up 😴', 'Oops 🙈', 'Not again!', 'GG 🤝', 'Rematch?', 'Lucky!', 'Watch this 😏'];
  const KEY = 'gameroom-profile';

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  function loadProfile() {
    let p = { name: 'Player', avatar: AVATARS[0] };
    try {
      const s = JSON.parse(store.get(KEY) || store.get('lastcard-profile') || 'null');
      if (s && typeof s.name === 'string' && AVATARS.includes(s.avatar)) p = { name: s.name.slice(0, 16) || 'Player', avatar: s.avatar };
    } catch (e) {}
    return p;
  }
  const clean = t => String(t == null ? '' : t).replace(/\s+/g, ' ').trim();
  const ME = loadProfile();
  ME.sid = 'p' + Math.random().toString(36).slice(2, 10);
  const profileListeners = [];
  function saveProfile() { store.set(KEY, JSON.stringify({ name: ME.name, avatar: ME.avatar })); profileListeners.forEach(f => { try { f(ME); } catch (e) {} }); }
  function pageTheme() {
    // pages that are always dark get the dark chat; pages that follow the phone get 'auto'
    try {
      const m = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g);
      if (!m) return 'auto';
      const lum = (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255;
      const sysDark = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
      return lum < .45 && !sysDark ? 'dark' : 'auto';
    } catch (e) { return 'auto'; }
  }
  const themeClass = t => 'sx-root ' + (t === 'light' ? 'sx-light' : t === 'auto' ? 'sx-auto' : '');
  function injectCSS() { if (!document.getElementById('sx-css')) { const st = document.createElement('style'); st.id = 'sx-css'; st.textContent = CSS; document.head.appendChild(st); } }
  function mountProfile(el, theme) {
    injectCSS();
    const h2 = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
    const wrap = h2('div', themeClass(theme || pageTheme()) + ' sx-profile');
    wrap.innerHTML = '<label class="sx-lbl">Your name</label><input class="sx-name" maxlength="16" placeholder="Player" autocomplete="nickname"><span class="sx-lbl">Your avatar</span><div class="sx-pick" role="group" aria-label="Pick an avatar"></div>';
    const id = 'sx-name-' + Math.random().toString(36).slice(2, 7);
    wrap.querySelector('input').id = id; wrap.querySelector('label').setAttribute('for', id);
    const inp = wrap.querySelector('input'), pick = wrap.querySelector('.sx-pick');
    inp.value = ME.name === 'Player' ? '' : ME.name;
    inp.addEventListener('input', () => { ME.name = clean(inp.value).slice(0, 16) || 'Player'; saveProfile(); });
    AVATARS.forEach(a => {
      const b = h2('button'); b.type = 'button'; b.textContent = a; b.setAttribute('aria-label', 'Avatar ' + a);
      b.setAttribute('aria-pressed', a === ME.avatar ? 'true' : 'false');
      b.onclick = () => { ME.avatar = a; saveProfile(); [...pick.children].forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); };
      pick.appendChild(b);
    });
    el.appendChild(wrap);
    return wrap;
  }

  const CSS = `
  .sx-root { --sx-bg:#0d0f14; --sx-panel:#161922; --sx-panel2:#1d2130; --sx-ink:#f3f1ec; --sx-muted:#9aa0ae; --sx-line:#2a2f3d; --sx-me:#3d63dd; --sx-red:#e5484d; --sx-yellow:#f2b52e;
    font-family: inherit; color: var(--sx-ink); }
  .sx-root.sx-light { --sx-bg:#f6f3ee; --sx-panel:#ffffff; --sx-panel2:#f1ede5; --sx-ink:#1b1a17; --sx-muted:#5f5b53; --sx-line:#ddd6c9; --sx-me:#1f5fc4; }
  @media (prefers-color-scheme: light) {
    .sx-root.sx-auto { --sx-bg:#f6f3ee; --sx-panel:#ffffff; --sx-panel2:#f1ede5; --sx-ink:#1b1a17; --sx-muted:#5f5b53; --sx-line:#ddd6c9; --sx-me:#1f5fc4; }
  }
  .sx-hidden { display: none !important; }
  .sx-fab { position: fixed; z-index: 44; bottom: max(14px, env(safe-area-inset-bottom)); width: 54px; height: 54px; border-radius: 50%;
    border: 1px solid var(--sx-line); background: var(--sx-panel); color: var(--sx-ink); display: grid; place-items: center; font-size: 25px; line-height: 1;
    box-shadow: 0 10px 26px rgba(0,0,0,.28); cursor: pointer; transition: transform .12s cubic-bezier(.2,.8,.2,1), background .2s; font-family: inherit; padding: 0; }
  .sx-fab:active { transform: scale(.9); }
  .sx-fab svg { width: 22px; height: 22px; }
  .sx-fab.sx-on { background: var(--sx-ink); color: var(--sx-bg); }
  .sx-fab.sx-chat { left: max(14px, calc(50vw - 300px)); }
  .sx-fab.sx-react { right: max(14px, calc(50vw - 300px)); }
  .sx-fab.sx-docked { position: relative; left: auto; right: auto; bottom: auto; box-shadow: none; }
  html.sx-active body { padding-bottom: calc(84px + env(safe-area-inset-bottom)) !important; }
  .sx-unread { position: absolute; top: -3px; right: -3px; min-width: 21px; height: 21px; padding: 0 5px; border-radius: 11px; background: var(--sx-red); color: #fff;
    font-size: 12px; font-weight: 800; display: grid; place-items: center; border: 2px solid var(--sx-bg); }
  .sx-tray { position: fixed; z-index: 46; background: var(--sx-panel); border: 1px solid var(--sx-line); border-radius: 24px; padding: 10px;
    display: grid; grid-template-columns: repeat(5, 50px); gap: 6px; box-shadow: 0 24px 60px rgba(0,0,0,.45); transform-origin: 90% 100%; }
  .sx-tray button { width: 50px; height: 50px; border-radius: 15px; border: 0; background: transparent; font-size: 30px; line-height: 1; cursor: pointer; padding: 0;
    transition: transform .12s cubic-bezier(.2,.8,.2,1), background .15s; color: var(--sx-ink); font-family: inherit; }
  .sx-tray button:hover { background: var(--sx-panel2); }
  .sx-tray button:active { transform: scale(.82); }
  .sx-tray .sx-poke { grid-column: 1 / -1; width: auto; height: 44px; font-size: 15px; font-weight: 800; background: var(--sx-panel2); border: 1px solid var(--sx-line); }
  .sx-tray .sx-poke:disabled { opacity: .45; }
  .sx-rx { position: fixed; inset: 0; pointer-events: none; z-index: 90; overflow: hidden; }
  .sx-big { position: absolute; left: 50%; top: 44%; font-size: clamp(120px, 36vw, 180px); line-height: 1; margin: -.5em 0 0 -.5em; width: 1em; height: 1em; text-align: center; filter: drop-shadow(0 16px 30px rgba(0,0,0,.45)); }
  .sx-ring { position: absolute; left: 50%; top: 44%; width: 140px; height: 140px; margin: -70px 0 0 -70px; border-radius: 50%; border: 5px solid rgba(255,255,255,.85); }
  .sx-flash { position: absolute; inset: 0; background: radial-gradient(circle at 50% 44%, rgba(255,255,255,.24), transparent 55%); }
  .sx-bit { position: absolute; left: 50%; top: 44%; width: 40px; height: 40px; margin: -20px 0 0 -20px; font-size: 36px; line-height: 40px; text-align: center; }
  .sx-tag { position: absolute; left: 50%; top: calc(44% + 104px); transform: translateX(-50%); white-space: nowrap; padding: 7px 16px; border-radius: 999px; background: rgba(10,12,18,.72);
    border: 1px solid rgba(255,255,255,.14); color: #f3f1ec; font-weight: 800; font-size: 15px; backdrop-filter: blur(8px); }
  .sx-trail { position: absolute; width: 44px; height: 44px; margin: -22px 0 0 -22px; font-size: 36px; line-height: 44px; text-align: center; }
  .sx-bubble { position: fixed; z-index: 47; max-width: min(250px, 66vw); padding: 9px 13px; border-radius: 18px; background: var(--sx-ink); color: var(--sx-bg);
    font-weight: 600; font-size: 15px; line-height: 1.3; box-shadow: 0 12px 30px rgba(0,0,0,.35); overflow-wrap: anywhere; pointer-events: none; }
  .sx-bubble.sx-typing { display: flex; gap: 5px; padding: 13px 15px; }
  .sx-bubble.sx-typing i { width: 7px; height: 7px; border-radius: 50%; background: var(--sx-muted); animation: sx-dot 1s infinite; }
  .sx-bubble.sx-typing i:nth-child(2) { animation-delay: .15s; } .sx-bubble.sx-typing i:nth-child(3) { animation-delay: .3s; }
  @keyframes sx-dot { 0%, 60%, 100% { transform: translateY(0); opacity: .45; } 30% { transform: translateY(-4px); opacity: 1; } }
  .sx-shake { animation: sx-shake .5s; }
  @keyframes sx-shake { 15%, 55% { transform: translateX(-10px); } 35%, 75% { transform: translateX(10px); } }
  .sx-shade { position: fixed; inset: 0; z-index: 54; background: rgba(5,6,10,.45); opacity: 0; pointer-events: none; transition: opacity .3s; }
  .sx-shade.sx-open { opacity: 1; pointer-events: auto; }
  .sx-drawer { position: fixed; left: 0; right: 0; bottom: 0; z-index: 55; max-width: 560px; margin: 0 auto; height: min(74dvh, 580px); background: var(--sx-panel);
    border: 1px solid var(--sx-line); border-bottom: 0; border-radius: 26px 26px 0 0; display: flex; flex-direction: column; box-shadow: 0 -24px 70px rgba(0,0,0,.45);
    transform: translateY(105%); transition: transform .38s cubic-bezier(.2,.8,.2,1); visibility: hidden; }
  .sx-drawer.sx-open { transform: none; visibility: visible; }
  .sx-head { display: flex; align-items: center; gap: 12px; padding: 14px 14px 12px 16px; border-bottom: 1px solid var(--sx-line); }
  .sx-avs { display: flex; }
  .sx-av { width: 42px; height: 42px; border-radius: 50%; display: grid; place-items: center; font-size: 22px; background: var(--sx-panel2); border: 2px solid var(--sx-panel); flex: none; }
  .sx-avs .sx-av + .sx-av { margin-left: -12px; }
  .sx-who { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .sx-who b { font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sx-who span { font-size: 13px; color: var(--sx-muted); min-height: 16px; }
  .sx-x { width: 44px; height: 44px; border-radius: 14px; border: 1px solid var(--sx-line); background: var(--sx-panel2); color: var(--sx-ink); display: grid; place-items: center; cursor: pointer; padding: 0; }
  .sx-x svg { width: 20px; height: 20px; }
  .sx-msgs { flex: 1; overflow-y: auto; padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; overscroll-behavior: contain; }
  .sx-msg { max-width: 78%; padding: 9px 13px; border-radius: 19px; font-size: 15px; line-height: 1.35; overflow-wrap: anywhere; animation: sx-in .28s cubic-bezier(.2,.8,.2,1); }
  .sx-msg.sx-me { align-self: flex-end; background: var(--sx-me); color: #fff; border-bottom-right-radius: 6px; }
  .sx-msg.sx-them { align-self: flex-start; background: var(--sx-panel2); border: 1px solid var(--sx-line); border-bottom-left-radius: 6px; }
  .sx-msg.sx-sys { align-self: center; background: none; color: var(--sx-muted); font-size: 13px; padding: 4px; text-align: center; }
  .sx-msg.sx-big { font-size: 40px; background: none !important; border: 0 !important; padding: 0 4px; }
  .sx-from { align-self: flex-start; font-size: 12px; color: var(--sx-muted); margin: 6px 0 -2px 6px; font-weight: 700; }
  @keyframes sx-in { from { transform: translateY(10px) scale(.95); opacity: 0; } }
  .sx-quick { display: flex; gap: 8px; overflow-x: auto; padding: 8px 16px 4px; scrollbar-width: none; }
  .sx-quick::-webkit-scrollbar { display: none; }
  .sx-quick button { flex: none; min-height: 38px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--sx-line); background: var(--sx-panel2); color: var(--sx-ink); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
  .sx-form { display: flex; gap: 8px; padding: 8px 12px max(12px, env(safe-area-inset-bottom)); }
  .sx-form input { flex: 1; min-width: 0; min-height: 48px; border-radius: 24px; border: 1px solid var(--sx-line); background: var(--sx-bg); color: var(--sx-ink); padding: 0 18px; font: inherit; font-size: 16px; }
  .sx-form input:focus { outline: none; border-color: var(--sx-ink); }
  .sx-form button { width: 48px; height: 48px; border-radius: 50%; border: 0; background: var(--sx-ink); color: var(--sx-bg); display: grid; place-items: center; flex: none; cursor: pointer; padding: 0; }
  .sx-form button svg { width: 20px; height: 20px; }
  .sx-profile { display: flex; flex-direction: column; gap: 10px; }
  .sx-lbl { font-size: 13px; color: var(--sx-muted); font-weight: 600; }
  .sx-name { font: inherit; font-size: 17px; font-weight: 700; min-height: 50px; border-radius: 16px; border: 1px solid var(--sx-line); background: var(--sx-bg); color: var(--sx-ink); padding: 0 16px; width: 100%; box-sizing: border-box; }
  .sx-name:focus { outline: none; border-color: var(--sx-ink); }
  .sx-pick { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 2px; }
  .sx-pick::-webkit-scrollbar { display: none; }
  .sx-pick button { width: 46px; height: 46px; border-radius: 14px; border: 1px solid var(--sx-line); background: var(--sx-panel2); font-size: 24px; flex: none; cursor: pointer; padding: 0; line-height: 1; }
  .sx-pick button[aria-pressed="true"] { border: 2px solid var(--sx-ink); background: var(--sx-bg); }
  @media (prefers-reduced-motion: reduce) { .sx-root *, .sx-rx * { animation-duration: .01ms !important; transition-duration: .01ms !important; } }
  `;

  const ICON_CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 01-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1121 12z"/></svg>';
  const ICON_DOWN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  const ICON_SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

  function h(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function tone(f1, f2, dur, type, vol, delay) {
    if (window.Kit && Kit.tone) return Kit.tone(f1, f2, dur, type, vol, delay);
    if (store.get('gameroom-muted') === '1' || store.get('lastcard-muted') === '1') return;
    try {
      const AC = tone.ac = tone.ac || new (window.AudioContext || window.webkitAudioContext)();
      const t = AC.currentTime + (delay || 0), o = AC.createOscillator(), g = AC.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(vol || .08, t); g.gain.exponentialRampToValueAtTime(.0008, t + dur);
      o.connect(g).connect(AC.destination); o.start(t); o.stop(t + dur + .03);
    } catch (e) {}
  }
  const buzz = p => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} };

  function create(opts) {
    opts = opts || {};
    injectCSS();
    const me = ME;
    if (opts.onProfile) profileListeners.push(opts.onProfile);
    let send = opts.send || (() => {});
    let mode = 'off';
    const people = new Map();       // sid -> { name, avatar, bot }
    let unread = 0, open = false, lastPoke = 0, lastReact = 0, lastTyping = 0, lastSender = null;
    const bubbles = new Map(), typingTimers = new Map();
    const themeCls = themeClass(opts.theme || pageTheme());

    /* ---------- DOM ---------- */
    const root = h('div', themeCls);
    const adopt = !!(opts.buttons && opts.buttons.chat && opts.buttons.react);
    let chatBtn, reactBtn;
    if (adopt) {
      chatBtn = opts.buttons.chat; reactBtn = opts.buttons.react;
      if (getComputedStyle(chatBtn).position === 'static') chatBtn.style.position = 'relative';
      chatBtn.insertAdjacentHTML('beforeend', '<span class="sx-unread sx-hidden" style="position:absolute;top:-3px;right:-3px;min-width:21px;height:21px;padding:0 5px;border-radius:11px;background:#e5484d;color:#fff;font-size:12px;font-weight:800;display:grid;place-items:center;border:2px solid #0d0f14">0</span>');
    } else {
      chatBtn = h('button', 'sx-fab sx-chat sx-hidden', ICON_CHAT + '<span class="sx-unread sx-hidden">0</span>');
      chatBtn.type = 'button'; chatBtn.setAttribute('aria-label', 'Open chat');
      reactBtn = h('button', 'sx-fab sx-react sx-hidden', '😄');
      reactBtn.type = 'button'; reactBtn.setAttribute('aria-label', 'Send a reaction'); reactBtn.setAttribute('aria-expanded', 'false');
    }
    const unreadEl = chatBtn.querySelector('.sx-unread');
    const tray = h('div', 'sx-tray sx-hidden'); tray.setAttribute('role', 'dialog'); tray.setAttribute('aria-label', 'Reactions');
    const rx = h('div', 'sx-rx');
    const shade = h('div', 'sx-shade');
    const drawer = h('section', 'sx-drawer');
    drawer.setAttribute('role', 'dialog'); drawer.setAttribute('aria-label', 'Chat');
    drawer.innerHTML =
      '<div class="sx-head"><div class="sx-avs"></div><div class="sx-who"><b>Chat</b><span></span></div>' +
      '<button type="button" class="sx-x" aria-label="Close chat">' + ICON_DOWN + '</button></div>' +
      '<div class="sx-msgs" aria-live="polite"></div><div class="sx-quick"></div>' +
      '<form class="sx-form" autocomplete="off"><input maxlength="200" placeholder="Message…" aria-label="Message" enterkeyhint="send">' +
      '<button type="submit" aria-label="Send">' + ICON_SEND + '</button></form>';
    const msgs = drawer.querySelector('.sx-msgs'), input = drawer.querySelector('input');
    const headAvs = drawer.querySelector('.sx-avs'), headName = drawer.querySelector('.sx-who b'), headSub = drawer.querySelector('.sx-who span');

    if (adopt) { /* the page owns the buttons */ }
    else if (opts.dock && opts.dock.chat && opts.dock.react) {
      chatBtn.classList.add('sx-docked'); reactBtn.classList.add('sx-docked');
      const wrapC = h('div', themeCls); wrapC.appendChild(chatBtn); opts.dock.chat.appendChild(wrapC);
      const wrapR = h('div', themeCls); wrapR.appendChild(reactBtn); opts.dock.react.appendChild(wrapR);
    } else { root.appendChild(chatBtn); root.appendChild(reactBtn); }
    root.append(tray, rx, shade, drawer);
    (document.body ? Promise.resolve() : new Promise(r => document.addEventListener('DOMContentLoaded', r))).then(() => document.body.appendChild(root));

    /* ---------- tray ---------- */
    REACTS.forEach((r, i) => {
      const b = h('button'); b.type = 'button'; b.textContent = r; b.setAttribute('aria-label', 'React ' + r);
      b.onclick = () => { api.react(i); closeTray(); };
      tray.appendChild(b);
    });
    const pokeBtn = h('button', 'sx-poke'); pokeBtn.type = 'button'; pokeBtn.textContent = '👉 Poke — hurry them up';
    pokeBtn.onclick = () => { poke(); closeTray(); };
    tray.appendChild(pokeBtn);

    function openTray() {
      const r = reactBtn.getBoundingClientRect();
      tray.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
      tray.style.bottom = (window.innerHeight - r.top + 10) + 'px';
      tray.classList.remove('sx-hidden'); reactBtn.classList.add(adopt ? 'on' : 'sx-on'); reactBtn.setAttribute('aria-expanded', 'true');
      pokeBtn.disabled = Date.now() - lastPoke < 5000;
      tray.animate([{ opacity: 0, transform: 'scale(.6) translateY(20px)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 260, easing: 'cubic-bezier(.2,1.3,.4,1)' });
      [...tray.children].forEach((b, i) => b.animate([{ opacity: 0, transform: 'translateY(12px) scale(.6)' }, { opacity: 1, transform: 'none' }], { duration: 260, delay: i * 18, easing: 'cubic-bezier(.2,1.3,.4,1)', fill: 'backwards' }));
    }
    function closeTray() { tray.classList.add('sx-hidden'); reactBtn.classList.remove('sx-on', 'on'); reactBtn.setAttribute('aria-expanded', 'false'); }
    reactBtn.addEventListener('click', e => { e.stopPropagation(); tray.classList.contains('sx-hidden') ? openTray() : closeTray(); });
    document.addEventListener('click', e => { if (!tray.classList.contains('sx-hidden') && !tray.contains(e.target)) closeTray(); });

    /* ---------- people ---------- */
    const others = () => [...people.entries()].filter(([sid]) => sid !== me.sid);
    function nameOf(sid) { if (sid === me.sid) return me.name; const p = people.get(sid); return p ? p.name : 'Friend'; }
    function avatarOf(sid) { if (sid === me.sid) return me.avatar; const p = people.get(sid); return p ? p.avatar : '🙂'; }
    function paintHead() {
      const o = others();
      headAvs.innerHTML = '';
      (o.length ? o.slice(0, 3) : [[null, { avatar: '💬' }]]).forEach(([, p]) => { const a = h('div', 'sx-av'); a.textContent = p.avatar; headAvs.appendChild(a); });
      headName.textContent = o.length === 0 ? 'Chat' : o.length === 1 ? o[0][1].name : 'Table chat';
      if (![...typingTimers.keys()].length) headSub.textContent = o.length > 1 ? o.map(([, p]) => p.name).join(', ') : mode === 'bot' ? 'bot · always online' : o.length ? 'online' : 'waiting for players';
    }

    /* ---------- reactions ---------- */
    function originOf(sid) {
      const W = window.innerWidth, H = window.innerHeight;
      if (sid === me.sid) { const r = reactBtn.getBoundingClientRect(); return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: W - 40, y: H - 60 }; }
      const el = opts.anchorFor && opts.anchorFor(sid);
      if (el) { const r = el.getBoundingClientRect(); if (r.width) return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
      return { x: W / 2, y: 70 };
    }
    function showReaction(emoji, sid) {
      const W = window.innerWidth, H = window.innerHeight, cx = W / 2, cy = H * .44, src = originOf(sid), mine = sid === me.sid;
      const trail = h('div', 'sx-trail'); trail.textContent = emoji; trail.style.left = src.x + 'px'; trail.style.top = src.y + 'px'; rx.appendChild(trail);
      trail.animate([
        { transform: 'translate(0,0) scale(.6)', opacity: 0 },
        { transform: 'translate(' + ((cx - src.x) * .5) + 'px,' + ((cy - src.y) * .5 - 40) + 'px) scale(1.4)', opacity: 1, offset: .5 },
        { transform: 'translate(' + (cx - src.x) + 'px,' + (cy - src.y) + 'px) scale(2.4)', opacity: 0 }
      ], { duration: 360, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' }).finished.then(() => trail.remove(), () => trail.remove());
      setTimeout(() => {
        const flash = h('div', 'sx-flash'); rx.appendChild(flash);
        flash.animate([{ opacity: 0 }, { opacity: 1, offset: .2 }, { opacity: 0 }], { duration: 900, fill: 'forwards' }).finished.then(() => flash.remove(), () => flash.remove());
        const ring = h('div', 'sx-ring'); rx.appendChild(ring);
        ring.animate([{ transform: 'scale(.3)', opacity: .9 }, { transform: 'scale(2.8)', opacity: 0 }], { duration: 700, easing: 'cubic-bezier(.1,.7,.3,1)', fill: 'forwards' }).finished.then(() => ring.remove(), () => ring.remove());
        const big = h('div', 'sx-big'); big.textContent = emoji; rx.appendChild(big);
        big.animate([
          { transform: 'scale(.2) rotate(-25deg)', opacity: 0 },
          { transform: 'scale(1.25) rotate(8deg)', opacity: 1, offset: .16 },
          { transform: 'scale(.95) rotate(-5deg)', opacity: 1, offset: .28 },
          { transform: 'scale(1.05) rotate(3deg)', opacity: 1, offset: .4 },
          { transform: 'scale(1) rotate(0deg)', opacity: 1, offset: .72 },
          { transform: 'scale(1.1) translateY(-90px)', opacity: 0 }
        ], { duration: 1800, easing: 'ease-out', fill: 'forwards' }).finished.then(() => big.remove(), () => big.remove());
        const N = 16;
        for (let k = 0; k < N; k++) {
          const bit = h('div', 'sx-bit'); bit.textContent = emoji; rx.appendChild(bit);
          const ang = (k / N) * Math.PI * 2 + Math.random() * .4, dist = 120 + Math.random() * Math.min(W, H) * .32;
          const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist, sc = .5 + Math.random() * .7, spin = (Math.random() - .5) * 540;
          bit.animate([
            { transform: 'translate(0,0) scale(.2) rotate(0deg)', opacity: 0 },
            { transform: 'translate(' + dx * .7 + 'px,' + dy * .7 + 'px) scale(' + sc + ') rotate(' + spin * .6 + 'deg)', opacity: 1, offset: .35 },
            { transform: 'translate(' + dx + 'px,' + (dy + 140) + 'px) scale(' + sc * .8 + ') rotate(' + spin + 'deg)', opacity: 0 }
          ], { duration: 1300 + Math.random() * 500, delay: 40 + Math.random() * 120, easing: 'cubic-bezier(.15,.7,.4,1)', fill: 'both' }).finished.then(() => bit.remove(), () => bit.remove());
        }
        const tag = h('div', 'sx-tag'); tag.textContent = mine ? 'You' : avatarOf(sid) + ' ' + nameOf(sid); rx.appendChild(tag);
        tag.animate([{ opacity: 0, transform: 'translateX(-50%) translateY(10px)' }, { opacity: 1, transform: 'translateX(-50%)', offset: .15 }, { opacity: 1, transform: 'translateX(-50%)', offset: .75 }, { opacity: 0, transform: 'translateX(-50%)' }], { duration: 1700, fill: 'forwards' }).finished.then(() => tag.remove(), () => tag.remove());
        if (!mine) { const el = opts.anchorFor && opts.anchorFor(sid); if (el) el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.15) rotate(-4deg)' }, { transform: 'scale(1)' }], { duration: 450, easing: 'cubic-bezier(.2,1.4,.4,1)' }); }
        tone(700, 1100, .08, 'sine', .08); tone(1100, 1500, .1, 'sine', .06, .07);
        buzz(mine ? 15 : [20, 30, 20]);
      }, 300);
    }

    /* ---------- bubbles ---------- */
    function placeBubble(b, sid) {
      const el = opts.anchorFor && opts.anchorFor(sid);
      const W = window.innerWidth, H = window.innerHeight;
      let r = el ? el.getBoundingClientRect() : null;
      if (!r || !r.width) r = { left: W / 2 - 20, right: W / 2 + 20, top: 40, bottom: 80, width: 40, height: 40 };
      const bw = b.offsetWidth, bh = b.offsetHeight;
      let left = r.left + r.width / 2 - 24, top;
      const below = r.top < H * .55;
      top = below ? r.bottom + 8 : r.top - bh - 8;
      left = Math.max(8, Math.min(W - bw - 8, left));
      top = Math.max(8, Math.min(H - bh - 8, top));
      b.style.left = left + 'px'; b.style.top = top + 'px';
      b.style.borderRadius = below ? '6px 18px 18px 18px' : '18px 18px 18px 6px';
      b.style.transformOrigin = below ? '0 0' : '0 100%';
    }
    function clearBubble(sid) { const b = bubbles.get(sid); if (b) { clearTimeout(b._t); b.remove(); bubbles.delete(sid); } }
    function showBubble(sid, text) {
      clearBubble(sid);
      const b = h('div', 'sx-bubble'); b.textContent = text.length > 90 ? text.slice(0, 88) + '…' : text;
      root.appendChild(b); placeBubble(b, sid); bubbles.set(sid, b);
      b.animate([{ transform: 'scale(.4)', opacity: 0 }, { transform: 'scale(1.05)', opacity: 1, offset: .6 }, { transform: 'scale(1)', opacity: 1 }], { duration: 300, easing: 'cubic-bezier(.2,1.3,.4,1)' });
      b._t = setTimeout(() => { b.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(-6px)' }], { duration: 250, fill: 'forwards' }).finished.then(() => { if (bubbles.get(sid) === b) bubbles.delete(sid); b.remove(); }, () => b.remove()); }, Math.min(6000, 2600 + text.length * 45));
    }
    function showTyping(sid) {
      headSub.textContent = nameOf(sid) + ' is typing…';
      const cur = bubbles.get(sid);
      if (!cur || cur.classList.contains('sx-typing')) {
        clearBubble(sid);
        const b = h('div', 'sx-bubble sx-typing', '<i></i><i></i><i></i>');
        root.appendChild(b); placeBubble(b, sid); bubbles.set(sid, b);
      }
      clearTimeout(typingTimers.get(sid));
      typingTimers.set(sid, setTimeout(() => stopTyping(sid), 3000));
    }
    function stopTyping(sid) {
      clearTimeout(typingTimers.get(sid)); typingTimers.delete(sid);
      const b = bubbles.get(sid); if (b && b.classList.contains('sx-typing')) clearBubble(sid);
      paintHead();
    }

    /* ---------- chat ---------- */
    QUICK.forEach(q => { const b = h('button'); b.type = 'button'; b.textContent = q; b.onclick = () => sendChat(q); drawer.querySelector('.sx-quick').appendChild(b); });
    REACTS.slice(0, 6).forEach(r => { const b = h('button'); b.type = 'button'; b.textContent = r; b.style.fontSize = '20px'; b.onclick = () => sendChat(r); drawer.querySelector('.sx-quick').appendChild(b); });

    function paintUnread() { unreadEl.textContent = unread > 9 ? '9+' : unread; unreadEl.classList.toggle('sx-hidden', !unread); }
    function openChat() {
      open = true; unread = 0; paintUnread(); closeTray(); paintHead();
      drawer.classList.add('sx-open'); shade.classList.add('sx-open'); chatBtn.setAttribute('aria-label', 'Close chat');
      msgs.scrollTop = msgs.scrollHeight;
      setTimeout(() => { try { input.focus({ preventScroll: true }); } catch (e) {} }, 320);
    }
    function closeChat() {
      open = false; drawer.classList.remove('sx-open'); shade.classList.remove('sx-open'); chatBtn.setAttribute('aria-label', 'Open chat');
      try { input.blur(); } catch (e) {}
    }
    chatBtn.addEventListener('click', () => open ? closeChat() : openChat());
    drawer.querySelector('.sx-x').onclick = closeChat; shade.onclick = closeChat;
    drawer.querySelector('form').addEventListener('submit', e => { e.preventDefault(); const t = input.value; input.value = ''; sendChat(t); });
    input.addEventListener('input', () => {
      const now = Date.now();
      if (mode === 'online' && now - lastTyping > 1500 && input.value.trim()) { lastTyping = now; send({ t: 's:typing', sid: me.sid }); }
    });

    const emojiOnly = t => { try { return /^(\p{Extended_Pictographic}|️|‍|\s)+$/u.test(t) && t.trim().length <= 8; } catch (e) { return false; } };
    function addMsg(text, who, sid) {
      if (who === 'them' && sid !== lastSender && others().length > 1) { const f = h('div', 'sx-from'); f.textContent = avatarOf(sid) + ' ' + nameOf(sid); msgs.appendChild(f); }
      lastSender = who === 'sys' ? null : sid;
      const d = h('div', 'sx-msg sx-' + who + (who !== 'sys' && emojiOnly(text) ? ' sx-big' : ''));
      d.textContent = text;
      msgs.appendChild(d);
      while (msgs.children.length > 160) msgs.firstChild.remove();
      msgs.scrollTop = msgs.scrollHeight;
    }
    function sendChat(text) {
      text = clean(text).slice(0, 200);
      if (!text || mode === 'off') return;
      addMsg(text, 'me', me.sid); tone(880, 1200, .06, 'sine', .05);
      if (mode === 'bot') botReply(text); else send({ t: 's:chat', sid: me.sid, text });
    }
    function gotChat(sid, text) {
      text = clean(text).slice(0, 200);
      if (!text) return;
      stopTyping(sid);
      addMsg(text, 'them', sid);
      if (!open) { unread++; paintUnread(); chatBtn.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 350 }); }
      showBubble(sid, text);
      tone(1000, 760, .08, 'sine', .07); buzz(15);
    }

    /* ---------- poke ---------- */
    function poke() {
      const now = Date.now(); if (now - lastPoke < 5000) return; lastPoke = now;
      const to = opts.pokeTarget ? opts.pokeTarget() : null;
      const name = to && to !== me.sid ? nameOf(to) : (others().length === 1 ? others()[0][1].name : 'everyone');
      toastLite('Poked ' + name + ' 👉');
      if (mode === 'bot') {
        const bots = others().filter(([, p]) => p.bot); const b = bots[Math.floor(Math.random() * bots.length)];
        if (b) api.botSay(b[0], ["Relax, I'm thinking 😤", 'Patience!', 'Okay okay 🙄', 'Stop poking me 😂'][Math.floor(Math.random() * 4)], 900);
        return;
      }
      send({ t: 's:poke', sid: me.sid, to: to && to !== me.sid ? to : null });
    }
    function gotPoked(sid) {
      const target = opts.shakeTarget ? opts.shakeTarget() : (opts.shakeEl || document.body);
      if (target) { target.classList.remove('sx-shake'); void target.offsetWidth; target.classList.add('sx-shake'); setTimeout(() => target.classList.remove('sx-shake'), 600); }
      buzz([120, 60, 120]); tone(300, 200, .15, 'square', .06); tone(300, 200, .15, 'square', .06, .2);
      toastLite(nameOf(sid) + ' poked you!');
    }
    function toastLite(text) {
      if (window.Kit && Kit.toast) return Kit.toast(text, null, 1200);
      const t = h('div', 'sx-tag'); t.textContent = text; t.style.position = 'fixed'; t.style.top = '38%'; t.style.zIndex = 95; root.appendChild(t);
      t.animate([{ opacity: 0 }, { opacity: 1, offset: .15 }, { opacity: 1, offset: .8 }, { opacity: 0 }], { duration: 1300, fill: 'forwards' }).finished.then(() => t.remove(), () => t.remove());
    }

    /* ---------- bot personality ---------- */
    function botReply(text) {
      const bots = others().filter(([, p]) => p.bot);
      if (!bots.length) return;
      const sid = bots[Math.floor(Math.random() * bots.length)][0];
      const t = text.toLowerCase();
      let r;
      if (/\b(hi|hello|hey|yo|namaste)\b/.test(t)) r = ['Hey! Ready to lose? 😏', 'Hello human 🤖', 'Yo! Let\'s go.'];
      else if (/\bgg\b|good game|well played/.test(t)) r = ['GG! Rematch? 🤝', 'Well played 👏'];
      else if (/lol|haha|😂|🤣/.test(t)) r = ['😂', "Glad you're having fun", 'Laugh now…'];
      else if (/cheat|unfair|rigged/.test(t)) r = ['Me? Never 😇', 'The dice decide, not me', 'Skill issue 😎'];
      else if (/hurry|fast|slow|😴/.test(t)) r = ['Calculating… 🧮', 'Good things take time'];
      else if (/lucky|luck/.test(t)) r = ['Luck? That was strategy 😤', 'Call it what you want 😏'];
      else if (/rematch|again/.test(t)) r = ['Always. Bring it on 🔥', "You're on!"];
      else if (/\?$/.test(t)) r = ['Hmm, maybe 🤔', 'Ask me after this round', "Can't say, I'm busy winning"];
      else r = ['Interesting… 🤔', 'Noted 📝', 'Focus on the game 😏', '👀', 'Bold words'];
      if (Math.random() < .2) { api.botReact(sid, [0, 4, 5, 1][Math.floor(Math.random() * 4)], 900); return; }
      api.botSay(sid, r[Math.floor(Math.random() * r.length)], 300);
    }

    /* ---------- public API ---------- */
    const api = {
      AVATARS, REACTS,
      me,
      people,
      setSend(fn) { send = fn || (() => {}); },
      get mode() { return mode; },
      setMode(m) {
        mode = m;
        const on = m !== 'off';
        if (!adopt) { chatBtn.classList.toggle('sx-hidden', !on); reactBtn.classList.toggle('sx-hidden', !on); }
        document.documentElement.classList.toggle('sx-active', on && !opts.dock && !adopt);
        if (!on) { closeTray(); closeChat(); bubbles.forEach((b, sid) => clearBubble(sid)); }
        paintHead();
      },
      hello() { send({ t: 's:hello', sid: me.sid, name: me.name, avatar: me.avatar }); },
      handle(msg) {
        if (!msg || typeof msg.t !== 'string' || msg.t.slice(0, 2) !== 's:') return false;
        const sid = typeof msg.sid === 'string' ? msg.sid.slice(0, 32) : null;
        if (!sid || sid === me.sid) return true;
        switch (msg.t) {
          case 's:hello': {
            const known = people.has(sid);
            people.set(sid, { name: clean(msg.name).slice(0, 16) || 'Friend', avatar: AVATARS.includes(msg.avatar) ? msg.avatar : (msg.bot && typeof msg.avatar === 'string' ? msg.avatar.slice(0, 4) : '🙂'), bot: !!msg.bot });
            if (!known && !msg.bot) sys(avatarOf(sid) + ' ' + nameOf(sid) + ' joined');
            if (!msg.reply && !msg.bot) send({ t: 's:hello', sid: me.sid, name: me.name, avatar: me.avatar, reply: true });
            paintHead();
            if (opts.onPeople) opts.onPeople(sid);
            break;
          }
          case 's:react': if (Number.isInteger(msg.i) && REACTS[msg.i]) showReaction(REACTS[msg.i], sid); break;
          case 's:chat': gotChat(sid, msg.text); break;
          case 's:typing': showTyping(sid); break;
          case 's:poke': if (!msg.to || msg.to === me.sid) gotPoked(sid); break;
        }
        return true;
      },
      react(i) {
        const now = Date.now(); if (now - lastReact < 600 || !REACTS[i]) return; lastReact = now;
        showReaction(REACTS[i], me.sid);
        if (mode === 'online') send({ t: 's:react', sid: me.sid, i });
      },
      reset() {
        people.clear(); msgs.innerHTML = ''; unread = 0; lastSender = null; paintUnread();
        bubbles.forEach((b, sid) => clearBubble(sid)); paintHead();
      },
      addBot(p, announce) {
        people.set(p.sid, { name: p.name, avatar: p.avatar || '🤖', bot: true }); paintHead();
        if (announce) send({ t: 's:hello', sid: p.sid, name: p.name, avatar: p.avatar || '🤖', bot: true, reply: true });
      },
      setPerson(sid, p) { people.set(sid, Object.assign({ bot: false }, p)); paintHead(); },
      removePerson(sid) { people.delete(sid); clearBubble(sid); paintHead(); },
      botSay(sid, text, delay) {
        setTimeout(() => {
          if (mode === 'off') return;
          showTyping(sid);
          setTimeout(() => {
            if (mode === 'off') return;
            gotChat(sid, text);
            if (mode === 'online') send({ t: 's:chat', sid, text });
          }, 700 + Math.min(1600, text.length * 40));
        }, delay || 0);
      },
      botReact(sid, i, delay) {
        setTimeout(() => {
          if (mode === 'off' || !REACTS[i]) return;
          showReaction(REACTS[i], sid);
          if (mode === 'online') send({ t: 's:react', sid, i });
        }, delay || 500);
      },
      sys(text) { sys(text); },
      nameOf, avatarOf,
      oppName() { const o = others(); return o.length ? o[0][1].name : 'Friend'; },
      oppAvatar() { const o = others(); return o.length ? o[0][1].avatar : '🙂'; },
      showReaction,
      mountProfile(el) { return mountProfile(el, opts.theme); },
      closeAll() { closeTray(); closeChat(); }
    };
    function sys(text) { addMsg(text, 'sys'); }
    window.addEventListener('resize', () => bubbles.forEach((b, sid) => placeBubble(b, sid)));
    paintHead();
    return api;
  }

  /* ---------- simple shared instance (Social.init style) ---------- */
  let S = null, initOpts = {}, botSid = null, wantBot = false;
  const inst = () => S || (S = create(initOpts));
  const facade = {
    init(o) {
      o = o || {};
      initOpts = {
        send: o.send, theme: o.theme, anchorFor: o.anchorFor, pokeTarget: o.pokeTarget,
        shakeEl: o.shakeEl, shakeTarget: o.shakeTarget, dock: o.dock,
        buttons: (o.chatBtn && o.reactBtn) ? { chat: o.chatBtn, react: o.reactBtn } : null,
        onPeople: sid => { if (o.onPeer && S) { const p = S.people.get(sid); if (p && !p.bot) o.onPeer({ name: p.name, avatar: p.avatar }); } }
      };
      if (!S) S = create(initOpts);
      else S.setSend(o.send);
      return facade;
    },
    profilePicker(el) { return mountProfile(el, initOpts.theme); },
    show(on) { inst().setMode(on ? (wantBot ? 'bot' : 'online') : 'off'); },
    reset(msg) { const s = inst(); s.reset(); wantBot = false; botSid = null; if (msg) s.sys(msg); },
    setBot(p) { const s = inst(); botSid = 'bot-' + Math.random().toString(36).slice(2, 7); s.addBot({ sid: botSid, name: (p && p.name) || 'Computer', avatar: (p && p.avatar) || '🤖' }); wantBot = true; },
    hello() { inst().hello(); },
    handle(m) { return inst().handle(m); },
    oppName() { return S ? S.oppName() : 'Friend'; },
    oppAvatar() { return S ? S.oppAvatar() : '🙂'; },
    botSay(text, sid, delay) { const id = sid || botSid; if (id) inst().botSay(id, text, delay); },
    botReact(i, sid, delay) { const id = sid || botSid; if (id) inst().botReact(id, i, delay); },
    react(i) { inst().react(i); },
    sys(t) { inst().sys(t); },
    setMuted(m) { store.set('gameroom-muted', m ? '1' : '0'); if (window.Kit && Kit.setMuted) Kit.setMuted(m); },
    closeAll() { if (S) S.closeAll(); },
    get me() { return ME; },
    create, AVATARS, REACTS
  };
  window.Social = facade;
})();
