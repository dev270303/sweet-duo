/* =====================================================================
   kit.js — shared building blocks for Game Room games
   - Kit.tone / Kit.sfx / Kit.soundButton : tiny synth sound effects (no files)
   - Kit.toast / Kit.confetti / Kit.burst  : visual feedback
   - Kit.Dice                              : a real 3D dice that rolls
   - Kit.Room                              : PeerJS rooms (1 host + up to 3 guests)
   - Kit.Table                             : turn manager for 2-4 seats
                                             (local, vs computer, or online with a host referee)
   Needs PeerJS loaded first for online play.
   ===================================================================== */
(function () {
  'use strict';
  const Kit = {};

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  Kit.store = store;
  Kit.rand = n => crypto.getRandomValues(new Uint32Array(1))[0] % n;
  Kit.sleep = ms => new Promise(r => setTimeout(r, ms));
  Kit.clean = t => String(t == null ? '' : t).replace(/\s+/g, ' ').trim();

  /* ---------------- sound ---------------- */
  let AC = null, muted = store.get('gameroom-muted') === '1';
  Kit.tone = function (f1, f2, dur, type, vol, delay) {
    if (muted) return;
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      if (AC.state === 'suspended') AC.resume();
      const t = AC.currentTime + (delay || 0), o = AC.createOscillator(), g = AC.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
      g.gain.setValueAtTime(vol || .1, t); g.gain.exponentialRampToValueAtTime(.0008, t + dur);
      o.connect(g).connect(AC.destination); o.start(t); o.stop(t + dur + .03);
    } catch (e) {}
  };
  function noise(dur, vol, delay, freq) {
    if (muted) return;
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      const t = AC.currentTime + (delay || 0), n = Math.floor(AC.sampleRate * dur);
      const buf = AC.createBuffer(1, n, AC.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
      src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq || 2400; g.gain.value = vol || .12;
      src.connect(f).connect(g).connect(AC.destination); src.start(t);
    } catch (e) {}
  }
  const T = Kit.tone;
  Kit.sfx = {
    roll() { for (let i = 0; i < 6; i++) noise(.05, .1, i * .07, 1800 + Math.random() * 1600); },
    land() { T(180, 120, .09, 'triangle', .14); noise(.04, .08, 0, 900); },
    hop(i) { T(520 + (i || 0) * 40, 620 + (i || 0) * 40, .05, 'sine', .06); },
    pop() { T(700, 1200, .07, 'sine', .08); },
    capture() { T(220, 70, .35, 'sawtooth', .07); noise(.18, .14, .02, 600); },
    home() { [784, 988, 1175].forEach((f, i) => T(f, f, .12, 'triangle', .08, i * .07)); },
    ladder() { [392, 494, 587, 698, 784, 988].forEach((f, i) => T(f, f * 1.02, .08, 'triangle', .07, i * .06)); },
    snake() { T(900, 120, .9, 'sawtooth', .05); noise(.5, .05, .05, 3000); },
    power() { T(660, 1320, .18, 'sine', .08); T(990, 1980, .18, 'sine', .05, .08); },
    shield() { T(300, 900, .25, 'triangle', .08); },
    turn() { T(660, 990, .09, 'sine', .05); },
    bad() { T(170, 120, .14, 'sawtooth', .05); },
    tick() { T(1200, 1100, .03, 'square', .02); },
    win() { [523, 659, 784, 1047, 1319].forEach((f, i) => T(f, f, .2, 'triangle', .1, i * .11)); },
    lose() { T(392, 196, .5, 'triangle', .08); }
  };
  Kit.muted = () => muted;
  Kit.setMuted = m => { muted = !!m; store.set('gameroom-muted', muted ? '1' : '0'); };
  Kit.soundButton = function (btn) {
    const paint = () => {
      btn.innerHTML = muted
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M22 9l-6 6M16 9l6 6"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13"/></svg>';
      btn.setAttribute('aria-label', muted ? 'Sound off' : 'Sound on');
    };
    btn.addEventListener('click', () => { Kit.setMuted(!muted); paint(); if (!muted) Kit.sfx.pop(); });
    paint();
  };
  Kit.buzz = p => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} };

  /* ---------------- base styles ---------------- */
  const CSS = `
  .kit-toast { position: fixed; left: 50%; top: 40%; z-index: 80; pointer-events: none; transform: translate(-50%, -50%);
    font-weight: 800; font-size: clamp(28px, 9vw, 46px); letter-spacing: -1px; white-space: nowrap; color: #fff;
    text-shadow: 0 4px 24px rgba(0,0,0,.65), 0 2px 0 rgba(0,0,0,.25); opacity: 0; }
  .kit-confetti { position: fixed; top: -20px; width: 10px; height: 16px; border-radius: 2px; z-index: 85; pointer-events: none; }
  .kit-burst { position: fixed; z-index: 75; pointer-events: none; width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: 50%; }
  .kit-dice { --ds: 58px; width: var(--ds); height: var(--ds); perspective: 420px; border: 0; background: none; padding: 0; cursor: pointer; position: relative; display: block; flex: none; }
  .kit-dice:disabled { cursor: default; }
  .kit-dice .kit-hop { width: 100%; height: 100%; }
  .kit-cube { width: 100%; height: 100%; position: relative; transform-style: preserve-3d; transform: rotateX(0deg) rotateY(0deg); }
  .kit-face { position: absolute; inset: 0; border-radius: 20%; backface-visibility: hidden; -webkit-backface-visibility: hidden;
    background: linear-gradient(145deg, #ffffff, #e8e4dc); box-shadow: inset 0 0 0 1px rgba(0,0,0,.06), inset 0 -5px 10px rgba(0,0,0,.09), inset 0 3px 6px rgba(255,255,255,.9);
    display: grid; grid-template: repeat(3, 1fr) / repeat(3, 1fr); padding: 15%; box-sizing: border-box; }
  .kit-pip { width: 72%; height: 72%; margin: auto; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #4a4844, #121110 70%); box-shadow: inset 0 1px 2px rgba(0,0,0,.6); }
  .kit-face.f1 .kit-pip { background: radial-gradient(circle at 35% 30%, #ff6b6b, #b5121b 70%); width: 92%; height: 92%; }
  .kit-face.f1 { transform: translateZ(calc(var(--ds) / 2)); }
  .kit-face.f6 { transform: rotateY(180deg) translateZ(calc(var(--ds) / 2)); }
  .kit-face.f3 { transform: rotateY(90deg) translateZ(calc(var(--ds) / 2)); }
  .kit-face.f4 { transform: rotateY(-90deg) translateZ(calc(var(--ds) / 2)); }
  .kit-face.f5 { transform: rotateX(90deg) translateZ(calc(var(--ds) / 2)); }
  .kit-face.f2 { transform: rotateX(-90deg) translateZ(calc(var(--ds) / 2)); }
  .kit-dice::after { content: ''; position: absolute; left: 12%; right: 12%; bottom: -12%; height: 18%; border-radius: 50%; background: rgba(0,0,0,.35); filter: blur(5px); z-index: -1; }
  .kit-dice.kit-ready { animation: kit-ready 1.3s ease-in-out infinite; }
  .kit-dice.kit-ready .kit-face { box-shadow: inset 0 0 0 3px var(--dc, #fff), inset 0 -5px 10px rgba(0,0,0,.09); }
  @keyframes kit-ready { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-5px) scale(1.06); } }
  @media (prefers-reduced-motion: reduce) { .kit-dice.kit-ready { animation: none; } }
  `;
  function injectCSS() {
    if (document.getElementById('kit-css')) return;
    const s = document.createElement('style'); s.id = 'kit-css'; s.textContent = CSS; document.head.appendChild(s);
  }
  injectCSS();

  /* ---------------- toast, confetti, burst ---------------- */
  Kit.toast = function (text, color, ms) {
    let t = document.getElementById('kit-toast');
    if (!t) { t = document.createElement('div'); t.id = 'kit-toast'; t.className = 'kit-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = text;
    t.style.color = color || '#fff';
    t.getAnimations().forEach(a => a.cancel());
    t.animate([
      { opacity: 0, transform: 'translate(-50%,-50%) scale(.6) translateY(10px)' },
      { opacity: 1, transform: 'translate(-50%,-50%) scale(1.08)', offset: .18 },
      { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: .75 },
      { opacity: 0, transform: 'translate(-50%,-50%) scale(.96) translateY(-14px)' }
    ], { duration: ms || 1100, easing: 'ease-out', fill: 'both' });
  };
  Kit.confetti = function (colors, n) {
    colors = colors || ['#e5484d', '#f2b52e', '#2ba56a', '#3d63dd', '#ffffff'];
    for (let i = 0; i < (n || 90); i++) {
      const p = document.createElement('div'); p.className = 'kit-confetti';
      p.style.left = (Math.random() * 100) + 'vw'; p.style.background = colors[i % colors.length];
      document.body.appendChild(p);
      const drift = (Math.random() - .5) * 240, spin = (Math.random() - .5) * 1440;
      p.animate([
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        { transform: 'translate(' + drift + 'px,' + (window.innerHeight + 60) + 'px) rotate(' + spin + 'deg)', opacity: .9 }
      ], { duration: 1800 + Math.random() * 1600, delay: Math.random() * 400, easing: 'cubic-bezier(.25,.6,.4,1)', fill: 'forwards' })
        .finished.then(() => p.remove(), () => p.remove());
    }
  };
  Kit.burst = function (x, y, color, n, spread) {
    for (let i = 0; i < (n || 14); i++) {
      const b = document.createElement('div'); b.className = 'kit-burst';
      b.style.left = x + 'px'; b.style.top = y + 'px'; b.style.background = Array.isArray(color) ? color[i % color.length] : (color || '#fff');
      document.body.appendChild(b);
      const a = (i / (n || 14)) * Math.PI * 2 + Math.random() * .5, d = (spread || 60) * (.6 + Math.random() * .6);
      b.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: 'translate(' + Math.cos(a) * d + 'px,' + Math.sin(a) * d + 'px) scale(.2)', opacity: 0 }
      ], { duration: 600 + Math.random() * 300, easing: 'cubic-bezier(.1,.7,.3,1)', fill: 'forwards' }).finished.then(() => b.remove(), () => b.remove());
    }
  };

  /* ---------------- 3D dice ---------------- */
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const ORIENT = { 1: [0, 0], 6: [0, 180], 3: [0, -90], 4: [0, 90], 5: [-90, 0], 2: [90, 0] };
  Kit.Dice = function (opts) {
    opts = opts || {};
    const el = document.createElement('button');
    el.type = 'button'; el.className = 'kit-dice'; el.setAttribute('aria-label', 'Roll the dice');
    const hop = document.createElement('div'); hop.className = 'kit-hop';
    const cube = document.createElement('div'); cube.className = 'kit-cube';
    for (let v = 1; v <= 6; v++) {
      const f = document.createElement('div'); f.className = 'kit-face f' + v;
      for (let i = 0; i < 9; i++) {
        const cell = document.createElement('span');
        if (PIPS[v].includes(i)) cell.className = 'kit-pip';
        cell.style.gridArea = (Math.floor(i / 3) + 1) + ' / ' + (i % 3 + 1);
        f.appendChild(cell);
      }
      cube.appendChild(f);
    }
    hop.appendChild(cube); el.appendChild(hop);
    let rx = 0, ry = 0, value = 1;
    const api = {
      el,
      get value() { return value; },
      set(v) { value = v; rx = ORIENT[v][0]; ry = ORIENT[v][1]; cube.getAnimations().forEach(a => a.cancel()); cube.style.transform = 'rotateX(' + rx + 'deg) rotateY(' + ry + 'deg)'; el.setAttribute('aria-label', 'Dice shows ' + v); },
      roll(v, ms) {
        ms = ms || 900;
        const fromT = 'rotateX(' + rx + 'deg) rotateY(' + ry + 'deg)';
        const nrx = Math.ceil(rx / 360) * 360 + 720 + ORIENT[v][0] + (Kit.rand(2) ? 360 : 0);
        const nry = Math.ceil(ry / 360) * 360 + 720 + ORIENT[v][1] + (Kit.rand(2) ? 360 : 0);
        rx = nrx; ry = nry; value = v;
        const toT = 'rotateX(' + rx + 'deg) rotateY(' + ry + 'deg)';
        cube.style.transform = toT;
        Kit.sfx.roll();
        hop.animate([
          { transform: 'translateY(0) rotate(0deg) scale(1)' },
          { transform: 'translateY(-42%) rotate(-18deg) scale(1.12)', offset: .3 },
          { transform: 'translateY(0) rotate(8deg) scale(.96)', offset: .62 },
          { transform: 'translateY(-10%) rotate(-3deg) scale(1.03)', offset: .8 },
          { transform: 'translateY(0) rotate(0deg) scale(1)' }
        ], { duration: ms, easing: 'ease-out' });
        el.setAttribute('aria-label', 'Dice shows ' + v);
        return cube.animate([{ transform: fromT }, { transform: toT }], { duration: ms, easing: 'cubic-bezier(.15,.6,.25,1)' })
          .finished.then(() => { Kit.sfx.land(); }, () => {});
      },
      setColor(c) { el.style.setProperty('--dc', c); },
      setReady(r) { el.classList.toggle('kit-ready', !!r); el.disabled = !r; }
    };
    if (opts.size) el.style.setProperty('--ds', opts.size + 'px');
    api.set(opts.value || 5);
    return api;
  };

  /* ---------------- rooms (PeerJS star: host + guests) ---------------- */
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const code5 = () => { let s = ''; for (const n of crypto.getRandomValues(new Uint8Array(5))) s += ALPHA[n % ALPHA.length]; return s; };
  const NET_ERR = "Couldn't reach the connection service. Check your internet and try again.";
  Kit.Room = {
    available: () => typeof window.Peer !== 'undefined',
    host(o) {
      let peer = null, code = null, dead = false;
      const conns = new Map();
      const api = {
        locked: false,
        get code() { return code; },
        get size() { return conns.size; },
        send(id, m) { const c = conns.get(id); if (c && c.open) c.send(m); },
        broadcast(m, except) { conns.forEach((c, id) => { if (id !== except && c.open) c.send(m); }); },
        kick(id) { const c = conns.get(id); conns.delete(id); if (c) setTimeout(() => { try { c.close(); } catch (e) {} }, 300); },
        close() { dead = true; conns.forEach(c => { try { c.close(); } catch (e) {} }); conns.clear(); try { peer && peer.destroy(); } catch (e) {} }
      };
      function start() {
        code = code5();
        peer = new Peer(o.prefix + code);
        peer.on('open', () => { if (!dead && o.onReady) o.onReady(code); });
        peer.on('connection', c => {
          c.on('open', () => {
            if (dead) return;
            if (api.locked || conns.size >= o.max) { c.send({ t: 'full' }); setTimeout(() => { try { c.close(); } catch (e) {} }, 300); return; }
            conns.set(c.peer, c);
            if (o.onJoin) o.onJoin(c.peer);
          });
          c.on('data', m => { if (!dead && conns.get(c.peer) === c && m && typeof m === 'object' && o.onData) o.onData(c.peer, m); });
          c.on('close', () => { if (conns.get(c.peer) === c) { conns.delete(c.peer); if (!dead && o.onLeave) o.onLeave(c.peer); } });
          c.on('error', () => {});
        });
        peer.on('disconnected', () => { if (!dead && peer && !peer.destroyed) { try { peer.reconnect(); } catch (e) {} } });
        peer.on('error', err => {
          if (dead) return;
          if (err.type === 'unavailable-id') { try { peer.destroy(); } catch (e) {} start(); return; }
          if (['network', 'server-error', 'browser-incompatible', 'socket-error', 'socket-closed'].includes(err.type) && !conns.size) { if (o.onError) o.onError(NET_ERR); }   // net.js hides these once we've been online
        });
      }
      start();
      return api;
    },
    join(o) {
      let dead = false, conn = null, attempt = null;
      const peer = new Peer();
      const fail = t => { if (dead) return; dead = true; if (attempt) attempt.cancel(); try { peer.destroy(); } catch (e) {} if (o.onError) o.onError(t); };
      peer.on('open', () => {
        attempt = GameNet.join(peer, o.prefix + o.code, {
          code: o.code,
          onConn(c) {
            c.on('open', () => { if (dead || conn) return; conn = c; if (o.onOpen) o.onOpen(); });
            c.on('data', m => { if (!dead && c === conn && m && typeof m === 'object' && o.onData) o.onData(m); });
            c.on('close', () => { if (!dead && c === conn) { dead = true; try { peer.destroy(); } catch (e) {} if (o.onClose) o.onClose(); } });
            c.on('error', () => {});
          },
          onStatus(t) { if (!dead && o.onStatus) o.onStatus(t); },
          onFail: fail
        });
      });
      peer.on('error', err => {
        if (err.type === 'peer-unavailable') return;          // GameNet keeps looking
        if (conn) return;                                       // already playing: not fatal
        if (['network', 'server-error', 'browser-incompatible', 'socket-error'].includes(err.type)) fail(NET_ERR);
        else fail('Connection problem: ' + err.type);
      });
      return {
        send(m) { if (conn && conn.open) conn.send(m); },
        close() { dead = true; if (attempt) attempt.cancel(); try { conn && conn.close(); } catch (e) {} try { peer.destroy(); } catch (e) {} }
      };
    },
    shareUrl(code) { const u = new URL(location.href); u.search = '?room=' + code; u.hash = ''; return u.toString(); },
    param() { const r = new URLSearchParams(location.search).get('room'); return r ? r.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5) : null; },
    clearParam() { try { history.replaceState(null, '', location.pathname); } catch (e) {} }
  };
  Kit.copy = function (text, btn) {
    const done = () => { if (btn) { const o = btn.textContent; btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = o, 1500); } };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => prompt('Copy this link:', text));
    else prompt('Copy this link:', text);
  };
  Kit.share = async function (title, text, url, fallbackBtn) {
    if (navigator.share) { try { await navigator.share({ title, text, url }); } catch (e) {} }
    else Kit.copy(url, fallbackBtn);
  };

  /* ---------------- table: turn manager for 2-4 seats ----------------
     cfg = {
       prefix, social,
       game: {
         create(seats, settings) -> g        // g.turn (seat index), g.over (bool), g.ev (array of events)
         act(g, seat, action) -> error|null  // validates and applies; pushes events into g.ev
         bot(g, seat) -> action              // computer's next action
         auto(g, seat) -> action             // action used when an online player runs out of time
         pub(g) -> state                     // public state sent to everyone
       },
       onScreen(name, message)               // 'lobby' | 'room' | 'game'
       onRoom(info)                          // room seats changed
       onBegin(table)                        // a new game is starting (seats are final)
       onState(state, events, msLeft) -> Promise   // animate; table waits before the next state
       onSeats()                             // seat info changed mid-game (someone left)
       turnMs, botDelay(g)
     }
     Seat kinds: 'me' (this device), 'local' (pass & play), 'bot', 'remote' (host view), 'human' (guest view), 'open'
  ----------------------------------------------------------------- */
  const BOT_NAMES = ['Robo', 'Chip', 'Byte', 'Pixel', 'Nova', 'Bolt'];
  const BOT_AVATARS = ['🤖', '👾', '🦾', '🧠', '🛸', '⚡'];
  Kit.botProfile = i => ({ name: BOT_NAMES[i % BOT_NAMES.length], avatar: BOT_AVATARS[i % BOT_AVATARS.length] });

  Kit.Table = function (cfg) {
    const game = cfg.game, social = cfg.social;
    const t = {
      mode: null, seats: [], mine: new Set(), g: null, st: null, settings: null, code: null, you: 0,
      room: null, link: null, queue: [], busy: false, timer: null, deadline: 0, peers: new Map()
    };
    if (social) social.setSend(m => { if (t.mode === 'host' && t.room) t.room.broadcast(m); else if (t.mode === 'guest' && t.link) t.link.send(m); });

    function pubSeats() {
      return t.seats.map(s => ({ kind: s.kind === 'open' ? 'open' : s.kind === 'bot' ? 'bot' : 'human', name: s.name, avatar: s.avatar, sid: s.sid }));
    }
    function emitRoom() {
      if (cfg.onRoom) cfg.onRoom({ code: t.code, seats: t.mode === 'host' ? pubSeats() : t.seats, isHost: t.mode === 'host', you: t.mode === 'host' ? 0 : t.you, settings: t.settings });
    }
    function sendRoom() {
      if (t.mode !== 'host' || !t.room) return;
      const seats = pubSeats();
      t.seats.forEach((s, i) => { if (s.kind === 'remote') t.room.send(s.peer, { t: 'room', seats, you: i, settings: t.settings, code: t.code }); });
      emitRoom();
    }
    function stopAll() {
      clearTimeout(t.timer); t.queue.length = 0;
      if (t.room) t.room.close(); if (t.link) t.link.close();
      t.room = null; t.link = null; t.mode = null; t.g = null; t.st = null; t.peers.clear();
      if (social) social.setMode('off');
      Kit.Room.clearParam();
    }

    function begin() {
      clearTimeout(t.timer); t.queue.length = 0;
      t.g = game.create(t.seats.map(s => ({ name: s.name, avatar: s.avatar, kind: s.kind, sid: s.sid })), t.settings);
      if (cfg.onBegin) cfg.onBegin(t);
      cfg.onScreen('game');
      push();
    }
    function push() {
      const g = t.g, st = game.pub(g), ev = (g.ev || []).slice();
      g.ev = [];
      let left = 0;
      if (t.mode === 'host' && !g.over) {
        const s = t.seats[g.turn];
        if (s && s.kind !== 'bot') { left = cfg.turnMs || 30000; t.deadline = Date.now() + left; }
      }
      if (t.mode === 'host' && t.room) t.room.broadcast({ t: 'st', st, ev, left });
      enqueue({ st, ev, left });
    }
    function enqueue(item) { t.queue.push(item); if (!t.busy) drain(); }
    async function drain() {
      t.busy = true;
      while (t.queue.length) {
        const it = t.queue.shift();
        t.st = it.st;
        try { await cfg.onState(it.st, it.ev, it.left); } catch (e) { console.error(e); }
      }
      t.busy = false;
      if (cfg.onIdle) cfg.onIdle();
      schedule();
    }
    function schedule() {
      clearTimeout(t.timer);
      const g = t.g;
      if (!g || g.over || (t.mode !== 'host' && t.mode !== 'local')) return;
      const s = t.seats[g.turn]; if (!s) return;
      const turnAt = g.turn;
      if (s.kind === 'bot') {
        t.timer = setTimeout(() => {
          if (t.g !== g || g.turn !== turnAt || g.over) return;
          if (t.busy) return;
          const a = game.bot(g, turnAt); if (a) doAct(turnAt, a);
        }, cfg.botDelay ? cfg.botDelay(g) : 750);
      } else if (t.mode === 'host') {
        t.timer = setTimeout(() => {
          if (t.g !== g || g.turn !== turnAt || g.over) return;
          const a = game.auto(g, turnAt); if (a) doAct(turnAt, a);
        }, Math.max(900, t.deadline - Date.now()));
      }
    }
    function doAct(seat, a) {
      if (!t.g) return 'nogame';
      const err = game.act(t.g, seat, a);
      if (err) return err;
      push();
      return null;
    }

    /* ---------- local & vs computer ---------- */
    t.startLocal = function (seats, settings) {
      stopAll();
      t.mode = 'local'; t.settings = settings;
      t.seats = seats.map((s, i) => Object.assign({}, s, { sid: s.sid || (s.kind === 'me' && social ? social.me.sid : 'loc' + i + '-' + Kit.rand(1e6)) }));
      t.mine = new Set(t.seats.map((s, i) => (s.kind === 'me' || s.kind === 'local') ? i : -1).filter(i => i >= 0));
      if (social) {
        social.reset();
        const humans = t.seats.filter(s => s.kind === 'me' || s.kind === 'local').length;
        if (humans === 1) {
          social.setMode('bot');
          t.seats.forEach(s => { if (s.kind === 'bot') social.addBot({ sid: s.sid, name: s.name, avatar: s.avatar }); });
          social.sys('The computer players talk back — say hi!');
        } else social.setMode('off');
      }
      begin();
    };

    /* ---------- online host ---------- */
    t.host = function (settings, nSeats) {
      stopAll();
      t.mode = 'host'; t.settings = settings; t.code = null;
      t.seats = [{ kind: 'me', name: social ? social.me.name : 'Host', avatar: social ? social.me.avatar : '🙂', sid: social ? social.me.sid : 'host' }];
      for (let i = 1; i < nSeats; i++) t.seats.push({ kind: 'open' });
      t.mine = new Set([0]);
      if (social) { social.reset(); social.setMode('online'); }
      t.room = Kit.Room.host({
        prefix: cfg.prefix, max: nSeats - 1,
        onReady(code) { t.code = code; emitRoom(); },
        onJoin(peer) {
          const i = t.seats.findIndex(s => s.kind === 'open');
          if (i < 0 || t.g) { t.room.send(peer, { t: 'full' }); t.room.kick(peer); return; }
          t.seats[i] = { kind: 'remote', peer, name: 'Friend', avatar: '🙂', sid: null };
          t.peers.set(peer, i);
          sendRoom();
          if (Kit.sfx) Kit.sfx.pop();
        },
        onLeave(peer) {
          const i = t.peers.get(peer); t.peers.delete(peer);
          if (i == null) return;
          const s = t.seats[i];
          if (t.g) {
            const sid = s.sid || ('gone' + i);
            Object.assign(s, { kind: 'bot', peer: null, sid });
            if (social) { social.sys(s.name + ' left — the computer takes over'); social.addBot({ sid, name: s.name, avatar: s.avatar }, true); }
            t.room.broadcast({ t: 'seats', seats: pubSeats() });
            if (cfg.onSeats) cfg.onSeats();
            if (!t.busy) schedule();
          } else {
            if (social && s.sid) { social.sys(s.name + ' left the room'); social.removePerson(s.sid); }
            t.seats[i] = { kind: 'open' };
            sendRoom();
          }
        },
        onData(peer, msg) {
          if (typeof msg.t === 'string' && msg.t.slice(0, 2) === 's:') {
            if (msg.t === 's:hello') {
              const i = t.peers.get(peer);
              if (i != null) {
                const s = t.seats[i];
                s.name = Kit.clean(msg.name).slice(0, 16) || 'Friend';
                s.avatar = window.Social && Social.AVATARS.includes(msg.avatar) ? msg.avatar : '🙂';
                s.sid = String(msg.sid || '').slice(0, 32) || ('p' + i);
                if (t.g) { t.room.broadcast({ t: 'seats', seats: pubSeats() }); if (cfg.onSeats) cfg.onSeats(); } else sendRoom();
              }
            }
            if (social) social.handle(msg);
            t.room.broadcast(msg, peer);
            return;
          }
          if (msg.t === 'act' && t.g && !t.g.over) {
            const i = t.peers.get(peer);
            if (i != null && t.g.turn === i && t.seats[i].kind === 'remote') {
              const err = doAct(i, msg.a);
              if (err) t.room.send(peer, { t: 'nope', e: err });
            }
          }
          if (msg.t === 'again' && t.g && t.g.over && social) {
            const i = t.peers.get(peer); if (i != null) social.sys(t.seats[i].name + ' wants a rematch!');
          }
        },
        onError(text) { t.leave(text); }
      });
      cfg.onScreen('room');
      emitRoom();
    };
    t.openSeats = () => t.seats.filter(s => s.kind === 'open').length;
    t.joinedCount = () => t.seats.filter(s => s.kind === 'remote').length;
    t.startRoom = function (fillWithBots) {
      if (t.mode !== 'host') return 'not-host';
      let seats = t.seats.filter(s => s.kind !== 'open' || fillWithBots);
      if (seats.length < 2) return 'need-players';
      let b = 0;
      seats = seats.map(s => {
        if (s.kind !== 'open') return s;
        const p = Kit.botProfile(b++);
        return { kind: 'bot', name: p.name, avatar: p.avatar, sid: 'bot' + b + '-' + Kit.rand(1e6) };
      });
      t.seats = seats;
      t.peers.clear();
      seats.forEach((s, i) => { if (s.kind === 'remote') t.peers.set(s.peer, i); });
      t.room.locked = true;
      if (social) seats.forEach(s => { if (s.kind === 'bot') social.addBot({ sid: s.sid, name: s.name, avatar: s.avatar }, true); });
      const pub = pubSeats();
      seats.forEach((s, i) => { if (s.kind === 'remote') t.room.send(s.peer, { t: 'go', you: i, seats: pub, settings: t.settings }); });
      t.mine = new Set([0]);
      begin();
      return null;
    };
    t.rematch = function () {
      if (t.mode === 'guest') { if (t.link) t.link.send({ t: 'again' }); return 'asked'; }
      if (!t.g || !t.g.over) return 'busy';
      if (t.mode === 'host') {
        const pub = pubSeats();
        t.seats.forEach((s, i) => { if (s.kind === 'remote') t.room.send(s.peer, { t: 'go', you: i, seats: pub, settings: t.settings }); });
      }
      begin();
      return null;
    };

    /* ---------- online guest ---------- */
    t.join = function (code) {
      stopAll();
      t.mode = 'guest'; t.code = code; t.seats = []; t.you = -1;
      if (social) social.reset();
      t.link = Kit.Room.join({
        prefix: cfg.prefix, code,
        onStatus(text) { if (cfg.onJoinStatus) cfg.onJoinStatus(text); },
        onOpen() { Kit.Room.clearParam(); if (social) { social.setMode('online'); social.hello(); } cfg.onScreen('room'); emitRoom(); },
        onData(msg) {
          if (social && social.handle(msg)) return;
          switch (msg.t) {
            case 'full': t.leave('That room is full or the game already started.'); break;
            case 'room': t.seats = msg.seats || []; t.you = msg.you; t.settings = msg.settings; t.code = msg.code || t.code; emitRoom(); break;
            case 'seats': t.seats = msg.seats || t.seats; if (cfg.onSeats) cfg.onSeats(); break;
            case 'go':
              t.seats = msg.seats || t.seats; t.settings = msg.settings; t.you = msg.you; t.mine = new Set([msg.you]);
              t.queue.length = 0; t.g = null;
              if (cfg.onBegin) cfg.onBegin(t);
              cfg.onScreen('game');
              break;
            case 'st': enqueue({ st: msg.st, ev: msg.ev || [], left: msg.left || 0 }); break;
            case 'nope': if (Kit.sfx) Kit.sfx.bad(); break;
          }
        },
        onClose() { t.leave('The host left the game.'); },
        onError(text) { t.leave(text); }
      });
    };

    /* ---------- shared ---------- */
    t.act = function (a) {
      if (t.mode === 'guest') { if (t.link) t.link.send({ t: 'act', a }); return null; }
      const g = t.g; if (!g || g.over) return 'over';
      if (!t.mine.has(g.turn)) return 'turn';
      return doAct(g.turn, a);
    };
    t.canControl = seat => t.mine.has(seat);
    t.isMe = seat => t.mode !== 'local' ? t.mine.has(seat) : (t.seats[seat] && t.seats[seat].kind === 'me');
    t.seatInfo = i => {
      const s = t.seats[i] || {};
      return { name: s.name || 'Player', avatar: s.avatar || '🙂', sid: s.sid, bot: s.kind === 'bot', mine: t.mine.has(i), kind: s.kind };
    };
    t.driving = () => t.mode === 'host' || t.mode === 'local';   // this device runs the referee (and the bots)
    t.leave = function (message) {
      if (t.mode === 'guest' && t.link) { try { t.link.send({ t: 'bye' }); } catch (e) {} }
      stopAll();
      cfg.onScreen('lobby', message || '');
    };
    window.addEventListener('beforeunload', () => { if (t.room) t.room.close(); if (t.link) t.link.close(); });
    return t;
  };

  window.Kit = Kit;
})();
