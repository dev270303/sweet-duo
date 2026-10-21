/* =====================================================================
   net.js — makes online play survive real phones and real networks.
   Load it right after peerjs.min.js on every game page.

   What it fixes:
   1. Switching apps (e.g. to WhatsApp to share the code) used to drop the
      link to the connection service, and the games treated that as fatal —
      the room vanished and friends got "No game found". Now the page quietly
      reconnects with the SAME code when it comes back, and those dropped-link
      errors no longer close the room or end a game.
   2. Adds extra relay (TURN) servers, so phones on different networks —
      different mobile carriers, office Wi-Fi — can still reach each other.
   3. GameNet.join(): keeps looking for the room for ~30 seconds instead of
      giving up at the first miss, and says what actually went wrong.
   ===================================================================== */
(function () {
  'use strict';
  if (typeof window.Peer !== 'function') return;
  const Base = window.Peer;

  /* ---------- ICE servers (STUN finds your address, TURN relays when direct fails) ---------- */
  const ICE = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
    { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' }
  ];
  // Open Relay (metered.ca) free TURN with "static auth": short-lived credentials made from a public shared secret.
  const RELAY_HOST = 'staticauth.openrelay.metered.ca', RELAY_SECRET = 'openrelayprojectsecret';
  const relayReady = (async () => {
    try {
      if (!(window.crypto && crypto.subtle)) return;
      const user = (Math.floor(Date.now() / 1000) + 12 * 3600) + ':gameroom';
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey('raw', enc.encode(RELAY_SECRET), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
      const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(user)));
      let bin = ''; sig.forEach(b => bin += String.fromCharCode(b));
      ICE.push({
        urls: ['turn:' + RELAY_HOST + ':80', 'turn:' + RELAY_HOST + ':80?transport=tcp', 'turn:' + RELAY_HOST + ':443', 'turns:' + RELAY_HOST + ':443?transport=tcp'],
        username: user, credential: btoa(bin)
      });
    } catch (e) { /* relay is a bonus; the defaults still work */ }
  })();

  /* ---------- a Peer that reconnects instead of dying ---------- */
  const live = new Set();
  const QUIET = new Set(['network', 'server-error', 'socket-error', 'socket-closed', 'disconnected']);

  class GameRoomPeer extends Base {
    constructor(id, opts) {
      if (id && typeof id === 'object') { opts = id; id = undefined; }
      opts = Object.assign({ debug: 1 }, opts || {});
      opts.config = Object.assign({ iceServers: ICE.slice() }, opts.config || {});
      super(id, opts);
      this._wasOpen = false;
      this._lastRc = 0;
      this._rcTimer = null;
      live.add(this);
      this.on('open', () => { this._wasOpen = true; });
      this.on('disconnected', () => this._soon(1500));
      this.on('close', () => live.delete(this));
    }
    _soon(ms) {
      clearTimeout(this._rcTimer);
      this._rcTimer = setTimeout(() => this.reconnect(), ms);
    }
    reconnect() {
      if (this.destroyed || !this.disconnected) return;
      const now = Date.now();
      if (now - this._lastRc < 3000) { this._soon(3000 - (now - this._lastRc)); return; }
      this._lastRc = now;
      try { super.reconnect(); } catch (e) { /* not ready yet; try again later */ this._soon(4000); }
    }
    emit(ev, err, ...rest) {
      if (ev === 'error' && err && this._wasOpen) {
        // Losing the link to the connection service after we were online is not fatal:
        // games already in progress talk phone-to-phone, and the room code can be re-registered.
        if (QUIET.has(err.type)) { this._soon(2000); return false; }
        // Coming back after a pause can briefly find our own old code still "taken" — wait and retry, keep the code.
        if (err.type === 'unavailable-id') { this._soon(5000); return false; }
      }
      return super.emit(ev, err, ...rest);
    }
  }
  function wake() {
    live.forEach(p => { if (p.destroyed) live.delete(p); else if (p.disconnected) p.reconnect(); });
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
  window.addEventListener('online', wake);
  window.addEventListener('pageshow', wake);
  window.Peer = GameRoomPeer;

  /* ---------- GameNet.join: patient joining with honest messages ----------
     GameNet.join(peer, targetId, {
       code,                 // what the player typed, for messages
       onConn(conn),         // called for each attempt — attach your handlers (they only fire for the one that opens)
       onStatus(text),       // progress text for the lobby
       onFail(text)          // give up (show this message)
     }) -> { cancel() }
  ------------------------------------------------------------------------- */
  const GameNet = {
    ready: relayReady,
    join(peer, targetId, cb) {
      const code = cb.code || '';
      const SEARCH_MS = 32000, CONNECT_MS = 28000;
      const t0 = Date.now();
      let done = false, found = false, foundAt = 0, attempt = 0, current = null, poll = null, retryT = null;
      const status = t => { if (!done && cb.onStatus) cb.onStatus(t); };
      const finish = (ok, text) => {
        if (done) return; done = true;
        clearInterval(poll); clearTimeout(retryT); peer.off('error', onErr);
        if (!ok && cb.onFail) cb.onFail(text);
      };
      function tryOnce() {
        if (done) return;
        attempt++;
        const c = peer.connect(targetId, { reliable: true });
        current = c;
        c.on('open', () => { if (c === current) finish(true); });
        if (cb.onConn) cb.onConn(c);
      }
      function onErr(err) {
        if (done || !err) return;
        if (err.type === 'peer-unavailable') {
          if (Date.now() - t0 > SEARCH_MS) {
            finish(false, 'No game found with code ' + code + '. Check the code, make sure you\'re both in the same game, and ask your friend to keep the game screen open while you join.');
            return;
          }
          status(attempt < 2 ? 'Looking for game ' + code + '…' : 'Still looking for ' + code + '… ask your friend to open the game screen');
          clearTimeout(retryT);
          retryT = setTimeout(tryOnce, 2500);
        }
      }
      peer.on('error', onErr);
      poll = setInterval(() => {
        if (done) return;
        const pc = current && current.peerConnection;
        if (pc && pc.remoteDescription && !found) { found = true; foundAt = Date.now(); status('Found the game — connecting…'); }
        const ice = pc && (pc.iceConnectionState || pc.connectionState);
        if (found && (ice === 'failed' || Date.now() - foundAt > CONNECT_MS)) {
          finish(false, 'Found your friend\'s game, but your two networks couldn\'t link up. Try again — and if it keeps failing, switch one phone between Wi-Fi and mobile data.');
        } else if (!found && Date.now() - t0 > SEARCH_MS + 4000) {
          finish(false, 'Your friend\'s phone didn\'t answer. Ask them to keep the game screen open (not minimised) while you join, then try again.');
        }
      }, 500);
      status('Looking for game ' + code + '…');
      tryOnce();
      return { cancel() { finish(true); } };
    }
  };
  window.GameNet = GameNet;
})();
